-- ============================================================
-- FULL KV → RELATIONAL MIGRATION
-- Run in Neon SQL editor. Idempotent (safe to run multiple times).
-- Migrates: organizations, org memberships, submissions,
--           evidence, inline edits, jury assignments, jury votes.
-- ============================================================

DO $$
DECLARE
  -- Org migration
  v_all_orgs jsonb;
  v_org_kv_id text;
  v_org jsonb;
  v_org_new_uuid uuid;
  v_member_username text;
  v_member_id uuid;
  v_is_founder boolean;

  -- Submission migration
  v_all_submissions jsonb;
  v_sub_id text;
  v_sub jsonb;
  v_new_uuid uuid;
  v_submitted_by_id uuid;
  v_di_partner_id uuid;
  v_org_uuid uuid;
  v_username text;
  v_user_id uuid;
  v_vote_key text;
  v_vote jsonb;
  v_evidence jsonb;
  v_inline_edit jsonb;
  v_idx integer;
  v_accepted_at_map jsonb;
  v_accepted boolean;
  v_accepted_at timestamptz;

  -- counters
  c_orgs integer := 0;
  c_memberships integer := 0;
  c_submissions integer := 0;
  c_evidence integer := 0;
  c_inline_edits integer := 0;
  c_jury_assignments integer := 0;
  c_jury_votes integer := 0;
  c_skipped_subs integer := 0;
  c_skipped_users integer := 0;
BEGIN

  -- ============================================================
  -- PHASE 1: MIGRATE ORGANIZATIONS
  -- ============================================================
  SELECT value::jsonb INTO v_all_orgs
    FROM kv_store WHERE key = 'ta-o-v5';

  IF v_all_orgs IS NULL THEN
    RAISE NOTICE 'No org data found in KV store (ta-o-v5).';
  ELSE
    RAISE NOTICE 'Found % organizations to migrate.', (SELECT count(*) FROM jsonb_each(v_all_orgs));

    FOR v_org_kv_id, v_org IN SELECT * FROM jsonb_each(v_all_orgs)
    LOOP
      -- Check if org already exists by name
      SELECT id INTO v_org_new_uuid FROM organizations WHERE name = (v_org->>'name');
      IF v_org_new_uuid IS NOT NULL THEN
        RAISE NOTICE 'SKIP org "%": already exists with UUID %', v_org->>'name', v_org_new_uuid;
      ELSE
        v_org_new_uuid := gen_random_uuid();
        INSERT INTO organizations (
          id, name, description, charter, is_general_public, created_at
        ) VALUES (
          v_org_new_uuid,
          v_org->>'name',
          v_org->>'description',
          v_org->>'charter',
          COALESCE((v_org->>'isGeneralPublic')::boolean, false),
          CASE WHEN v_org->>'createdAt' IS NOT NULL
               THEN (v_org->>'createdAt')::timestamptz
               ELSE now() END
        );
        c_orgs := c_orgs + 1;
        RAISE NOTICE 'OK org "%" -> UUID %', v_org->>'name', v_org_new_uuid;
      END IF;

      -- Migrate members
      IF v_org->'members' IS NOT NULL AND jsonb_typeof(v_org->'members') = 'array' THEN
        FOR v_member_username IN SELECT jsonb_array_elements_text(v_org->'members')
        LOOP
          SELECT id INTO v_member_id FROM users WHERE lower(username) = lower(v_member_username);
          IF v_member_id IS NULL THEN
            RAISE NOTICE 'WARN: member "%" not found for org "%"', v_member_username, v_org->>'name';
            CONTINUE;
          END IF;

          -- Check if this user is a founder
          v_is_founder := false;
          IF v_org->'founders' IS NOT NULL AND jsonb_typeof(v_org->'founders') = 'array' THEN
            SELECT EXISTS(
              SELECT 1 FROM jsonb_array_elements_text(v_org->'founders') f
               WHERE lower(f) = lower(v_member_username)
            ) INTO v_is_founder;
          END IF;
          -- createdBy is also a founder
          IF lower(COALESCE(v_org->>'createdBy', '')) = lower(v_member_username) THEN
            v_is_founder := true;
          END IF;

          INSERT INTO organization_members (org_id, user_id, is_founder, is_active)
          VALUES (v_org_new_uuid, v_member_id, v_is_founder, true)
          ON CONFLICT (org_id, user_id) DO NOTHING;
          c_memberships := c_memberships + 1;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  RAISE NOTICE '--- Phase 1 done: % orgs, % memberships ---', c_orgs, c_memberships;

  -- ============================================================
  -- PHASE 2: MIGRATE SUBMISSIONS
  -- ============================================================
  SELECT value::jsonb INTO v_all_submissions
    FROM kv_store WHERE key = 'ta-s-v5';

  IF v_all_submissions IS NULL THEN
    RAISE NOTICE 'No submission data found in KV store (ta-s-v5). Aborting phase 2.';
  ELSE
    RAISE NOTICE 'Found % submissions to migrate.', (SELECT count(*) FROM jsonb_each(v_all_submissions));

    FOR v_sub_id, v_sub IN SELECT * FROM jsonb_each(v_all_submissions)
    LOOP
      v_new_uuid := gen_random_uuid();

      -- Resolve submittedBy -> user ID
      v_submitted_by_id := NULL;
      v_username := v_sub->>'submittedBy';
      IF v_username IS NULL OR v_username = '' THEN
        RAISE NOTICE 'SKIP submission (KV id: %): no submittedBy.', v_sub_id;
        c_skipped_subs := c_skipped_subs + 1;
        CONTINUE;
      END IF;
      SELECT id INTO v_submitted_by_id FROM users WHERE lower(username) = lower(v_username);
      IF v_submitted_by_id IS NULL THEN
        RAISE NOTICE 'SKIP submission (KV id: %): submitter "%" not found.', v_sub_id, v_username;
        c_skipped_subs := c_skipped_subs + 1;
        CONTINUE;
      END IF;

      -- Resolve org by NAME (KV orgIds are not UUIDs)
      v_org_uuid := NULL;
      IF v_sub->>'orgName' IS NOT NULL AND v_sub->>'orgName' <> '' THEN
        SELECT id INTO v_org_uuid FROM organizations WHERE name = (v_sub->>'orgName');
      END IF;
      IF v_org_uuid IS NULL THEN
        RAISE NOTICE 'SKIP submission (KV id: %): org "%" not found.', v_sub_id, v_sub->>'orgName';
        c_skipped_subs := c_skipped_subs + 1;
        CONTINUE;
      END IF;

      -- Resolve diPartner -> user ID
      v_di_partner_id := NULL;
      v_username := v_sub->>'diPartner';
      IF v_username IS NOT NULL AND v_username <> '' AND v_username <> 'null' THEN
        SELECT id INTO v_di_partner_id FROM users WHERE lower(username) = lower(v_username);
        IF v_di_partner_id IS NULL THEN
          RAISE NOTICE 'WARN: diPartner "%" not found for sub %. Setting to NULL.', v_username, v_sub_id;
        END IF;
      END IF;

      -- Insert submission
      BEGIN
        INSERT INTO submissions (
          id, submission_type, status, url, original_headline, replacement,
          reasoning, author, submitted_by, org_id, trusted_skip, is_di,
          di_partner_id, jury_seed, jury_seats, cross_group_seed,
          deliberate_lie_finding, survival_count, created_at, resolved_at
        ) VALUES (
          v_new_uuid,
          (COALESCE(v_sub->>'submissionType', 'correction'))::submission_type,
          (COALESCE(v_sub->>'status', 'pending_review'))::submission_status,
          v_sub->>'url',
          LEFT(v_sub->>'originalHeadline', 500),
          LEFT(v_sub->>'replacement', 500),
          v_sub->>'reasoning',
          LEFT(v_sub->>'author', 200),
          v_submitted_by_id,
          v_org_uuid,
          COALESCE((v_sub->>'trustedSkip')::boolean, false),
          COALESCE((v_sub->>'isDI')::boolean, false),
          v_di_partner_id,
          (v_sub->>'jurySeed')::bigint,
          (v_sub->>'jurySeats')::integer,
          (v_sub->>'crossGroupSeed')::integer,
          COALESCE((v_sub->>'deliberateLieFinding')::boolean, false),
          COALESCE((v_sub->>'survivalCount')::integer, 0),
          CASE WHEN v_sub->>'createdAt' IS NOT NULL
               THEN (v_sub->>'createdAt')::timestamptz
               ELSE now() END,
          CASE WHEN v_sub->>'resolvedAt' IS NOT NULL AND v_sub->>'resolvedAt' <> ''
               THEN (v_sub->>'resolvedAt')::timestamptz
               ELSE NULL END
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'ERR inserting sub (KV id: %): %', v_sub_id, SQLERRM;
        c_skipped_subs := c_skipped_subs + 1;
        CONTINUE;
      END;

      c_submissions := c_submissions + 1;
      RAISE NOTICE 'OK sub % @% -> "%" [%]', v_new_uuid, v_sub->>'submittedBy', v_sub->>'orgName', v_sub->>'status';

      -- Evidence
      IF v_sub->'evidence' IS NOT NULL AND jsonb_typeof(v_sub->'evidence') = 'array' THEN
        v_idx := 0;
        FOR v_evidence IN SELECT * FROM jsonb_array_elements(v_sub->'evidence')
        LOOP
          IF v_evidence->>'url' IS NOT NULL AND v_evidence->>'url' <> '' THEN
            INSERT INTO submission_evidence (submission_id, url, explanation, sort_order)
            VALUES (v_new_uuid, v_evidence->>'url', COALESCE(v_evidence->>'explanation', ''), v_idx);
            c_evidence := c_evidence + 1;
          END IF;
          v_idx := v_idx + 1;
        END LOOP;
      END IF;

      -- Inline edits
      IF v_sub->'inlineEdits' IS NOT NULL AND jsonb_typeof(v_sub->'inlineEdits') = 'array' THEN
        v_idx := 0;
        FOR v_inline_edit IN SELECT * FROM jsonb_array_elements(v_sub->'inlineEdits')
        LOOP
          IF v_inline_edit->>'original' IS NOT NULL AND v_inline_edit->>'original' <> '' THEN
            INSERT INTO submission_inline_edits (
              submission_id, original_text, replacement_text, reasoning, approved, sort_order
            ) VALUES (
              v_new_uuid,
              v_inline_edit->>'original',
              COALESCE(v_inline_edit->>'replacement', ''),
              v_inline_edit->>'reasoning',
              CASE WHEN v_inline_edit->>'approved' IS NOT NULL
                   THEN (v_inline_edit->>'approved')::boolean ELSE NULL END,
              v_idx
            );
            c_inline_edits := c_inline_edits + 1;
          END IF;
          v_idx := v_idx + 1;
        END LOOP;
      END IF;

      -- Helper data
      v_accepted_at_map := COALESCE(v_sub->'acceptedAt', '{}'::jsonb);

      -- In-group jury assignments
      IF v_sub->'jurors' IS NOT NULL AND jsonb_typeof(v_sub->'jurors') = 'array' THEN
        FOR v_username IN SELECT jsonb_array_elements_text(v_sub->'jurors')
        LOOP
          SELECT id INTO v_user_id FROM users WHERE lower(username) = lower(v_username);
          IF v_user_id IS NULL THEN
            c_skipped_users := c_skipped_users + 1;
            CONTINUE;
          END IF;

          v_accepted := FALSE;
          IF v_sub->'acceptedJurors' IS NOT NULL AND jsonb_typeof(v_sub->'acceptedJurors') = 'array' THEN
            SELECT EXISTS(
              SELECT 1 FROM jsonb_array_elements_text(v_sub->'acceptedJurors') aj
               WHERE lower(aj) = lower(v_username)
            ) INTO v_accepted;
          END IF;

          v_accepted_at := NULL;
          IF v_accepted AND v_accepted_at_map ? v_username THEN
            BEGIN
              v_accepted_at := (v_accepted_at_map->>v_username)::timestamptz;
            EXCEPTION WHEN OTHERS THEN v_accepted_at := NULL;
            END;
          END IF;

          INSERT INTO jury_assignments (
            submission_id, dispute_id, concession_id, user_id, role,
            in_pool, accepted, accepted_at
          ) VALUES (
            v_new_uuid, NULL, NULL, v_user_id, 'in_group'::jury_role,
            TRUE, v_accepted, v_accepted_at
          ) ON CONFLICT (submission_id, dispute_id, concession_id, user_id, role) DO NOTHING;
          c_jury_assignments := c_jury_assignments + 1;
        END LOOP;
      END IF;

      -- Cross-group jury assignments
      IF v_sub->'crossGroupJurors' IS NOT NULL AND jsonb_typeof(v_sub->'crossGroupJurors') = 'array' THEN
        FOR v_username IN SELECT jsonb_array_elements_text(v_sub->'crossGroupJurors')
        LOOP
          SELECT id INTO v_user_id FROM users WHERE lower(username) = lower(v_username);
          IF v_user_id IS NULL THEN
            c_skipped_users := c_skipped_users + 1;
            CONTINUE;
          END IF;

          v_accepted := FALSE;
          IF v_sub->'crossGroupAcceptedJurors' IS NOT NULL AND jsonb_typeof(v_sub->'crossGroupAcceptedJurors') = 'array' THEN
            SELECT EXISTS(
              SELECT 1 FROM jsonb_array_elements_text(v_sub->'crossGroupAcceptedJurors') aj
               WHERE lower(aj) = lower(v_username)
            ) INTO v_accepted;
          END IF;

          v_accepted_at := NULL;
          IF v_accepted AND v_sub->'crossGroupAcceptedAt' IS NOT NULL AND (v_sub->'crossGroupAcceptedAt') ? v_username THEN
            BEGIN
              v_accepted_at := (v_sub->'crossGroupAcceptedAt'->>v_username)::timestamptz;
            EXCEPTION WHEN OTHERS THEN v_accepted_at := NULL;
            END;
          END IF;

          INSERT INTO jury_assignments (
            submission_id, dispute_id, concession_id, user_id, role,
            in_pool, accepted, accepted_at
          ) VALUES (
            v_new_uuid, NULL, NULL, v_user_id, 'cross_group'::jury_role,
            TRUE, v_accepted, v_accepted_at
          ) ON CONFLICT (submission_id, dispute_id, concession_id, user_id, role) DO NOTHING;
          c_jury_assignments := c_jury_assignments + 1;
        END LOOP;
      END IF;

      -- In-group votes
      IF v_sub->'votes' IS NOT NULL AND jsonb_typeof(v_sub->'votes') = 'object' THEN
        FOR v_vote_key, v_vote IN SELECT * FROM jsonb_each(v_sub->'votes')
        LOOP
          SELECT id INTO v_user_id FROM users WHERE lower(username) = lower(v_vote_key);
          IF v_user_id IS NULL THEN
            c_skipped_users := c_skipped_users + 1;
            CONTINUE;
          END IF;

          INSERT INTO jury_votes (
            submission_id, dispute_id, concession_id, user_id, role,
            approve, note, deliberate_lie, newsworthy, interesting, voted_at
          ) VALUES (
            v_new_uuid, NULL, NULL, v_user_id, 'in_group'::jury_role,
            COALESCE((v_vote->>'approve')::boolean, false),
            NULLIF(v_vote->>'note', ''),
            COALESCE((v_vote->>'deliberateLie')::boolean, false),
            (v_vote->>'newsworthy')::smallint,
            (v_vote->>'interesting')::smallint,
            CASE WHEN v_vote->>'time' IS NOT NULL AND v_vote->>'time' <> ''
                 THEN (v_vote->>'time')::timestamptz ELSE now() END
          ) ON CONFLICT (submission_id, dispute_id, concession_id, user_id, role) DO NOTHING;
          c_jury_votes := c_jury_votes + 1;
        END LOOP;
      END IF;

      -- Cross-group votes
      IF v_sub->'crossGroupVotes' IS NOT NULL AND jsonb_typeof(v_sub->'crossGroupVotes') = 'object' THEN
        FOR v_vote_key, v_vote IN SELECT * FROM jsonb_each(v_sub->'crossGroupVotes')
        LOOP
          SELECT id INTO v_user_id FROM users WHERE lower(username) = lower(v_vote_key);
          IF v_user_id IS NULL THEN
            c_skipped_users := c_skipped_users + 1;
            CONTINUE;
          END IF;

          INSERT INTO jury_votes (
            submission_id, dispute_id, concession_id, user_id, role,
            approve, note, deliberate_lie, newsworthy, interesting, voted_at
          ) VALUES (
            v_new_uuid, NULL, NULL, v_user_id, 'cross_group'::jury_role,
            COALESCE((v_vote->>'approve')::boolean, false),
            NULLIF(v_vote->>'note', ''),
            COALESCE((v_vote->>'deliberateLie')::boolean, false),
            (v_vote->>'newsworthy')::smallint,
            (v_vote->>'interesting')::smallint,
            CASE WHEN v_vote->>'time' IS NOT NULL AND v_vote->>'time' <> ''
                 THEN (v_vote->>'time')::timestamptz ELSE now() END
          ) ON CONFLICT (submission_id, dispute_id, concession_id, user_id, role) DO NOTHING;
          c_jury_votes := c_jury_votes + 1;
        END LOOP;
      END IF;

    END LOOP;
  END IF;

  -- ============================================================
  -- REPORT
  -- ============================================================
  RAISE NOTICE '========================================';
  RAISE NOTICE '=== MIGRATION COMPLETE ===';
  RAISE NOTICE 'Organizations:          %', c_orgs;
  RAISE NOTICE 'Org memberships:        %', c_memberships;
  RAISE NOTICE 'Submissions migrated:   %', c_submissions;
  RAISE NOTICE 'Submissions skipped:    %', c_skipped_subs;
  RAISE NOTICE 'Evidence rows:          %', c_evidence;
  RAISE NOTICE 'Inline edit rows:       %', c_inline_edits;
  RAISE NOTICE 'Jury assignment rows:   %', c_jury_assignments;
  RAISE NOTICE 'Jury vote rows:         %', c_jury_votes;
  RAISE NOTICE 'Skipped user lookups:   %', c_skipped_users;
  RAISE NOTICE '========================================';
END;
$$;

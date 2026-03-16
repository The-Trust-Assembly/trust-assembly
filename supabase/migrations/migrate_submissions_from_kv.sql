DO $$
DECLARE
  v_all_submissions jsonb;
  v_sub_id text;
  v_sub jsonb;
  v_new_uuid uuid;
  v_submitted_by_id uuid;
  v_di_partner_id uuid;
  v_username text;
  v_user_id uuid;
  v_vote_key text;
  v_vote jsonb;
  v_evidence jsonb;
  v_inline_edit jsonb;
  v_idx integer;
  v_accepted_at_map jsonb;
  v_in_pool boolean;
  v_accepted boolean;
  v_accepted_at timestamptz;
  v_jury_pool jsonb;
  v_cross_jury_pool jsonb;

  -- counters
  c_submissions integer := 0;
  c_evidence integer := 0;
  c_inline_edits integer := 0;
  c_jury_assignments integer := 0;
  c_jury_votes integer := 0;
  c_skipped_users integer := 0;
  c_skipped_subs integer := 0;
BEGIN
  -- 1. Read the JSON blob from kv_store
  SELECT value::jsonb INTO v_all_submissions
    FROM kv_store
   WHERE key = 'ta-s-v5';

  IF v_all_submissions IS NULL THEN
    RAISE NOTICE 'No data found for key ta-s-v5 in kv_store. Aborting.';
    RETURN;
  END IF;

  RAISE NOTICE 'Found % submissions to migrate.', (SELECT count(*) FROM jsonb_each(v_all_submissions));

  -- 2. Loop over each submission
  FOR v_sub_id, v_sub IN SELECT * FROM jsonb_each(v_all_submissions)
  LOOP
    -- Generate a new UUID for this submission (old KV IDs are not UUID-compatible)
    v_new_uuid := gen_random_uuid();

    -- 3. Resolve submittedBy -> user ID
    v_submitted_by_id := NULL;
    v_username := v_sub->>'submittedBy';
    IF v_username IS NOT NULL AND v_username <> '' THEN
      SELECT id INTO v_submitted_by_id FROM users WHERE lower(username) = lower(v_username);
      IF v_submitted_by_id IS NULL THEN
        RAISE NOTICE 'SKIP submission % (old KV id: %): submittedBy user "%" not found.', v_new_uuid, v_sub_id, v_username;
        c_skipped_subs := c_skipped_subs + 1;
        CONTINUE;
      END IF;
    ELSE
      RAISE NOTICE 'SKIP submission (old KV id: %): no submittedBy.', v_sub_id;
      c_skipped_subs := c_skipped_subs + 1;
      CONTINUE;
    END IF;

    -- 4. Resolve diPartner -> user ID
    v_di_partner_id := NULL;
    v_username := v_sub->>'diPartner';
    IF v_username IS NOT NULL AND v_username <> '' AND v_username <> 'null' THEN
      SELECT id INTO v_di_partner_id FROM users WHERE lower(username) = lower(v_username);
      IF v_di_partner_id IS NULL THEN
        RAISE NOTICE 'WARN: diPartner user "%" not found for submission %. Setting to NULL.', v_username, v_sub_id;
      END IF;
    END IF;

    -- 5. Insert into submissions
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
        (v_sub->>'orgId')::uuid,
        COALESCE((v_sub->>'trustedSkip')::boolean, false),
        COALESCE((v_sub->>'isDI')::boolean, false),
        v_di_partner_id,
        (v_sub->>'jurySeed')::integer,
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
      RAISE NOTICE 'ERR inserting submission (old KV id: %): %', v_sub_id, SQLERRM;
      c_skipped_subs := c_skipped_subs + 1;
      CONTINUE;
    END;

    c_submissions := c_submissions + 1;
    RAISE NOTICE 'OK submission % (old: %) @% -> % [%]', v_new_uuid, v_sub_id, v_sub->>'submittedBy', v_sub->>'orgName', v_sub->>'status';

    -- 6. Insert evidence entries
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

    -- 7. Insert inline edits
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
            CASE WHEN v_inline_edit->>'approved' IS NOT NULL THEN (v_inline_edit->>'approved')::boolean ELSE NULL END,
            v_idx
          );
          c_inline_edits := c_inline_edits + 1;
        END IF;
        v_idx := v_idx + 1;
      END LOOP;
    END IF;

    -- Pre-fetch helper data
    v_accepted_at_map := COALESCE(v_sub->'acceptedAt', '{}'::jsonb);
    v_jury_pool := v_sub->'juryPool';
    v_cross_jury_pool := v_sub->'crossGroupJuryPool';

    -- 8. Insert in-group jury assignments from jurors array
    IF v_sub->'jurors' IS NOT NULL AND jsonb_typeof(v_sub->'jurors') = 'array' THEN
      FOR v_username IN SELECT jsonb_array_elements_text(v_sub->'jurors')
      LOOP
        SELECT id INTO v_user_id FROM users WHERE lower(username) = lower(v_username);
        IF v_user_id IS NULL THEN
          RAISE NOTICE 'WARN: in-group juror "%" not found for submission %.', v_username, v_sub_id;
          c_skipped_users := c_skipped_users + 1;
          CONTINUE;
        END IF;

        -- Determine if accepted
        v_accepted := FALSE;
        IF v_sub->'acceptedJurors' IS NOT NULL AND jsonb_typeof(v_sub->'acceptedJurors') = 'array' THEN
          SELECT EXISTS(
            SELECT 1 FROM jsonb_array_elements_text(v_sub->'acceptedJurors') aj
             WHERE lower(aj) = lower(v_username)
          ) INTO v_accepted;
        END IF;

        -- Determine accepted_at
        v_accepted_at := NULL;
        IF v_accepted AND v_accepted_at_map ? v_username THEN
          BEGIN
            v_accepted_at := (v_accepted_at_map->>v_username)::timestamptz;
          EXCEPTION WHEN OTHERS THEN
            v_accepted_at := NULL;
          END;
        END IF;

        -- Determine if in jury pool
        v_in_pool := TRUE;  -- default: all jurors are in the pool

        INSERT INTO jury_assignments (
          submission_id, dispute_id, concession_id, user_id, role,
          in_pool, accepted, accepted_at
        ) VALUES (
          v_new_uuid, NULL, NULL, v_user_id, 'in_group'::jury_role,
          v_in_pool, v_accepted, v_accepted_at
        ) ON CONFLICT (submission_id, dispute_id, concession_id, user_id, role) DO NOTHING;

        c_jury_assignments := c_jury_assignments + 1;
      END LOOP;
    END IF;

    -- 9. Insert cross-group jury assignments
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
          EXCEPTION WHEN OTHERS THEN
            v_accepted_at := NULL;
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

    -- 10. Insert in-group votes
    IF v_sub->'votes' IS NOT NULL AND jsonb_typeof(v_sub->'votes') = 'object' THEN
      FOR v_vote_key, v_vote IN SELECT * FROM jsonb_each(v_sub->'votes')
      LOOP
        SELECT id INTO v_user_id FROM users WHERE lower(username) = lower(v_vote_key);
        IF v_user_id IS NULL THEN
          RAISE NOTICE 'WARN: voter "%" not found for submission %.', v_vote_key, v_sub_id;
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
               THEN (v_vote->>'time')::timestamptz
               ELSE now() END
        ) ON CONFLICT (submission_id, dispute_id, concession_id, user_id, role) DO NOTHING;

        c_jury_votes := c_jury_votes + 1;
      END LOOP;
    END IF;

    -- 11. Insert cross-group votes
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
               THEN (v_vote->>'time')::timestamptz
               ELSE now() END
        ) ON CONFLICT (submission_id, dispute_id, concession_id, user_id, role) DO NOTHING;

        c_jury_votes := c_jury_votes + 1;
      END LOOP;
    END IF;

  END LOOP;

  -- 12. Report
  RAISE NOTICE '=== Migration Complete ===';
  RAISE NOTICE 'Submissions migrated:   %', c_submissions;
  RAISE NOTICE 'Submissions skipped:    %', c_skipped_subs;
  RAISE NOTICE 'Evidence rows:          %', c_evidence;
  RAISE NOTICE 'Inline edit rows:       %', c_inline_edits;
  RAISE NOTICE 'Jury assignment rows:   %', c_jury_assignments;
  RAISE NOTICE 'Jury vote rows:         %', c_jury_votes;
  RAISE NOTICE 'Skipped user lookups:   %', c_skipped_users;
END;
$$;

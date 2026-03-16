// ============================================================
// Server-side vote resolution
// Called after a jury vote is recorded. Checks if a majority
// has been reached and, if so, resolves the submission:
//   - Updates submission status
//   - Applies reputation changes to the submitter
//   - Resolves inline edit verdicts
//   - Graduates linked vault entries
//   - Promotes to cross-group jury if in-group approved
//   - Tracks cross-group results on the originating org
// ============================================================

import { sql } from "@/lib/db";
import { getMajority, TRUSTED_STREAK, CROSS_GROUP_DECEPTION_MULT, isWildWestMode } from "@/lib/jury-rules";

interface VoteRow {
  approve: boolean;
  deliberate_lie: boolean;
  newsworthy: number | null;
  interesting: number | null;
  user_id: string;
}

interface ResolutionResult {
  resolved: boolean;
  outcome?: string;
  promotedToCrossGroup?: boolean;
}

/**
 * Attempt to resolve a submission after a vote is cast.
 * Returns whether the submission was resolved and what the outcome was.
 */
export async function tryResolveSubmission(
  submissionId: string,
  juryRole: string,
): Promise<ResolutionResult> {
  // Get submission with org info
  const subResult = await sql`
    SELECT s.*, o.name AS org_name,
      (SELECT COUNT(*) FROM organization_members WHERE org_id = s.org_id AND is_active = TRUE) AS member_count
    FROM submissions s
    JOIN organizations o ON o.id = s.org_id
    WHERE s.id = ${submissionId}
  `;
  if (subResult.rows.length === 0) return { resolved: false };
  const sub = subResult.rows[0] as {
    id: string; status: string; org_id: string; submitted_by: string;
    org_name: string; member_count: number; is_di: boolean; di_partner_id: string | null;
    cross_group_jury_size: number | null; jury_seats: number | null;
    cross_group_seed: number | null; deliberate_lie_finding: boolean;
  };

  const isCross = juryRole === "cross_group";

  // Count votes for this role
  const voteResult = await sql`
    SELECT approve, deliberate_lie, newsworthy, interesting, user_id
    FROM jury_votes
    WHERE submission_id = ${submissionId} AND role = ${juryRole}
  `;
  const votes = voteResult.rows as VoteRow[];
  const voteCount = votes.length;
  const approveCount = votes.filter(v => v.approve).length;
  const rejectCount = voteCount - approveCount;

  // Determine expected jury size from the submission metadata
  const expectedJurors = isCross
    ? (sub.cross_group_jury_size || 3)
    : (sub.jury_seats || 3);
  const majority = getMajority(expectedJurors);

  // Check if majority reached
  let resolved = false;
  let outcome: string | null = null;

  if (approveCount >= majority) {
    resolved = true;
    outcome = isCross ? "consensus" : "approved";
  } else if (rejectCount >= majority) {
    resolved = true;
    outcome = isCross ? "consensus_rejected" : "rejected";
  } else if (voteCount >= expectedJurors) {
    // All votes in — go with majority
    resolved = true;
    outcome = approveCount >= rejectCount
      ? (isCross ? "consensus" : "approved")
      : (isCross ? "consensus_rejected" : "rejected");
  }

  if (!resolved || !outcome) return { resolved: false };

  const now = new Date().toISOString();

  // Deliberate lie finding: secret majority of jurors flagged it
  // Disabled in Wild West mode (< 100 users)
  const wildWest = await isWildWestMode();
  const lieCount = votes.filter(v => v.deliberate_lie).length;
  const wasLie = !wildWest && lieCount > votes.length / 2;

  // ── TRANSACTION ──
  // Wrap the entire resolution pipeline in a database transaction.
  // If any step fails (timeout, constraint violation, connection drop),
  // all changes roll back and the system stays consistent.
  let promotedToCrossGroup = false;

  try {
    await sql`BEGIN`;

    // Update submission status
    await sql`
      UPDATE submissions
      SET status = ${outcome}, resolved_at = ${now}, deliberate_lie_finding = ${wasLie}
      WHERE id = ${submissionId}
    `;

    // Resolve inline edits independently
    await resolveInlineEdits(submissionId, votes);

    // Resolve linked vault entry survival votes
    if (outcome === "approved" || outcome === "consensus") {
      await resolveVaultSurvival(submissionId, votes, now);
      await graduateLinkedVaultEntries(submissionId, now);
    }

    // Reputation updates (in-group only — cross-group affects the org)
    if (!isCross) {
      await updateSubmitterReputation(sub, outcome, wasLie, votes, now);

      // Auto-promote to cross-group if in-group approved
      if (outcome === "approved") {
        promotedToCrossGroup = await promoteToCrossGroup(submissionId, sub.org_id, sub.submitted_by, now);
      }
    }

    // Track cross-group results on the originating org
    if (isCross) {
      await recordCrossGroupResult(sub, outcome, wasLie, now);
    }

    // Audit log
    await sql`
      INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata)
      VALUES (
        ${`Submission resolved: ${outcome.toUpperCase()}${wasLie ? " (DECEPTION FINDING)" : ""}`},
        ${sub.submitted_by}, ${sub.org_id}, 'submission', ${submissionId},
        ${JSON.stringify({ outcome, approveCount, rejectCount, voteCount, expectedJurors, wasLie })}
      )
    `;

    await sql`COMMIT`;
  } catch (e) {
    await sql`ROLLBACK`;
    console.error("Vote resolution transaction failed, rolled back:", e);
    throw e;
  }

  return { resolved: true, outcome, promotedToCrossGroup };
}

// ---- Inline Edit Resolution ----

async function resolveInlineEdits(
  submissionId: string,
  votes: VoteRow[],
): Promise<void> {
  const edits = await sql`
    SELECT id, sort_order FROM submission_inline_edits
    WHERE submission_id = ${submissionId}
    ORDER BY sort_order
  `;
  if (edits.rows.length === 0) return;

  // Get per-edit votes from the jury_votes metadata
  // For now, inline edit approval is based on the overall vote
  // (matching v5 behavior: each edit is independently majority-voted
  //  via editVotes stored in the vote note/metadata)
  // TODO: When migrating the frontend, store edit votes as separate
  // rows or in a JSONB column on jury_votes. For now, approve all
  // edits if the submission is approved.
  const totalVoters = votes.length;
  const approvalThreshold = totalVoters / 2;

  for (const edit of edits.rows) {
    // Default: edit approved if submission approved
    // This will be refined when edit-specific votes are stored server-side
    const editApproved = votes.filter(v => v.approve).length > approvalThreshold;
    await sql`
      UPDATE submission_inline_edits
      SET approved = ${editApproved}
      WHERE id = ${edit.id}
    `;
  }
}

// ---- Vault Entry Survival ----

async function resolveVaultSurvival(
  submissionId: string,
  votes: VoteRow[],
  now: string,
): Promise<void> {
  const linked = await sql`
    SELECT entry_type, entry_id FROM submission_linked_entries
    WHERE submission_id = ${submissionId}
  `;
  if (linked.rows.length === 0) return;

  // For linked vault entries, "still applies" = majority of voters agree
  // In v5 this uses vaultVotes per voter. For now, if submission is approved,
  // all linked entries survive. Will be refined with per-entry votes.
  const approveCount = votes.filter(v => v.approve).length;
  const stillApplies = approveCount > votes.length / 2;

  if (!stillApplies) return;

  for (const entry of linked.rows) {
    const table = getVaultTable(entry.entry_type);
    if (!table) continue;

    // Use parameterized query per table (safe — table name is from our enum, not user input)
    await sql.query(
      `UPDATE ${table} SET survival_count = survival_count + 1 WHERE id = $1`,
      [entry.entry_id],
    );
  }
}

// ---- Graduate Pending Vault Entries ----

async function graduateLinkedVaultEntries(
  submissionId: string,
  now: string,
): Promise<void> {
  // Graduate pending vault entries linked to this submission
  const tables = ["vault_entries", "arguments", "beliefs", "translations"];

  for (const table of tables) {
    await sql.query(
      `UPDATE ${table} SET status = 'approved', approved_at = $1 WHERE submission_id = $2 AND status = 'pending'`,
      [now, submissionId],
    );
  }
}

// ---- Submitter Reputation ----

async function updateSubmitterReputation(
  sub: { submitted_by: string; org_id: string; is_di: boolean; di_partner_id: string | null },
  outcome: string,
  wasLie: boolean,
  votes: VoteRow[],
  now: string,
): Promise<void> {
  // For DI submissions, reputation goes to the human partner
  const targetUserId = (sub.is_di && sub.di_partner_id) ? sub.di_partner_id : sub.submitted_by;

  if (outcome === "approved" || outcome === "consensus") {
    // Win: increment wins, streak, assembly streak
    await sql`
      UPDATE users SET
        total_wins = total_wins + 1,
        current_streak = current_streak + 1
      WHERE id = ${targetUserId}
    `;
    await sql`
      UPDATE organization_members SET
        assembly_streak = assembly_streak + 1
      WHERE org_id = ${sub.org_id} AND user_id = ${targetUserId} AND is_active = TRUE
    `;

    // Check for trusted contributor status
    const streakResult = await sql`
      SELECT assembly_streak FROM organization_members
      WHERE org_id = ${sub.org_id} AND user_id = ${targetUserId} AND is_active = TRUE
    `;
    if (streakResult.rows.length > 0 && streakResult.rows[0].assembly_streak === TRUSTED_STREAK) {
      await sql`
        INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id)
        VALUES ('Earned Trusted Contributor status', ${targetUserId}, ${sub.org_id}, 'user', ${targetUserId})
      `;
    }
  } else {
    // Loss: increment losses, reset streaks
    if (wasLie) {
      await sql`
        UPDATE users SET
          total_losses = total_losses + 1,
          current_streak = 0,
          deliberate_lies = deliberate_lies + 1,
          last_deception_finding = ${now}
        WHERE id = ${targetUserId}
      `;
    } else {
      await sql`
        UPDATE users SET
          total_losses = total_losses + 1,
          current_streak = 0
        WHERE id = ${targetUserId}
      `;
    }

    // Check if was trusted before resetting
    const streakResult = await sql`
      SELECT assembly_streak FROM organization_members
      WHERE org_id = ${sub.org_id} AND user_id = ${targetUserId} AND is_active = TRUE
    `;
    const wasTrusted = streakResult.rows.length > 0 && streakResult.rows[0].assembly_streak >= TRUSTED_STREAK;

    await sql`
      UPDATE organization_members SET assembly_streak = 0
      WHERE org_id = ${sub.org_id} AND user_id = ${targetUserId} AND is_active = TRUE
    `;

    if (wasTrusted) {
      await sql`
        INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id)
        VALUES ('Lost Trusted Contributor status', ${targetUserId}, ${sub.org_id}, 'user', ${targetUserId})
      `;
    }
  }

  // Store individual ratings
  for (const vote of votes) {
    if (vote.newsworthy && vote.interesting) {
      await sql`
        INSERT INTO user_ratings (user_id, submission_id, rated_by, newsworthy, interesting)
        VALUES (${targetUserId}, ${sub.submitted_by}, ${vote.user_id}, ${vote.newsworthy}, ${vote.interesting})
      `;
    }
  }

  // Record in review history
  await sql`
    INSERT INTO user_review_history (user_id, submission_id, outcome, from_di)
    VALUES (${targetUserId}, ${sub.submitted_by}, ${outcome}, ${sub.is_di})
  `;
}

// ---- Cross-Group Promotion ----

async function promoteToCrossGroup(
  submissionId: string,
  orgId: string,
  submittedBy: string,
  now: string,
): Promise<boolean> {
  // Count qualifying assemblies (those with 5+ members, excluding the origin)
  const qualifyingOrgs = await sql`
    SELECT o.id, COUNT(om.id) AS member_count
    FROM organizations o
    JOIN organization_members om ON om.org_id = o.id AND om.is_active = TRUE
    WHERE o.id != ${orgId}
    GROUP BY o.id
    HAVING COUNT(om.id) >= 5
  `;

  if (qualifyingOrgs.rows.length < 1) return false;

  // Select cross-group jurors from other assemblies
  // Pick members who are NOT in the submitter's org
  const crossPool = await sql`
    SELECT DISTINCT om.user_id
    FROM organization_members om
    WHERE om.org_id != ${orgId}
      AND om.is_active = TRUE
      AND om.user_id != ${submittedBy}
    ORDER BY RANDOM()
    LIMIT 15
  `;

  if (crossPool.rows.length < 3) return false;

  const crossJurySize = Math.min(crossPool.rows.length, 5);

  // Update submission for cross-group review
  await sql`
    UPDATE submissions SET
      status = 'cross_review',
      resolved_at = NULL,
      cross_group_jury_size = ${crossJurySize},
      cross_group_seed = ${Math.floor(Math.random() * 100000)}
    WHERE id = ${submissionId}
  `;

  // Create jury assignments for cross-group
  for (const juror of crossPool.rows.slice(0, crossJurySize * 3)) {
    await sql`
      INSERT INTO jury_assignments (submission_id, user_id, role, in_pool, accepted)
      VALUES (${submissionId}, ${juror.user_id}, 'cross_group', TRUE, FALSE)
      ON CONFLICT DO NOTHING
    `;
  }

  await sql`
    INSERT INTO audit_log (action, org_id, entity_type, entity_id, metadata)
    VALUES (
      'Promoted to cross-group review',
      ${orgId}, 'submission', ${submissionId},
      ${JSON.stringify({ qualifyingOrgs: qualifyingOrgs.rows.length, poolSize: crossPool.rows.length, jurySize: crossJurySize })}
    )
  `;

  return true;
}

// ---- Cross-Group Result Recording ----

async function recordCrossGroupResult(
  sub: { id: string; org_id: string; cross_group_jury_size: number | null; jury_seats: number | null },
  outcome: string,
  wasLie: boolean,
  now: string,
): Promise<void> {
  await sql`
    INSERT INTO cross_group_results (org_id, submission_id, outcome, jury_size, internal_jury_size, was_lie)
    VALUES (${sub.org_id}, ${sub.id}, ${outcome}, ${sub.cross_group_jury_size || 3}, ${sub.jury_seats || 3}, ${wasLie})
  `;

  if (wasLie) {
    await sql`
      UPDATE organizations SET
        cross_group_deception_findings = cross_group_deception_findings + 1
      WHERE id = ${sub.org_id}
    `;

    await sql`
      INSERT INTO audit_log (action, org_id, entity_type, entity_id, metadata)
      VALUES (
        ${`Cross-group deception finding — ${CROSS_GROUP_DECEPTION_MULT}× Assembly penalty`},
        ${sub.org_id}, 'submission', ${sub.id},
        ${JSON.stringify({ penalty: CROSS_GROUP_DECEPTION_MULT })}
      )
    `;
  }
}

// ---- Helpers ----

function getVaultTable(entryType: string): string | null {
  const map: Record<string, string> = {
    vault: "vault_entries",
    correction: "vault_entries",
    argument: "arguments",
    belief: "beliefs",
    translation: "translations",
  };
  return map[entryType] || null;
}


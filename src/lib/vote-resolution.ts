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
//
// IMPORTANT: Uses sql.connect() for a dedicated client connection.
// The sql`` tagged template (neon HTTP driver) creates a new
// stateless connection per call — BEGIN/COMMIT/ROLLBACK are no-ops.
// sql.connect() returns a persistent pooled client where transactions
// actually work.
// ============================================================

import { sql } from "@/lib/db";
import type { VercelPoolClient } from "@vercel/postgres";
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
  // ── Pre-transaction reads (stateless is fine) ──

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

  // ── TRANSACTION via dedicated client ──
  // sql.connect() returns a real pooled PostgreSQL client where
  // BEGIN/COMMIT/ROLLBACK actually work (unlike sql`` which is stateless HTTP).
  let promotedToCrossGroup = false;
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    // Update submission status
    await client.query(
      "UPDATE submissions SET status = $1, resolved_at = $2, deliberate_lie_finding = $3 WHERE id = $4",
      [outcome, now, wasLie, submissionId]
    );

    // Resolve inline edits independently
    await resolveInlineEdits(client, submissionId, votes);

    // Resolve linked vault entry survival votes
    if (outcome === "approved" || outcome === "consensus") {
      await resolveVaultSurvival(client, submissionId, votes);
      await graduateLinkedVaultEntries(client, submissionId, now);
    }

    // Reputation updates (in-group only — cross-group affects the org)
    if (!isCross) {
      await updateSubmitterReputation(client, submissionId, sub, outcome, wasLie, votes, now);

      // Auto-promote to cross-group if in-group approved
      if (outcome === "approved") {
        promotedToCrossGroup = await promoteToCrossGroup(client, submissionId, sub.org_id, sub.submitted_by, now);
      }
    }

    // Track cross-group results on the originating org
    if (isCross) {
      await recordCrossGroupResult(client, sub, outcome, wasLie, now);
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, 'submission', $4, $5)`,
      [
        `Submission resolved: ${outcome.toUpperCase()}${wasLie ? " (DECEPTION FINDING)" : ""}`,
        sub.submitted_by, sub.org_id, submissionId,
        JSON.stringify({ outcome, approveCount, rejectCount, voteCount, expectedJurors, wasLie }),
      ]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Vote resolution transaction failed, rolled back:", e);
    throw e;
  } finally {
    client.release();
  }

  return { resolved: true, outcome, promotedToCrossGroup };
}

// ---- Inline Edit Resolution ----

async function resolveInlineEdits(
  client: VercelPoolClient,
  submissionId: string,
  votes: VoteRow[],
): Promise<void> {
  const edits = await client.query(
    "SELECT id, sort_order FROM submission_inline_edits WHERE submission_id = $1 ORDER BY sort_order",
    [submissionId]
  );
  if (edits.rows.length === 0) return;

  const totalVoters = votes.length;
  const approvalThreshold = totalVoters / 2;

  for (const edit of edits.rows) {
    const editApproved = votes.filter(v => v.approve).length > approvalThreshold;
    await client.query(
      "UPDATE submission_inline_edits SET approved = $1 WHERE id = $2",
      [editApproved, edit.id]
    );
  }
}

// ---- Vault Entry Survival ----

async function resolveVaultSurvival(
  client: VercelPoolClient,
  submissionId: string,
  votes: VoteRow[],
): Promise<void> {
  const linked = await client.query(
    "SELECT entry_type, entry_id FROM submission_linked_entries WHERE submission_id = $1",
    [submissionId]
  );
  if (linked.rows.length === 0) return;

  const approveCount = votes.filter(v => v.approve).length;
  const stillApplies = approveCount > votes.length / 2;
  if (!stillApplies) return;

  for (const entry of linked.rows) {
    const table = getVaultTable(entry.entry_type);
    if (!table) continue;
    await client.query(
      `UPDATE ${table} SET survival_count = survival_count + 1 WHERE id = $1`,
      [entry.entry_id]
    );
  }
}

// ---- Graduate Pending Vault Entries ----

async function graduateLinkedVaultEntries(
  client: VercelPoolClient,
  submissionId: string,
  now: string,
): Promise<void> {
  const tables = ["vault_entries", "arguments", "beliefs", "translations"];
  for (const table of tables) {
    await client.query(
      `UPDATE ${table} SET status = 'approved', approved_at = $1 WHERE submission_id = $2 AND status = 'pending'`,
      [now, submissionId]
    );
  }
}

// ---- Submitter Reputation ----

async function updateSubmitterReputation(
  client: VercelPoolClient,
  submissionId: string,
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
    await client.query(
      "UPDATE users SET total_wins = total_wins + 1, current_streak = current_streak + 1 WHERE id = $1",
      [targetUserId]
    );
    await client.query(
      "UPDATE organization_members SET assembly_streak = assembly_streak + 1 WHERE org_id = $1 AND user_id = $2 AND is_active = TRUE",
      [sub.org_id, targetUserId]
    );

    // Check for trusted contributor status
    const streakResult = await client.query(
      "SELECT assembly_streak FROM organization_members WHERE org_id = $1 AND user_id = $2 AND is_active = TRUE",
      [sub.org_id, targetUserId]
    );
    if (streakResult.rows.length > 0 && streakResult.rows[0].assembly_streak === TRUSTED_STREAK) {
      await client.query(
        "INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id) VALUES ($1, $2, $3, 'user', $4)",
        ["Earned Trusted Contributor status", targetUserId, sub.org_id, targetUserId]
      );
    }
  } else {
    // Loss: increment losses, reset streaks
    if (wasLie) {
      await client.query(
        "UPDATE users SET total_losses = total_losses + 1, current_streak = 0, deliberate_lies = deliberate_lies + 1, last_deception_finding = $1 WHERE id = $2",
        [now, targetUserId]
      );
    } else {
      await client.query(
        "UPDATE users SET total_losses = total_losses + 1, current_streak = 0 WHERE id = $1",
        [targetUserId]
      );
    }

    // Check if was trusted before resetting
    const streakResult = await client.query(
      "SELECT assembly_streak FROM organization_members WHERE org_id = $1 AND user_id = $2 AND is_active = TRUE",
      [sub.org_id, targetUserId]
    );
    const wasTrusted = streakResult.rows.length > 0 && streakResult.rows[0].assembly_streak >= TRUSTED_STREAK;

    await client.query(
      "UPDATE organization_members SET assembly_streak = 0 WHERE org_id = $1 AND user_id = $2 AND is_active = TRUE",
      [sub.org_id, targetUserId]
    );

    if (wasTrusted) {
      await client.query(
        "INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id) VALUES ($1, $2, $3, 'user', $4)",
        ["Lost Trusted Contributor status", targetUserId, sub.org_id, targetUserId]
      );
    }
  }

  // Store individual ratings
  for (const vote of votes) {
    if (vote.newsworthy && vote.interesting) {
      await client.query(
        "INSERT INTO user_ratings (user_id, submission_id, rated_by, newsworthy, interesting) VALUES ($1, $2, $3, $4, $5)",
        [targetUserId, submissionId, vote.user_id, vote.newsworthy, vote.interesting]
      );
    }
  }

  // Record in review history
  await client.query(
    "INSERT INTO user_review_history (user_id, submission_id, outcome, from_di) VALUES ($1, $2, $3, $4)",
    [targetUserId, submissionId, outcome, sub.is_di]
  );
}

// ---- Cross-Group Promotion ----

async function promoteToCrossGroup(
  client: VercelPoolClient,
  submissionId: string,
  orgId: string,
  submittedBy: string,
  now: string,
): Promise<boolean> {
  // Count qualifying assemblies (those with 5+ members, excluding the origin)
  const qualifyingOrgs = await client.query(
    `SELECT o.id, COUNT(om.id) AS member_count
     FROM organizations o
     JOIN organization_members om ON om.org_id = o.id AND om.is_active = TRUE
     WHERE o.id != $1
     GROUP BY o.id
     HAVING COUNT(om.id) >= 5`,
    [orgId]
  );

  if (qualifyingOrgs.rows.length < 1) return false;

  // Select cross-group jurors from other assemblies
  const crossPool = await client.query(
    `SELECT DISTINCT om.user_id
     FROM organization_members om
     WHERE om.org_id != $1
       AND om.is_active = TRUE
       AND om.user_id != $2
     ORDER BY RANDOM()
     LIMIT 15`,
    [orgId, submittedBy]
  );

  if (crossPool.rows.length < 3) return false;

  const crossJurySize = Math.min(crossPool.rows.length, 5);

  // Update submission for cross-group review
  await client.query(
    `UPDATE submissions SET
       status = 'cross_review',
       resolved_at = NULL,
       cross_group_jury_size = $1,
       cross_group_seed = $2
     WHERE id = $3`,
    [crossJurySize, Math.floor(Math.random() * 100000), submissionId]
  );

  // Create jury assignments for cross-group
  for (const juror of crossPool.rows.slice(0, crossJurySize * 3)) {
    await client.query(
      `INSERT INTO jury_assignments (submission_id, user_id, role, in_pool, accepted)
       VALUES ($1, $2, 'cross_group', TRUE, FALSE)
       ON CONFLICT DO NOTHING`,
      [submissionId, juror.user_id]
    );
  }

  await client.query(
    `INSERT INTO audit_log (action, org_id, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'submission', $3, $4)`,
    [
      "Promoted to cross-group review",
      orgId, submissionId,
      JSON.stringify({ qualifyingOrgs: qualifyingOrgs.rows.length, poolSize: crossPool.rows.length, jurySize: crossJurySize }),
    ]
  );

  return true;
}

// ---- Cross-Group Result Recording ----

async function recordCrossGroupResult(
  client: VercelPoolClient,
  sub: { id: string; org_id: string; cross_group_jury_size: number | null; jury_seats: number | null },
  outcome: string,
  wasLie: boolean,
  now: string,
): Promise<void> {
  await client.query(
    `INSERT INTO cross_group_results (org_id, submission_id, outcome, jury_size, internal_jury_size, was_lie)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sub.org_id, sub.id, outcome, sub.cross_group_jury_size || 3, sub.jury_seats || 3, wasLie]
  );

  if (wasLie) {
    await client.query(
      "UPDATE organizations SET cross_group_deception_findings = cross_group_deception_findings + 1 WHERE id = $1",
      [sub.org_id]
    );

    await client.query(
      `INSERT INTO audit_log (action, org_id, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'submission', $3, $4)`,
      [
        `Cross-group deception finding — ${CROSS_GROUP_DECEPTION_MULT}× Assembly penalty`,
        sub.org_id, sub.id,
        JSON.stringify({ penalty: CROSS_GROUP_DECEPTION_MULT }),
      ]
    );
  }
}

// ============================================================
// Story Resolution
// Simpler than submission resolution: no reputation changes,
// no vault graduation, no inline edits. Just majority vote
// with cross-group promotion on approval.
// ============================================================

export async function tryResolveStory(
  storyId: string,
  juryRole: string,
): Promise<ResolutionResult> {
  // Get story
  const storyResult = await sql`
    SELECT st.*, o.name AS org_name
    FROM stories st
    JOIN organizations o ON o.id = st.org_id
    WHERE st.id = ${storyId}
  `;
  if (storyResult.rows.length === 0) return { resolved: false };
  const story = storyResult.rows[0] as {
    id: string; status: string; org_id: string; submitted_by: string;
    cross_group_jury_size: number | null; jury_seats: number | null;
  };

  const isCross = juryRole === "cross_group";

  // Count votes for this role
  const voteResult = await sql`
    SELECT approve, user_id
    FROM jury_votes
    WHERE story_id = ${storyId} AND role = ${juryRole}
  `;
  const votes = voteResult.rows as { approve: boolean; user_id: string }[];
  const voteCount = votes.length;
  const approveCount = votes.filter(v => v.approve).length;
  const rejectCount = voteCount - approveCount;

  const expectedJurors = isCross
    ? (story.cross_group_jury_size || 3)
    : (story.jury_seats || 3);
  const majority = getMajority(expectedJurors);

  let resolved = false;
  let outcome: string | null = null;

  if (approveCount >= majority) {
    resolved = true;
    outcome = isCross ? "consensus" : "approved";
  } else if (rejectCount >= majority) {
    resolved = true;
    outcome = isCross ? "consensus_rejected" : "rejected";
  } else if (voteCount >= expectedJurors) {
    resolved = true;
    outcome = approveCount >= rejectCount
      ? (isCross ? "consensus" : "approved")
      : (isCross ? "consensus_rejected" : "rejected");
  }

  if (!resolved || !outcome) return { resolved: false };

  const now = new Date().toISOString();
  let promotedToCrossGroup = false;
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    // Update story status
    if (outcome === "approved" || outcome === "consensus") {
      await client.query(
        "UPDATE stories SET status = $1, approved_at = $2, resolved_at = $2 WHERE id = $3",
        [outcome, now, storyId]
      );
    } else {
      await client.query(
        "UPDATE stories SET status = $1, resolved_at = $2 WHERE id = $3",
        [outcome, now, storyId]
      );
    }

    // Cross-group promotion for in-group approval
    if (!isCross && outcome === "approved") {
      promotedToCrossGroup = await promoteStoryToCrossGroup(client, storyId, story.org_id, story.submitted_by, now);
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, 'story', $4, $5)`,
      [
        `Story resolved: ${outcome.toUpperCase()}`,
        story.submitted_by, story.org_id, storyId,
        JSON.stringify({ outcome, approveCount, rejectCount, voteCount, expectedJurors }),
      ]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Story resolution transaction failed:", e);
    throw e;
  } finally {
    client.release();
  }

  return { resolved: true, outcome, promotedToCrossGroup };
}

async function promoteStoryToCrossGroup(
  client: VercelPoolClient,
  storyId: string,
  orgId: string,
  submittedBy: string,
  now: string,
): Promise<boolean> {
  // Count qualifying assemblies (5+ members, excluding origin)
  const qualifyingOrgs = await client.query(
    `SELECT o.id, COUNT(om.id) AS member_count
     FROM organizations o
     JOIN organization_members om ON om.org_id = o.id AND om.is_active = TRUE
     WHERE o.id != $1
     GROUP BY o.id
     HAVING COUNT(om.id) >= 5`,
    [orgId]
  );

  if (qualifyingOrgs.rows.length < 1) return false;

  // Select cross-group jurors from other assemblies
  const crossPool = await client.query(
    `SELECT DISTINCT om.user_id
     FROM organization_members om
     WHERE om.org_id != $1
       AND om.is_active = TRUE
       AND om.user_id != $2
     ORDER BY RANDOM()
     LIMIT 15`,
    [orgId, submittedBy]
  );

  if (crossPool.rows.length < 3) return false;

  const crossJurySize = Math.min(crossPool.rows.length, 5);

  // Update story for cross-group review
  await client.query(
    `UPDATE stories SET
       status = 'cross_review',
       approved_at = $1,
       resolved_at = NULL,
       cross_group_jury_size = $2,
       cross_group_seed = $3
     WHERE id = $4`,
    [now, crossJurySize, Math.floor(Math.random() * 100000), storyId]
  );

  // Create jury assignments
  for (const juror of crossPool.rows.slice(0, crossJurySize * 3)) {
    await client.query(
      `INSERT INTO jury_assignments (story_id, user_id, role, in_pool, accepted)
       VALUES ($1, $2, 'cross_group', TRUE, FALSE)
       ON CONFLICT DO NOTHING`,
      [storyId, juror.user_id]
    );
  }

  await client.query(
    `INSERT INTO audit_log (action, org_id, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'story', $3, $4)`,
    [
      "Story promoted to cross-group review",
      orgId, storyId,
      JSON.stringify({ qualifyingOrgs: qualifyingOrgs.rows.length, poolSize: crossPool.rows.length, jurySize: crossJurySize }),
    ]
  );

  return true;
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

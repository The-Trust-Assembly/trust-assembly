import { sql } from "@/lib/db";
import { ok, serverError } from "@/lib/api-utils";
import { isWildWestMode, getJurySize, JURY_POOL_MULTIPLIER } from "@/lib/jury-rules";

export const dynamic = "force-dynamic";

// GET /api/data/stories — returns ALL stories keyed by ID
// in the camelCase format the SPA expects.
export async function GET() {
  try {
  // ── Auto-promote pending_jury → pending_review ──
  try {
    const wildWest = await isWildWestMode();
    const threshold = wildWest ? 2 : 5;

    const stuckStories = await sql`
      SELECT st.id, st.org_id, st.submitted_by
      FROM stories st
      WHERE st.status = 'pending_jury'
    `;

    for (const story of stuckStories.rows) {
      try {
        const memberCount = await sql`
          SELECT COUNT(*) as count FROM organization_members
          WHERE org_id = ${story.org_id} AND is_active = TRUE
        `;
        const count = parseInt(memberCount.rows[0].count);
        if (count >= threshold) {
          const jurySize = wildWest ? 1 : getJurySize(count);
          const poolSize = jurySize * JURY_POOL_MULTIPLIER;

          const pool = await sql.query(
            `SELECT om.user_id
             FROM organization_members om
             WHERE om.org_id = $1
               AND om.is_active = TRUE
               AND om.user_id != $2
             ORDER BY RANDOM()
             LIMIT $3`,
            [story.org_id, story.submitted_by, poolSize]
          );

          for (const juror of pool.rows) {
            await sql`
              INSERT INTO jury_assignments (story_id, user_id, role, in_pool, accepted)
              VALUES (${story.id}, ${juror.user_id}, 'in_group', TRUE, FALSE)
              ON CONFLICT DO NOTHING
            `;
          }

          await sql`
            UPDATE stories SET status = 'pending_review', jury_seats = ${jurySize}
            WHERE id = ${story.id}
          `;

          await sql`
            INSERT INTO audit_log (action, org_id, entity_type, entity_id, metadata)
            VALUES ('Story promoted from pending_jury to pending_review (auto)', ${story.org_id}, 'story', ${story.id},
                    ${JSON.stringify({ memberCount: count, jurySize, wildWest })})
          `;
        }
      } catch (promoteErr) {
        console.error(`Auto-promote failed for story ${story.id}:`, promoteErr);
      }
    }
  } catch (autoPromoteErr) {
    console.error("Story auto-promotion query failed:", autoPromoteErr);
  }

  // Fetch all stories
  const result = await sql`
    SELECT
      st.id, st.title, st.description, st.status, st.org_id,
      st.jury_seats, st.jury_seed, st.cross_group_jury_size, st.cross_group_seed,
      st.created_at, st.approved_at, st.resolved_at,
      u.username AS submitted_by_username,
      o.name AS org_name
    FROM stories st
    LEFT JOIN users u ON u.id = st.submitted_by
    LEFT JOIN organizations o ON o.id = st.org_id
    ORDER BY st.created_at DESC
  `;

  const storyIds = result.rows.map((r: Record<string, unknown>) => r.id as string);
  if (storyIds.length === 0) return ok({});

  // Batch load submission counts
  const subCounts = await sql.query(
    `SELECT story_id, COUNT(*) as count
     FROM story_submissions WHERE story_id = ANY($1) AND status = 'approved'
     GROUP BY story_id`,
    [storyIds]
  );
  const countMap: Record<string, number> = {};
  for (const row of subCounts.rows) {
    countMap[row.story_id] = parseInt(row.count);
  }

  // Batch load jury assignments
  const jurors = await sql.query(
    `SELECT ja.story_id, ja.role, ja.accepted, ja.accepted_at, u.username
     FROM jury_assignments ja
     LEFT JOIN users u ON u.id = ja.user_id
     WHERE ja.story_id = ANY($1)
     ORDER BY ja.assigned_at`,
    [storyIds]
  );
  const jurorsMap: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of jurors.rows) {
    if (!jurorsMap[row.story_id]) jurorsMap[row.story_id] = [];
    jurorsMap[row.story_id].push(row);
  }

  // Batch load votes
  const votes = await sql.query(
    `SELECT jv.story_id, jv.role, jv.approve, jv.note, jv.voted_at, u.username
     FROM jury_votes jv
     LEFT JOIN users u ON u.id = jv.user_id
     WHERE jv.story_id = ANY($1)
     ORDER BY jv.voted_at`,
    [storyIds]
  );
  const votesMap: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of votes.rows) {
    if (!votesMap[row.story_id]) votesMap[row.story_id] = [];
    votesMap[row.story_id].push(row);
  }

  // Build keyed object
  const stories: Record<string, Record<string, unknown>> = {};
  for (const row of result.rows as Record<string, unknown>[]) {
    const id = row.id as string;
    const allJurors = jurorsMap[id] || [];
    const inGroupJurors = allJurors.filter(j => j.role === "in_group").map(j => j.username);
    const crossGroupJurors = allJurors.filter(j => j.role === "cross_group").map(j => j.username);
    const acceptedInGroup = allJurors.filter(j => j.role === "in_group" && j.accepted).map(j => j.username);
    const acceptedCrossGroup = allJurors.filter(j => j.role === "cross_group" && j.accepted).map(j => j.username);

    const allVotes = votesMap[id] || [];
    const inGroupVotes: Record<string, Record<string, unknown>> = {};
    const crossGroupVotes: Record<string, Record<string, unknown>> = {};
    for (const v of allVotes) {
      const voteObj = { approve: v.approve, note: v.note, time: v.voted_at };
      if (v.role === "cross_group") {
        crossGroupVotes[v.username as string] = voteObj;
      } else {
        inGroupVotes[v.username as string] = voteObj;
      }
    }

    stories[id] = {
      id,
      title: row.title,
      description: row.description,
      status: row.status,
      orgId: row.org_id,
      orgName: row.org_name || "Unknown Org",
      submittedBy: row.submitted_by_username || "unknown",
      jurySeats: row.jury_seats,
      jurySeed: row.jury_seed,
      crossGroupJurySize: row.cross_group_jury_size,
      crossGroupSeed: row.cross_group_seed,
      createdAt: row.created_at,
      approvedAt: row.approved_at,
      resolvedAt: row.resolved_at,
      submissionCount: countMap[id] || 0,
      jurors: inGroupJurors,
      acceptedJurors: acceptedInGroup,
      votes: inGroupVotes,
      crossGroupJurors,
      crossGroupAcceptedJurors: acceptedCrossGroup,
      crossGroupVotes,
    };
  }

  return ok(stories);
  } catch (error) {
    return serverError("GET /api/data/stories", error);
  }
}

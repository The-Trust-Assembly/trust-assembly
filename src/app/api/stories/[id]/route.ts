import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, notFound } from "@/lib/api-utils";
import { isValidUUID } from "@/lib/validation";

// GET /api/stories/[id] — story detail with linked submissions and vault artifacts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) return notFound("Not found");

  // Story metadata
  const storyResult = await sql`
    SELECT
      st.id, st.title, st.description, st.status, st.org_id,
      st.jury_seats, st.jury_seed, st.cross_group_jury_size, st.cross_group_seed,
      st.created_at, st.approved_at, st.resolved_at,
      u.username AS submitted_by,
      o.name AS org_name
    FROM stories st
    LEFT JOIN users u ON u.id = st.submitted_by
    LEFT JOIN organizations o ON o.id = st.org_id
    WHERE st.id = ${id}
  `;
  if (storyResult.rows.length === 0) return notFound("Story not found");

  const story = storyResult.rows[0];

  // Linked submissions (both pending and approved tags)
  const subsResult = await sql`
    SELECT
      sub.id, sub.submission_type, sub.status, sub.url,
      sub.original_headline, sub.replacement, sub.reasoning, sub.author,
      sub.trusted_skip, sub.created_at, sub.resolved_at,
      u.username AS submitted_by,
      o.name AS org_name, sub.org_id,
      ss.status AS tag_status, ss.tagged_at,
      tagger.username AS tagged_by
    FROM story_submissions ss
    JOIN submissions sub ON sub.id = ss.submission_id
    LEFT JOIN users u ON u.id = sub.submitted_by
    LEFT JOIN organizations o ON o.id = sub.org_id
    LEFT JOIN users tagger ON tagger.id = ss.tagged_by
    WHERE ss.story_id = ${id}
    ORDER BY sub.created_at DESC
  `;

  // Aggregated vault artifacts through linked submissions
  const approvedSubIds = subsResult.rows
    .filter((r: Record<string, unknown>) => r.tag_status === "approved")
    .map((r: Record<string, unknown>) => r.id as string);

  let vaultArtifacts: Record<string, unknown>[] = [];
  if (approvedSubIds.length > 0) {
    const vaultResult = await sql.query(
      `SELECT sle.submission_id, sle.entry_type, sle.entry_id, sle.label, sle.detail
       FROM submission_linked_entries sle
       WHERE sle.submission_id = ANY($1)`,
      [approvedSubIds]
    );
    vaultArtifacts = vaultResult.rows;
  }

  // Jury votes on the story itself
  const votesResult = await sql`
    SELECT jv.approve, jv.note, jv.voted_at, jv.role, u.username
    FROM jury_votes jv
    LEFT JOIN users u ON u.id = jv.user_id
    WHERE jv.story_id = ${id}
    ORDER BY jv.voted_at
  `;

  // Jury assignments
  const jurorsResult = await sql`
    SELECT ja.role, ja.accepted, ja.accepted_at, u.username
    FROM jury_assignments ja
    LEFT JOIN users u ON u.id = ja.user_id
    WHERE ja.story_id = ${id}
    ORDER BY ja.assigned_at
  `;

  return ok({
    story,
    submissions: subsResult.rows,
    vaultArtifacts,
    votes: votesResult.rows,
    jurors: jurorsResult.rows,
  });
}

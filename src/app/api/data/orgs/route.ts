import { sql } from "@/lib/db";
import { ok } from "@/lib/api-utils";

// GET /api/data/orgs — returns ALL organizations keyed by ID
// with member username arrays, in the format the v5 SPA expects.
// This replaces sG(SK.ORGS) reads from the deprecated KV store.
export async function GET() {
  const result = await sql`
    SELECT
      o.id, o.name, o.description, o.charter, o.is_general_public,
      o.enrollment_mode, o.sponsors_required,
      o.cross_group_deception_findings, o.cassandra_wins,
      o.created_at,
      creator.username AS created_by
    FROM organizations o
    JOIN users u ON u.id = o.created_by
    JOIN users creator ON creator.id = o.created_by
    ORDER BY o.created_at ASC
  `;

  const orgIds = result.rows.map((r: Record<string, unknown>) => r.id as string);
  if (orgIds.length === 0) return ok({});

  // Batch load all active members for all orgs
  const members = await sql.query(
    `SELECT om.org_id, u.username, om.is_founder
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.org_id = ANY($1) AND om.is_active = TRUE
     ORDER BY om.joined_at ASC`,
    [orgIds]
  );
  const membersMap: Record<string, string[]> = {};
  const foundersMap: Record<string, string[]> = {};
  for (const row of members.rows) {
    if (!membersMap[row.org_id]) membersMap[row.org_id] = [];
    membersMap[row.org_id].push(row.username);
    if (row.is_founder) {
      if (!foundersMap[row.org_id]) foundersMap[row.org_id] = [];
      foundersMap[row.org_id].push(row.username);
    }
  }

  const orgs: Record<string, unknown> = {};
  for (const row of result.rows) {
    const id = row.id as string;
    orgs[id] = {
      id,
      name: row.name,
      description: row.description,
      charter: row.charter,
      isGeneralPublic: row.is_general_public,
      enrollmentMode: row.enrollment_mode,
      sponsorsRequired: row.sponsors_required,
      crossGroupDeceptionFindings: row.cross_group_deception_findings,
      cassandraWins: row.cassandra_wins,
      createdBy: row.created_by,
      createdAt: row.created_at,
      members: membersMap[id] || [],
      founders: foundersMap[id] || [],
    };
  }

  return ok(orgs);
}

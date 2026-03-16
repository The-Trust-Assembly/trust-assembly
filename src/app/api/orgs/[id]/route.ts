import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, notFound } from "@/lib/api-utils";

// GET /api/orgs/[id] — assembly detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const result = await sql`
    SELECT
      o.id, o.name, o.description, o.charter, o.is_general_public,
      o.enrollment_mode, o.sponsors_required,
      o.cross_group_deception_findings, o.cassandra_wins,
      o.created_at,
      u.username AS created_by,
      u.display_name AS created_by_display_name
    FROM organizations o
    LEFT JOIN users u ON u.id = o.created_by
    WHERE o.id = ${id}
  `;

  if (result.rows.length === 0) return notFound("Assembly not found");

  const org = result.rows[0];

  // Get member count and founders
  const members = await sql`
    SELECT COUNT(*) as count FROM organization_members
    WHERE org_id = ${id} AND is_active = TRUE
  `;

  const founders = await sql`
    SELECT u.username, u.display_name
    FROM organization_members om
    LEFT JOIN users u ON u.id = om.user_id
    WHERE om.org_id = ${id} AND om.is_founder = TRUE AND om.is_active = TRUE
  `;

  return ok({
    ...org,
    memberCount: parseInt(members.rows[0].count),
    founders: founders.rows,
  });
}

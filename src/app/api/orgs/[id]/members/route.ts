import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, notFound } from "@/lib/api-utils";

// GET /api/orgs/[id]/members — list members
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  // Verify org exists
  const org = await sql`SELECT id FROM organizations WHERE id = ${id}`;
  if (org.rows.length === 0) return notFound("Assembly not found");

  const result = await sql`
    SELECT
      u.id, u.username, u.display_name, u.is_di,
      u.total_wins, u.total_losses, u.current_streak,
      om.is_founder, om.joined_at, om.assembly_streak
    FROM organization_members om
    LEFT JOIN users u ON u.id = om.user_id
    WHERE om.org_id = ${id} AND om.is_active = TRUE
    ORDER BY om.joined_at ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total = await sql`
    SELECT COUNT(*) as count FROM organization_members
    WHERE org_id = ${id} AND is_active = TRUE
  `;

  return ok({
    members: result.rows,
    total: parseInt(total.rows[0].count),
    limit,
    offset,
  });
}

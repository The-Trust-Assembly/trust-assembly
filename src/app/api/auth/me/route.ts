import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const result = await sql`
    SELECT
      id, username, display_name, real_name, email, gender, age,
      country, state, political_affiliation, bio, is_di, di_approved,
      total_wins, total_losses, current_streak, dispute_wins, dispute_losses,
      deliberate_lies, primary_org_id, created_at
    FROM users WHERE id = ${session.sub}
  `;

  if (result.rows.length === 0) return unauthorized("User not found");

  const u = result.rows[0];

  // Get org memberships
  const orgs = await sql`
    SELECT o.id, o.name, om.is_founder, om.joined_at
    FROM organization_members om
    LEFT JOIN organizations o ON o.id = om.org_id
    WHERE om.user_id = ${session.sub} AND om.is_active = TRUE
  `;

  return ok({
    ...u,
    organizations: orgs.rows,
  });
}

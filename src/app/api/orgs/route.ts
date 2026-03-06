import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

// GET /api/orgs — list all assemblies
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  const result = await sql`
    SELECT
      o.id, o.name, o.description, o.charter, o.is_general_public,
      o.enrollment_mode, o.sponsors_required, o.created_at,
      u.username AS created_by,
      (SELECT COUNT(*) FROM organization_members om WHERE om.org_id = o.id AND om.is_active = TRUE) AS member_count
    FROM organizations o
    JOIN users u ON u.id = o.created_by
    ORDER BY o.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total = await sql`SELECT COUNT(*) as count FROM organizations`;

  return ok({
    organizations: result.rows,
    total: parseInt(total.rows[0].count),
    limit,
    offset,
  });
}

// POST /api/orgs — create an assembly
export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  const body = await request.json();
  const { name, description, charter } = body;

  if (!name || name.trim().length < 3) {
    return err("Assembly name must be at least 3 characters");
  }

  // Check org limit (max 12 per user)
  const orgCount = await sql`
    SELECT COUNT(*) as count FROM organization_members
    WHERE user_id = ${session.sub} AND is_active = TRUE
  `;
  if (parseInt(orgCount.rows[0].count) >= 12) {
    return err("Maximum of 12 assembly memberships reached");
  }

  // Check name uniqueness
  const existing = await sql`SELECT id FROM organizations WHERE name = ${name.trim()}`;
  if (existing.rows.length > 0) {
    return err("An assembly with this name already exists", 409);
  }

  // Create org
  const result = await sql`
    INSERT INTO organizations (name, description, charter, created_by)
    VALUES (${name.trim()}, ${description || null}, ${charter || null}, ${session.sub})
    RETURNING id, name, description, charter, enrollment_mode, created_at
  `;

  const org = result.rows[0];

  // Add creator as founder member
  await sql`
    INSERT INTO organization_members (org_id, user_id, is_founder)
    VALUES (${org.id}, ${session.sub}, TRUE)
  `;

  // Log to member history
  await sql`
    INSERT INTO organization_member_history (org_id, user_id, action)
    VALUES (${org.id}, ${session.sub}, 'joined')
  `;

  return ok(org, 201);
}

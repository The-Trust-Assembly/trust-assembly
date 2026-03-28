import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest, requireAdmin } from "@/lib/auth";
import { ok, notFound, err, unauthorized, forbidden, serverError } from "@/lib/api-utils";
import { isValidUUID, validateLength, MAX_LENGTHS } from "@/lib/validation";

export const fetchCache = "force-no-store";

// GET /api/orgs/[id] — assembly detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) return notFound("Not found");

  const result = await sql`
    SELECT
      o.id, o.name, o.description, o.charter, o.avatar, o.is_general_public,
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
    created_by: org.created_by || "unknown",
    created_by_display_name: org.created_by_display_name || "",
    memberCount: parseInt(members.rows[0].count),
    founders: founders.rows.map((f: Record<string, unknown>) => ({
      ...f,
      username: f.username || "unknown",
      display_name: f.display_name || "",
    })),
  });
}

// PATCH /api/orgs/[id] — update assembly details (charter, description)
// Only founders can edit, and only while member count < 50
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  if (!isValidUUID(id)) return notFound("Not found");

  try {
    // Verify assembly exists and get member count
    const orgResult = await sql`
      SELECT o.id, o.created_by,
        (SELECT COUNT(*) FROM organization_members WHERE org_id = o.id AND is_active = TRUE) as member_count
      FROM organizations o WHERE o.id = ${id}
    `;
    if (orgResult.rows.length === 0) return notFound("Assembly not found");

    const org = orgResult.rows[0];
    const memberCount = parseInt(org.member_count);

    // Verify the user is a founder or admin
    const isAdmin = !!(await requireAdmin(request));
    const isFounder = await sql`
      SELECT 1 FROM organization_members
      WHERE org_id = ${id} AND user_id = ${session.sub} AND is_founder = TRUE AND is_active = TRUE
    `;
    if (!isAdmin && isFounder.rows.length === 0) return forbidden("Only founders or admins can edit assembly details");

    // Check member count threshold (admins bypass this for avatar-only updates)
    if (!isAdmin && memberCount >= 50) return err("Charter cannot be edited once the assembly has 50 or more members. The charter is now permanent.");

    const body = await request.json();
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.charter !== undefined) {
      const charterErr = validateLength("charter", body.charter, MAX_LENGTHS.org_charter);
      if (charterErr) return err(charterErr);
      updates.push(`charter = $${idx++}`);
      values.push(body.charter?.trim() || null);
    }
    if (body.description !== undefined) {
      const descErr = validateLength("description", body.description, MAX_LENGTHS.org_description);
      if (descErr) return err(descErr);
      updates.push(`description = $${idx++}`);
      values.push(body.description?.trim() || null);
    }
    if (body.avatar !== undefined) {
      if (body.avatar && typeof body.avatar === "string" && body.avatar.length > 300000) return err("Avatar must be under 200KB");
      if (body.avatar && typeof body.avatar === "string" && !body.avatar.startsWith("data:image/")) return err("Avatar must be a data:image URL (JPEG, PNG, or WebP)");
      updates.push(`avatar = $${idx++}`);
      values.push(body.avatar || null);
    }

    if (updates.length === 0) return err("No fields to update");

    // Use direct tagged template for avatar-only updates (most common case)
    // to avoid any issues with sql.query() vs sql`` behavior
    if (updates.length === 1 && body.avatar !== undefined && body.charter === undefined && body.description === undefined) {
      await sql`UPDATE organizations SET avatar = ${body.avatar || null} WHERE id = ${id}`;
    } else {
      values.push(id);
      await sql.query(`UPDATE organizations SET ${updates.join(", ")} WHERE id = $${idx}`, values);
    }

    // Audit log
    await sql`
      INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata)
      VALUES ('Assembly details updated by founder', ${session.sub}, ${id}, 'organization', ${id},
        ${JSON.stringify({ updatedFields: Object.keys(body).filter(k => body[k] !== undefined), memberCount })}::jsonb)
    `;

    // Read back avatar to confirm persistence
    const readBack = await sql`SELECT avatar IS NOT NULL as has_avatar, length(avatar) as avatar_length FROM organizations WHERE id = ${id}`;
    const avatarInfo = readBack.rows[0] || {};

    return ok({ success: true, avatarSaved: !!avatarInfo.has_avatar, avatarLength: avatarInfo.avatar_length || 0, updatedFields: updates.map(u => u.split(" = ")[0]) });
  } catch (e) {
    return serverError("PATCH /api/orgs/[id]", e);
  }
}

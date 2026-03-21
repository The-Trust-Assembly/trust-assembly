import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-utils";
import { isValidUUID } from "@/lib/validation";

// POST /api/orgs/[id]/leave — leave an assembly
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  if (!isValidUUID(id)) return notFound("Not found");

  // Verify membership
  const membership = await sql`
    SELECT id FROM organization_members
    WHERE org_id = ${id} AND user_id = ${session.sub} AND is_active = TRUE
  `;
  if (membership.rows.length === 0) return notFound("Not a member of this assembly");

  // Can't leave General Public
  const org = await sql`SELECT is_general_public FROM organizations WHERE id = ${id}`;
  if (org.rows[0]?.is_general_public) {
    return err("Cannot leave the General Public assembly");
  }

  // Use sql.connect() for a dedicated client where transactions work.
  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    // Deactivate membership
    await client.query(
      "UPDATE organization_members SET is_active = FALSE, left_at = now() WHERE org_id = $1 AND user_id = $2",
      [id, session.sub]
    );

    // Log to history
    await client.query(
      "INSERT INTO organization_member_history (org_id, user_id, action) VALUES ($1, $2, $3)",
      [id, session.sub, "left"]
    );

    // If this was primary org, clear it
    await client.query(
      "UPDATE users SET primary_org_id = NULL WHERE id = $1 AND primary_org_id = $2",
      [session.sub, id]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Org leave transaction failed, rolled back:", e);
    throw e;
  } finally {
    client.release();
  }

  return ok({ status: "left" });
}

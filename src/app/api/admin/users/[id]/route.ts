import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ok, err, forbidden } from "@/lib/api-utils";
import { sql } from "@/lib/db";

// DELETE /api/admin/users/[id] — admin deletes a user account
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const { id } = await params;

  // Look up the user to be deleted
  const user = await sql`SELECT id, username FROM users WHERE id = ${id}`;
  if (user.rows.length === 0) return err("User not found", 404);

  const targetUsername = user.rows[0].username as string;
  const anonUsername = "deleted_" + crypto.randomUUID().slice(0, 8);

  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    // Anonymize user record — same logic as self-delete
    await client.query(
      `UPDATE users SET
        username = $1,
        display_name = 'Deleted Account',
        email = $1 || '@deleted',
        password_hash = '',
        salt = '',
        real_name = NULL,
        bio = NULL,
        gender = NULL,
        age = NULL,
        country = NULL,
        state = NULL,
        political_affiliation = NULL,
        ip_hash = NULL
      WHERE id = $2`,
      [anonUsername, id]
    );

    // Remove memberships, jury assignments, notifications
    await client.query("DELETE FROM organization_members WHERE user_id = $1", [id]);
    await client.query("DELETE FROM jury_assignments WHERE user_id = $1", [id]);
    await client.query("DELETE FROM notifications WHERE user_id = $1", [id]);

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, user_id, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'user', $3, $4)`,
      [
        "Admin: account permanently deleted",
        admin.sub,
        id,
        JSON.stringify({ deletedUsername: targetUsername, anonymizedTo: anonUsername, deletedBy: admin.username }),
      ]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Admin account deletion failed:", e);
    return err("Failed to delete account", 500);
  } finally {
    client.release();
  }

  return ok({ deleted: true, username: targetUsername, anonymizedUsername: anonUsername });
}

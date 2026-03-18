import { NextRequest } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";
import { sql } from "@/lib/db";

export async function DELETE(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json();
  if (!body.confirmUsername || body.confirmUsername.toLowerCase() !== session.username.toLowerCase()) {
    return err("Username confirmation does not match", 400);
  }

  const anonUsername = "deleted_" + crypto.randomUUID().slice(0, 8);

  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    // Anonymize user record — wipe all PII, replace username
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
      [anonUsername, session.sub]
    );

    // Remove memberships, jury assignments, notifications
    await client.query("DELETE FROM organization_members WHERE user_id = $1", [session.sub]);
    await client.query("DELETE FROM jury_assignments WHERE user_id = $1", [session.sub]);
    await client.query("DELETE FROM notifications WHERE user_id = $1", [session.sub]);

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, details, performed_by)
       VALUES ($1, $2, $3)`,
      [
        "Account permanently deleted",
        JSON.stringify({ originalUsername: session.username, anonymizedTo: anonUsername }),
        session.sub,
      ]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Account deletion failed:", e);
    return err("Failed to delete account", 500);
  } finally {
    client.release();
  }

  return ok({ deleted: true, anonymizedUsername: anonUsername });
}

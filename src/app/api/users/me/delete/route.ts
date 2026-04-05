import { NextRequest } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";
import { sql } from "@/lib/db";

export async function DELETE(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch (e) {
    console.error("[delete-account] Failed to parse request body:", e);
    return err("Invalid request body", 400);
  }

  if (!body.confirmUsername || body.confirmUsername.toLowerCase() !== session.username.toLowerCase()) {
    return err("Username confirmation does not match", 400);
  }

  const anonUsername = "deleted_" + crypto.randomUUID().slice(0, 8);
  console.log(`[delete-account] Starting deletion for user ${session.username} (${session.sub}), anonymizing to ${anonUsername}`);

  const client = await sql.connect();
  try {
    await client.query("BEGIN");
    console.log("[delete-account] Transaction started");

    // Anonymize user record — wipe all PII, replace username
    try {
      await client.query(
        `UPDATE users SET
          username = $1,
          display_name = 'Deleted Account',
          email = $1 || '@deleted',
          password_hash = 'DELETED',
          salt = 'DELETED',
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
      console.log("[delete-account] User record anonymized");
    } catch (e) {
      console.error("[delete-account] FAILED at: anonymize user record", e);
      throw e;
    }

    // Remove memberships, jury assignments, notifications
    const cleanups = [
      ["organization_members", "DELETE FROM organization_members WHERE user_id = $1"],
      ["jury_assignments", "DELETE FROM jury_assignments WHERE user_id = $1"],
      ["notifications", "DELETE FROM notifications WHERE user_id = $1"],
    ];

    for (const [table, query] of cleanups) {
      try {
        await client.query(query, [session.sub]);
        console.log(`[delete-account] Cleaned ${table}`);
      } catch (e) {
        console.error(`[delete-account] FAILED at: clean ${table}`, e);
        throw e;
      }
    }

    // Optional cleanups — these tables may not exist on older database versions
    const optionalCleanups = [
      ["organization_follows", "DELETE FROM organization_follows WHERE user_id = $1"],
      ["user_badges", "DELETE FROM user_badges WHERE user_id = $1"],
      ["di_requests", "DELETE FROM di_requests WHERE di_user_id = $1 OR partner_user_id = $1"],
      ["membership_applications", "DELETE FROM membership_applications WHERE user_id = $1"],
    ];

    for (const [table, query] of optionalCleanups) {
      try {
        await client.query(query, [session.sub]);
        console.log(`[delete-account] Cleaned ${table}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // Skip "relation does not exist" errors for optional tables
        if (msg.includes("does not exist")) {
          console.warn(`[delete-account] Table ${table} does not exist, skipping`);
        } else {
          console.error(`[delete-account] FAILED at: clean ${table}`, e);
          throw e;
        }
      }
    }

    // Audit log
    try {
      await client.query(
        `INSERT INTO audit_log (action, user_id, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'user', $3, $4)`,
        [
          "Account permanently deleted",
          session.sub,
          session.sub,
          JSON.stringify({ originalUsername: session.username, anonymizedTo: anonUsername }),
        ]
      );
      console.log("[delete-account] Audit log written");
    } catch (e) {
      console.error("[delete-account] FAILED at: audit log insert", e);
      throw e;
    }

    await client.query("COMMIT");
    console.log(`[delete-account] SUCCESS — user ${session.username} deleted as ${anonUsername}`);
  } catch (e) {
    await client.query("ROLLBACK");
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[delete-account] ROLLED BACK — error: ${msg}`);
    return err(`Failed to delete account: ${msg}`, 500);
  } finally {
    client.release();
  }

  return ok({ deleted: true, anonymizedUsername: anonUsername });
}

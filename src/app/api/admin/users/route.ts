import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, err, forbidden, serverError } from "@/lib/api-utils";

// GET /api/admin/users?search=&page=1&limit=50
// Lists all users with search, pagination, and activity counts.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") || "").trim().toLowerCase();
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;

    // Count total matching users
    const countResult = search
      ? await sql`
          SELECT COUNT(*)::int AS total FROM users
          WHERE LOWER(username) LIKE ${"%" + search + "%"}
             OR LOWER(display_name) LIKE ${"%" + search + "%"}
             OR LOWER(email) LIKE ${"%" + search + "%"}
        `
      : await sql`SELECT COUNT(*)::int AS total FROM users`;

    const total = countResult.rows[0].total;

    // Fetch users with activity stats
    const usersResult = search
      ? await sql`
          SELECT
            u.id, u.username, u.display_name, u.email, u.is_admin, u.is_di,
            u.total_wins, u.total_losses, u.current_streak, u.deliberate_lies,
            u.created_at,
            (SELECT COUNT(*) FROM submissions s WHERE s.submitted_by = u.id)::int AS submission_count,
            (SELECT COUNT(*) FROM jury_votes jv WHERE jv.user_id = u.id)::int AS vote_count,
            (SELECT COUNT(*) FROM organization_members om WHERE om.user_id = u.id AND om.is_active = TRUE)::int AS org_count
          FROM users u
          WHERE LOWER(u.username) LIKE ${"%" + search + "%"}
             OR LOWER(u.display_name) LIKE ${"%" + search + "%"}
             OR LOWER(u.email) LIKE ${"%" + search + "%"}
          ORDER BY u.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `
      : await sql`
          SELECT
            u.id, u.username, u.display_name, u.email, u.is_admin, u.is_di,
            u.total_wins, u.total_losses, u.current_streak, u.deliberate_lies,
            u.created_at,
            (SELECT COUNT(*) FROM submissions s WHERE s.submitted_by = u.id)::int AS submission_count,
            (SELECT COUNT(*) FROM jury_votes jv WHERE jv.user_id = u.id)::int AS vote_count,
            (SELECT COUNT(*) FROM organization_members om WHERE om.user_id = u.id AND om.is_active = TRUE)::int AS org_count
          FROM users u
          ORDER BY u.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;

    return ok({
      users: usersResult.rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (e) {
    return serverError("/api/admin/users", e);
  }
}

// DELETE /api/admin/users
// Anonymizes and deactivates a user account. Same approach as self-delete
// but triggered by admin. Preserves submissions/votes for audit integrity.
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const body = await request.json();
    const userId = body.userId;
    if (!userId) return err("userId is required");

    // Look up the target user
    const userResult = await sql`
      SELECT id, username, is_admin FROM users WHERE id = ${userId}
    `;
    if (userResult.rows.length === 0) return err("User not found", 404);

    const target = userResult.rows[0];

    // Prevent deleting yourself or another admin
    if (target.id === admin.sub) return err("Cannot delete your own account");
    if (target.is_admin) return err("Cannot delete another admin account");

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
          ip_hash = NULL,
          primary_org_id = NULL
        WHERE id = $2`,
        [anonUsername, userId]
      );

      // Remove memberships, jury assignments, notifications
      await client.query("DELETE FROM organization_members WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM jury_assignments WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM notifications WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM organization_follows WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM user_badges WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM di_requests WHERE di_user_id = $1 OR partner_user_id = $1", [userId]);
      await client.query("DELETE FROM membership_applications WHERE user_id = $1", [userId]);

      // Audit log
      await client.query(
        `INSERT INTO audit_log (action, user_id, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'user', $3, $4)`,
        [
          "Admin: deleted user account",
          admin.sub, userId,
          JSON.stringify({
            deletedUsername: target.username,
            anonymizedTo: anonUsername,
            adminUsername: admin.username,
          }),
        ]
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("Admin user deletion failed:", e);
      return err("Failed to delete user: " + (e instanceof Error ? e.message : String(e)), 500);
    } finally {
      client.release();
    }

    return ok({
      success: true,
      message: `User @${target.username} has been anonymized as ${anonUsername}`,
      anonymizedUsername: anonUsername,
    });
  } catch (e) {
    return serverError("/api/admin/users", e);
  }
}

// PATCH /api/admin/users — Toggle admin status on a user
// Body: { userId: string, isAdmin: boolean }
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const body = await request.json();
    const { userId, isAdmin } = body;
    if (!userId || typeof isAdmin !== "boolean") return err("userId and isAdmin (boolean) are required");

    if (userId === admin.sub && !isAdmin) return err("Cannot remove your own admin privileges");

    const userResult = await sql`SELECT id, username, is_admin FROM users WHERE id = ${userId}`;
    if (userResult.rows.length === 0) return err("User not found", 404);

    const target = userResult.rows[0];

    await sql`UPDATE users SET is_admin = ${isAdmin} WHERE id = ${userId}`;

    try {
      await sql`
        INSERT INTO audit_log (action, user_id, entity_type, entity_id, metadata)
        VALUES (
          ${isAdmin ? "Admin: granted admin privileges" : "Admin: revoked admin privileges"},
          ${admin.sub}, 'user', ${userId},
          ${JSON.stringify({ targetUsername: target.username, isAdmin, adminUsername: admin.username })}
        )
      `;
    } catch (e) { /* audit log failure shouldn't block */ }

    return ok({
      success: true,
      message: `@${target.username} is ${isAdmin ? "now an admin" : "no longer an admin"}`,
    });
  } catch (e) {
    return serverError("/api/admin/users PATCH", e);
  }
}

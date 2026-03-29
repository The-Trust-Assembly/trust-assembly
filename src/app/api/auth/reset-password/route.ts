import { NextRequest } from "next/server";
import { sql, withTransaction } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { ok, err } from "@/lib/api-utils";

// POST /api/auth/reset-password
// Accepts { token, password } and resets the user's password.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { token, password } = body;
  if (!token || typeof token !== "string") {
    return err("Reset token is required");
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return err("Password must be at least 8 characters");
  }

  // Look up token
  const result = await sql`
    SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at, u.username
    FROM password_reset_tokens prt
    JOIN users u ON u.id = prt.user_id
    WHERE prt.token = ${token}
    LIMIT 1
  `;

  if (result.rows.length === 0) {
    return err("Invalid or expired reset link", 400);
  }

  const resetToken = result.rows[0];

  if (resetToken.used_at) {
    return err("This reset link has already been used", 400);
  }

  if (new Date(resetToken.expires_at as string) < new Date()) {
    return err("This reset link has expired. Please request a new one.", 400);
  }

  // Hash new password and update
  const { hash, salt } = await hashPassword(password);

  try {
    await withTransaction(async (client) => {
      await client.query(
        "UPDATE users SET password_hash = $1, salt = $2 WHERE id = $3",
        [hash, salt, resetToken.user_id]
      );

      await client.query(
        "UPDATE password_reset_tokens SET used_at = now() WHERE id = $1",
        [resetToken.id]
      );

      await client.query(
        `INSERT INTO audit_log (action, user_id, entity_type, entity_id)
         VALUES ($1, $2, 'user', $3)`,
        ["Password reset via email", resetToken.user_id, resetToken.user_id]
      );
    });
  } catch {
    return err("Failed to reset password. Please try again.", 500);
  }

  return ok({ message: "Password has been reset. You can now log in." });
}

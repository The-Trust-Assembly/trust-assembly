import { NextRequest } from "next/server";
import { sql, withTransaction } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";

// POST /api/auth/verify-email
// Accepts { token } and marks the user's email as verified.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { token } = body;
  if (!token || typeof token !== "string") {
    return err("Verification token is required");
  }

  // Look up token
  const result = await sql`
    SELECT evt.id, evt.user_id, evt.expires_at, evt.used_at, u.username, u.email_verified
    FROM email_verification_tokens evt
    JOIN users u ON u.id = evt.user_id
    WHERE evt.token = ${token}
    LIMIT 1
  `;

  if (result.rows.length === 0) {
    return err("Invalid or expired verification link", 400);
  }

  const row = result.rows[0];

  if (row.used_at) {
    // Token already used — but email might be verified, which is fine
    if (row.email_verified) {
      return ok({ message: "Email already verified.", alreadyVerified: true });
    }
    return err("This verification link has already been used", 400);
  }

  if (new Date(row.expires_at as string) < new Date()) {
    return err("This verification link has expired. Please request a new one.", 400);
  }

  try {
    await withTransaction(async (client) => {
      await client.query(
        "UPDATE users SET email_verified = TRUE, email_verified_at = now() WHERE id = $1",
        [row.user_id]
      );
      await client.query(
        "UPDATE email_verification_tokens SET used_at = now() WHERE id = $1",
        [row.id]
      );
      await client.query(
        `INSERT INTO audit_log (action, user_id, entity_type, entity_id)
         VALUES ($1, $2, 'user', $3)`,
        ["Email verified", row.user_id, row.user_id]
      );
    });
  } catch {
    return err("Failed to verify email. Please try again.", 500);
  }

  return ok({ message: "Email verified successfully. You can now submit corrections." });
}

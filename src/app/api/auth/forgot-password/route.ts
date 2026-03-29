import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { sql } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";
import { sendPasswordResetEmail } from "@/lib/email";

// POST /api/auth/forgot-password
// Accepts { email } and sends a password reset link if the account exists.
// Always returns success to prevent email enumeration.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { email } = body;
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return err("Valid email address is required");
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Look up user by email (non-DI accounts only — DIs share partner email)
  const result = await sql`
    SELECT id, username, email FROM users
    WHERE email = ${normalizedEmail} AND is_di = FALSE
    LIMIT 1
  `;

  if (result.rows.length > 0) {
    const user = result.rows[0];
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Invalidate any existing unused tokens for this user
    await sql`
      UPDATE password_reset_tokens SET used_at = now()
      WHERE user_id = ${user.id} AND used_at IS NULL
    `;

    // Create new token
    await sql`
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (${user.id}, ${token}, ${expiresAt})
    `;

    // Send email (fire-and-forget)
    sendPasswordResetEmail(
      user.email as string,
      user.username as string,
      token
    ).catch(() => {});
  }

  // Always return success to prevent email enumeration
  return ok({ message: "If an account with that email exists, a reset link has been sent." });
}

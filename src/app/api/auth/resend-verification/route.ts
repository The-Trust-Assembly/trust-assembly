import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";
import { sendVerificationEmail } from "@/lib/email";

// POST /api/auth/resend-verification
// Sends a new verification email. Requires authentication.
// Rate limited to 3 per hour.
export async function POST(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  // Check if already verified
  const user = await sql`
    SELECT id, username, email, email_verified FROM users WHERE id = ${session.sub}
  `;
  if (user.rows.length === 0) return err("User not found", 404);
  if (user.rows[0].email_verified) return ok({ message: "Email is already verified." });

  // Rate limit: max 3 resends per hour
  const recentTokens = await sql`
    SELECT COUNT(*)::int AS count FROM email_verification_tokens
    WHERE user_id = ${session.sub} AND created_at > now() - interval '1 hour'
  `;
  if (recentTokens.rows[0].count >= 3) {
    return err("Too many verification emails sent. Please wait before trying again.", 429);
  }

  // Invalidate previous tokens
  await sql`
    UPDATE email_verification_tokens SET used_at = now()
    WHERE user_id = ${session.sub} AND used_at IS NULL
  `;

  // Generate new token
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await sql`
    INSERT INTO email_verification_tokens (user_id, token, expires_at)
    VALUES (${session.sub}, ${token}, ${expiresAt})
  `;

  // Send email
  sendVerificationEmail(
    user.rows[0].email as string,
    user.rows[0].username as string,
    token
  ).catch(() => {});

  return ok({ message: "Verification email sent. Check your inbox." });
}

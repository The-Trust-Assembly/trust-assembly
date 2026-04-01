import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest, createToken, setSessionCookie } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

// POST /api/auth/complete-profile
// For OAuth users who need to provide demographics after sign-up.
export async function POST(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return err("Invalid JSON body"); }

  const { username, gender, age, country, state, politicalAffiliation } = body as Record<string, string>;

  // Validate username
  if (!username || username.length < 3 || username.length > 30) {
    return err("Username must be 3-30 characters");
  }
  if (!/^[a-z0-9_-]+$/.test(username)) {
    return err("Username must be lowercase letters, numbers, underscores, or hyphens");
  }

  // Check username uniqueness
  const existing = await sql`SELECT id FROM users WHERE username = ${username} AND id != ${session.sub}`;
  if (existing.rows.length > 0) {
    return err("Username already taken");
  }

  // Validate gender
  if (!gender || !["male", "female", "nonbinary", "other", "undisclosed"].includes(gender)) {
    return err("Gender is required");
  }

  // Update user profile
  await sql`
    UPDATE users SET
      username = ${username},
      display_name = ${username},
      gender = ${gender},
      age = ${age || "Undisclosed"},
      country = ${country || null},
      state = ${state || null},
      political_affiliation = ${politicalAffiliation || null},
      profile_complete = TRUE
    WHERE id = ${session.sub}
  `;

  // Audit log
  await sql`
    INSERT INTO audit_log (action, user_id, entity_type, entity_id)
    VALUES ('Profile completed (OAuth demographics)', ${session.sub}, 'user', ${session.sub})
  `;

  // Issue new JWT with updated username
  const token = await createToken({ sub: session.sub, username });
  await setSessionCookie(token);

  return ok({ username, profileComplete: true, token });
}

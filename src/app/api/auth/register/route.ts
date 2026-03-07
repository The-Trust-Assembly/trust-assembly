import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { hashPassword, createToken, setSessionCookie } from "@/lib/auth";
import { ok, err } from "@/lib/api-utils";

// Drop the UNIQUE constraint on email so DIs can share their partner's email.
// Idempotent — safe to run on every cold start.
let schemaMigrated = false;
async function ensureEmailNotUnique() {
  if (schemaMigrated) return;
  try {
    await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key`;
  } catch { /* constraint may not exist */ }
  schemaMigrated = true;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  await ensureEmailNotUnique();

  const { username, displayName, realName, email, password, gender, age, country, state, politicalAffiliation } = body;
  const isDI = gender === "di";

  // Validate required fields
  if (!username || !displayName || !email || !password) {
    return err("username, displayName, email, and password are required");
  }

  // Validate username format
  const uname = username.toLowerCase().trim();
  if (uname.length < 3 || uname.length > 30 || !/^[a-z0-9_-]+$/.test(uname)) {
    return err("Username must be 3-30 characters, lowercase letters, numbers, hyphens, and underscores only");
  }

  if (password.length < 8) {
    return err("Password must be at least 8 characters");
  }

  // Check uniqueness — Digital Intelligences may share their partner's email
  const existing = isDI
    ? await sql`SELECT id FROM users WHERE username = ${uname}`
    : await sql`SELECT id FROM users WHERE username = ${uname} OR email = ${email.toLowerCase()}`;
  if (existing.rows.length > 0) {
    return err(isDI ? "Username already taken" : "Username or email already taken", 409);
  }

  // Hash password
  const { hash, salt } = await hashPassword(password);

  // Insert user
  const result = await sql`
    INSERT INTO users (
      username, display_name, real_name, email, password_hash, salt,
      gender, age, country, state, political_affiliation, is_di
    ) VALUES (
      ${uname}, ${displayName}, ${realName || null}, ${email.toLowerCase()}, ${hash}, ${salt},
      ${gender || "Undisclosed"}, ${age || "Undisclosed"}, ${country || null}, ${state || null},
      ${politicalAffiliation || null}, ${isDI}
    ) RETURNING id, username, display_name, created_at
  `;

  const user = result.rows[0];

  // Create session
  const token = await createToken({ sub: user.id, username: user.username });
  await setSessionCookie(token);

  // Auto-join General Public assembly if it exists
  const gp = await sql`SELECT id FROM organizations WHERE is_general_public = TRUE LIMIT 1`;
  if (gp.rows.length > 0) {
    await sql`
      INSERT INTO organization_members (org_id, user_id) VALUES (${gp.rows[0].id}, ${user.id})
      ON CONFLICT DO NOTHING
    `;
    await sql`UPDATE users SET primary_org_id = ${gp.rows[0].id} WHERE id = ${user.id}`;
  }

  return ok({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    createdAt: user.created_at,
  }, 201);
}

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashPassword, createToken, setSessionCookie } from "@/lib/auth";
import { ok, err } from "@/lib/api-utils";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";

// Email is intentionally NOT unique in the schema — DIs may share their
// partner's email. Uniqueness for non-DI accounts is enforced in
// application logic below (the registration query checks for existing
// email on non-DI registrations).

// 3 registrations per hour per IP
const REGISTER_RATE_LIMIT = 3;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = getClientIP(request);
  const limit = checkRateLimit(`register:${ip}`, REGISTER_RATE_LIMIT, REGISTER_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const body = await request.json();

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

  // Auto-join General Public assembly if it exists.
  // Use sql.connect() for a dedicated client where transactions work.
  // The sql`` tagged template (neon HTTP driver) is stateless — each call
  // goes to a different connection, so multi-step writes can partially fail.
  const gp = await sql`SELECT id FROM organizations WHERE is_general_public = TRUE LIMIT 1`;
  if (gp.rows.length > 0) {
    const client = await sql.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO organization_members (org_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [gp.rows[0].id, user.id]
      );
      await client.query(
        "UPDATE users SET primary_org_id = $1 WHERE id = $2",
        [gp.rows[0].id, user.id]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("Registration org enrollment failed, rolled back:", e);
      throw e;
    } finally {
      client.release();
    }
  }

  return ok({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    createdAt: user.created_at,
  }, 201);
}

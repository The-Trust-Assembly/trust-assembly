import { NextRequest, NextResponse } from "next/server";
import { sql, withTransaction } from "@/lib/db";
import { hashPassword, createToken, setSessionCookie } from "@/lib/auth";
import { ok, err } from "@/lib/api-utils";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { sendWelcomeEmail } from "@/lib/email";

// Email is intentionally NOT unique in the schema — DIs may share their
// partner's email. Uniqueness for non-DI accounts is enforced in
// application logic below (the registration query checks for existing
// email on non-DI registrations).

// 3 registrations per hour per IP
const REGISTER_RATE_LIMIT = 3;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

const SOURCE_FILE = "src/app/api/auth/register/route.ts";

export async function POST(request: NextRequest) {
  const requestUrl = request.url;

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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { username, displayName, realName, email, password, gender, age, country, state, politicalAffiliation } = body as Record<string, string>;
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

  // Insert user AND auto-join General Public in a single transaction.
  // This prevents orphaned users if org enrollment fails.
  let user: Record<string, unknown>;
  try {
    user = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO users (
          username, display_name, real_name, email, password_hash, salt,
          gender, age, country, state, political_affiliation, is_di
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, username, display_name, created_at`,
        [
          uname, displayName, realName || null, email.toLowerCase(), hash, salt,
          gender || "Undisclosed", age || "Undisclosed", country || null, state || null,
          politicalAffiliation || null, isDI,
        ]
      );

      const newUser = result.rows[0];

      // Auto-join General Public assembly if it exists
      const gp = await client.query(
        "SELECT id FROM organizations WHERE is_general_public = TRUE LIMIT 1"
      );
      if (gp.rows.length > 0) {
        await client.query(
          "INSERT INTO organization_members (org_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [gp.rows[0].id, newUser.id]
        );
        await client.query(
          "UPDATE users SET primary_org_id = $1 WHERE id = $2",
          [gp.rows[0].id, newUser.id]
        );
      }

      // Audit log — record the registration so it appears on the Transparency Ledger
      await client.query(
        `INSERT INTO audit_log (action, user_id, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'user', $3, $4)`,
        [
          `@${newUser.username} registered as a Digital ${isDI ? "Intelligence" : "Citizen"}`,
          newUser.id,
          newUser.id,
          JSON.stringify({ username: newUser.username, isDI }),
        ]
      );

      return newUser;
    });
  } catch (error) {
    await logError({
      sessionInfo: uname,
      errorType: "transaction_error",
      error: error instanceof Error ? error : String(error),
      apiRoute: "/api/auth/register",
      sourceFile: SOURCE_FILE,
      sourceFunction: "POST handler",
      lineContext: "Registration transaction (INSERT user → INSERT org_member → UPDATE primary_org)",
      httpMethod: "POST",
      httpStatus: 500,
      requestUrl,
      requestBody: { username: uname, isDI },
    });
    return err("Registration failed. Please try again.", 500);
  }

  // Create session — only after the transaction commits successfully
  const token = await createToken({ sub: user.id as string, username: user.username as string });
  await setSessionCookie(token);

  // Welcome email (fire-and-forget)
  if (email && !isDI) {
    sendWelcomeEmail(email as string, user.username as string).catch(() => {});
  }

  return ok({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    createdAt: user.created_at,
    token, // Returned for browser extension (cross-origin bearer auth)
  }, 201);
}

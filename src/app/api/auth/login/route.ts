import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { verifyPassword, createToken, setSessionCookie } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { username, password } = body;

  if (!username || !password) {
    return err("username and password are required");
  }

  // Look up user by username or email (prefer username match since emails may be shared by DIs)
  const result = await sql`
    SELECT id, username, display_name, password_hash
    FROM users
    WHERE username = ${username.toLowerCase()} OR email = ${username.toLowerCase()}
    ORDER BY (username = ${username.toLowerCase()}) DESC
    LIMIT 1
  `;

  if (result.rows.length === 0) {
    return unauthorized("Invalid credentials");
  }

  const user = result.rows[0];
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return unauthorized("Invalid credentials");
  }

  const token = await createToken({ sub: user.id, username: user.username });
  await setSessionCookie(token);

  return ok({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    token, // Returned for browser extension (cross-origin bearer auth)
  });
}

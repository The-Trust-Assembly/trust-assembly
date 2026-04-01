import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { verifyPassword, createToken, setSessionCookie } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";

// 5 login attempts per minute per IP
const LOGIN_RATE_LIMIT = 5;
const LOGIN_WINDOW_MS = 60 * 1000;

const SOURCE_FILE = "src/app/api/auth/login/route.ts";

export async function POST(request: NextRequest) {
  const requestUrl = request.url;

  // Rate limit by IP
  const ip = getClientIP(request);
  const limit = checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT, LOGIN_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { username, password } = body;

  if (!username || !password) {
    return err("username and password are required");
  }

  try {
    // Look up user by username or email (prefer username match since emails may be shared by DIs)
    const result = await sql`
      SELECT id, username, display_name, password_hash
      FROM users
      WHERE username = ${username.toLowerCase()} OR email = ${username.toLowerCase()}
      ORDER BY (username = ${username.toLowerCase()}) DESC
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      await logError({
        sessionInfo: username.toLowerCase(),
        errorType: "auth_error",
        error: "Invalid credentials — user not found",
        apiRoute: "/api/auth/login",
        sourceFile: SOURCE_FILE,
        sourceFunction: "POST handler",
        lineContext: "User lookup by username/email",
        httpMethod: "POST",
        httpStatus: 401,
        requestUrl,
      });
      return unauthorized("Invalid credentials");
    }

    const user = result.rows[0];
    // OAuth-only users have no password — guide them to use Google sign-in
    if (!user.password_hash) {
      return err("This account uses Google sign-in. Please use the Google button to log in.", 401);
    }
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      await logError({
        sessionInfo: username.toLowerCase(),
        errorType: "auth_error",
        error: "Invalid credentials — wrong password",
        apiRoute: "/api/auth/login",
        sourceFile: SOURCE_FILE,
        sourceFunction: "POST handler",
        lineContext: "Password verification",
        httpMethod: "POST",
        httpStatus: 401,
        requestUrl,
      });
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
  } catch (error) {
    await logError({
      sessionInfo: username?.toLowerCase(),
      errorType: "api_error",
      error: error instanceof Error ? error : String(error),
      apiRoute: "/api/auth/login",
      sourceFile: SOURCE_FILE,
      sourceFunction: "POST handler",
      lineContext: "Unhandled error during login",
      httpMethod: "POST",
      httpStatus: 500,
      requestUrl,
    });
    return err("Login failed. Please try again.", 500);
  }
}

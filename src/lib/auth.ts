import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

let _jwtSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  if (!_jwtSecret) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET environment variable is required");
    }
    _jwtSecret = new TextEncoder().encode(secret);
  }
  return _jwtSecret;
}

const COOKIE_NAME = "ta-session";
const TOKEN_EXPIRY = "7d";

export interface JWTPayload {
  sub: string; // user id
  username: string;
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = await bcrypt.genSalt(12);
  const hash = await bcrypt.hash(password, salt);
  return { hash, salt };
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Extract user from Authorization: Bearer <token> header.
 * Used by the browser extension which cannot use HTTP-only cookies.
 * Falls back to cookie-based auth if no header present.
 */
export async function getCurrentUserFromRequest(request: Request): Promise<JWTPayload | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return verifyToken(token);
  }
  // Fall back to cookie-based auth
  return getCurrentUser();
}

/**
 * Check if the authenticated user has admin privileges.
 * Admin status is determined by an is_admin column on the users table.
 * Returns the user payload if admin, null otherwise.
 */
export async function requireAdmin(request?: Request): Promise<JWTPayload | null> {
  const { sql } = await import("@/lib/db");
  const user = request
    ? await getCurrentUserFromRequest(request)
    : await getCurrentUser();
  if (!user) return null;

  const result = await sql`SELECT is_admin, username FROM users WHERE id = ${user.sub}`;
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  // Check is_admin column OR match the hardcoded admin username
  // (is_admin may not have been set during KV→relational migration)
  const isAdmin = row.is_admin || row.username === "thekingofamerica";

  if (!isAdmin) return null;

  // Auto-fix: set is_admin = TRUE if it wasn't already
  if (!row.is_admin && isAdmin) {
    await sql`UPDATE users SET is_admin = TRUE WHERE id = ${user.sub}`;
  }

  return user;
}

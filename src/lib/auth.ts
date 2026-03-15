import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = new TextEncoder().encode(jwtSecret);

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
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
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

  const result = await sql`SELECT is_admin FROM users WHERE id = ${user.sub}`;
  if (result.rows.length === 0 || !result.rows[0].is_admin) return null;

  return user;
}

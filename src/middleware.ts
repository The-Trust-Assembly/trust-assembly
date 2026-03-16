import { NextRequest, NextResponse } from "next/server";

/**
 * CORS middleware for browser extension requests.
 *
 * Browser extensions make cross-origin requests from two contexts:
 *
 * 1. **Popup / background** — origin is chrome-extension://, moz-extension://,
 *    or safari-web-extension://. These can make any request (GET, POST, etc.)
 *    and send Authorization headers.
 *
 * 2. **Content scripts** — injected into web pages, so the origin is the
 *    PAGE's origin (e.g., https://www.cnn.com). In Manifest V3, Chrome no
 *    longer grants content scripts the extension's CORS bypass. Without
 *    proper Access-Control-Allow-Origin headers, every fetch from a content
 *    script is silently blocked by the browser.
 *
 * Our read-only endpoints (/api/corrections, /api/translations, /api/users/*)
 * serve public data by design — browsing activity is never logged, and all
 * corrections are intended to be visible to anyone. It is therefore safe to
 * allow any origin for GET requests.
 *
 * Write endpoints (POST/PUT/DELETE) still require an extension origin so that
 * arbitrary websites cannot forge writes, even though those routes also
 * require a valid Authorization token.
 */

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";

// The application's own origin — cookie-authenticated requests should only
// be allowed from here or from browser extension origins.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://trustassembly.org";

function isExtensionOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return (
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("moz-extension://") ||
    origin.startsWith("safari-web-extension://")
  );
}

function isSameOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const app = new URL(APP_ORIGIN);
    const req = new URL(origin);
    return req.hostname === app.hostname;
  } catch {
    return false;
  }
}

// Public, read-only endpoints that content scripts need access to.
// These serve data that is public by design and contain no user-specific
// information, so reflecting any origin is safe.
const PUBLIC_GET_PATHS = [
  "/api/corrections",
  "/api/vault",
  "/api/orgs",
];

function isPublicGetPath(pathname: string): boolean {
  return PUBLIC_GET_PATHS.some(p => pathname.startsWith(p));
}

function shouldAllowOrigin(
  origin: string | null,
  method: string,
  pathname: string,
): boolean {
  // Extension origins are always allowed (popup, background, service worker)
  if (isExtensionOrigin(origin)) return true;
  // Same-origin requests are always allowed (the web app itself)
  if (isSameOrigin(origin)) return true;
  // Public read-only endpoints allow any origin for GET — content scripts
  // injected into arbitrary news sites need to fetch corrections/vault data.
  // These endpoints don't use cookie auth and contain no user-specific data.
  if ((method === "GET" || method === "OPTIONS") && isPublicGetPath(pathname)) return true;
  return false;
}

function addCorsHeaders(
  response: NextResponse,
  origin: string,
  isExtOrSameOrigin: boolean,
): void {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  response.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  // Only allow credentials (cookies) for same-origin and extension requests.
  // Third-party origins should never receive cookie-authenticated responses.
  if (isExtOrSameOrigin) {
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");
  const pathname = request.nextUrl.pathname;

  const extOrSame = isExtensionOrigin(origin) || isSameOrigin(origin);

  // Handle preflight OPTIONS requests
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (origin && shouldAllowOrigin(origin, "OPTIONS", pathname)) {
      addCorsHeaders(response, origin, extOrSame);
    }
    response.headers.set("Access-Control-Max-Age", "86400");
    return response;
  }

  // For actual requests, continue and add CORS headers to the response
  const response = NextResponse.next();
  if (origin && shouldAllowOrigin(origin, request.method, pathname)) {
    addCorsHeaders(response, origin, extOrSame);
  }

  // Content Security Policy — mitigates XSS by restricting script sources.
  // 'self' allows scripts from the same origin; 'unsafe-inline' is needed
  // for Next.js inline styles. Adjust as the frontend evolves.
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https:; frame-ancestors 'none'",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

// Only apply to API routes
export const config = {
  matcher: "/api/:path*",
};

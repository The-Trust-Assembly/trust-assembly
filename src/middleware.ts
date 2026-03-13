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

function isExtensionOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return (
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("moz-extension://") ||
    origin.startsWith("safari-web-extension://")
  );
}

function shouldAllowOrigin(
  origin: string | null,
  method: string,
): boolean {
  // Extension origins are always allowed (popup, background, service worker)
  if (isExtensionOrigin(origin)) return true;
  // GET requests serve public, read-only data — allow any origin so that
  // content scripts injected into arbitrary news sites can fetch corrections.
  if (method === "GET" || method === "OPTIONS") return true;
  return false;
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");

  // Handle preflight OPTIONS requests
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (origin && shouldAllowOrigin(origin, "OPTIONS")) {
      response.headers.set("Access-Control-Allow-Origin", origin);
    }
    response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
    response.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    response.headers.set("Access-Control-Max-Age", "86400");
    return response;
  }

  // For actual requests, continue and add CORS headers to the response
  const response = NextResponse.next();
  if (origin && shouldAllowOrigin(origin, request.method)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
    response.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  }
  return response;
}

// Only apply to API routes
export const config = {
  matcher: "/api/:path*",
};

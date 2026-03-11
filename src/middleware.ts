import { NextRequest, NextResponse } from "next/server";

/**
 * CORS middleware for browser extension requests.
 *
 * Browser extensions (Chrome, Firefox, Safari) make cross-origin requests
 * from content scripts and popup pages. These need CORS headers on the
 * API responses, especially for POST/DELETE requests with auth headers.
 *
 * Extension origins use chrome-extension:// or moz-extension:// protocols,
 * which we allow. We also allow the app's own origin for same-origin requests.
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

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");

  // Handle preflight OPTIONS requests
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (isExtensionOrigin(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin!);
    }
    response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
    response.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    response.headers.set("Access-Control-Max-Age", "86400");
    return response;
  }

  // For actual requests, continue and add CORS headers to the response
  const response = NextResponse.next();
  if (isExtensionOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin!);
    response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
    response.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  }
  return response;
}

// Only apply to API routes
export const config = {
  matcher: "/api/:path*",
};

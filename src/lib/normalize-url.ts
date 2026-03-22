/**
 * Normalize a URL for consistent matching.
 *
 * - Strips www. prefix (www.bbc.com → bbc.com)
 * - Removes fragment (#...)
 * - Strips trailing slash from pathname
 * - Removes common tracking query params (utm_*, fbclid, gclid, ref, source)
 * - Preserves meaningful query params
 * - Returns the raw string on parse failure
 */
export function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.hostname = parsed.hostname.replace(/^www\./, "");
    parsed.hash = "";
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    const trackingParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "fbclid", "gclid", "ref", "source",
    ];
    trackingParams.forEach((p) => parsed.searchParams.delete(p));
    return parsed.toString();
  } catch {
    return raw;
  }
}

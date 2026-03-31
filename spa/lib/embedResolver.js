// ─── Embed Resolver ────────────────────────────────────────────────
// Maps URLs to iframe embed URLs for embeddable platforms (YouTube,
// Spotify, Vimeo, TikTok) or returns null for OG card fallback.
// Pure functions, no side effects, no React dependency.

/**
 * Extract embed info from a URL.
 * Returns { type: "iframe", embedUrl, platform, aspectRatio } or null.
 */
export function getEmbedInfo(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    const path = u.pathname;

    // YouTube
    if (host === "youtube.com" || host === "youtu.be") {
      let videoId = null;
      if (host === "youtu.be") videoId = path.slice(1).split(/[?#]/)[0];
      else if (path.startsWith("/watch")) videoId = u.searchParams.get("v");
      else if (path.startsWith("/shorts/")) videoId = path.split("/shorts/")[1]?.split(/[?#]/)[0];
      else if (path.startsWith("/embed/")) videoId = path.split("/embed/")[1]?.split(/[?#]/)[0];
      if (videoId) return { type: "iframe", embedUrl: `https://www.youtube.com/embed/${videoId}`, platform: "YouTube", aspectRatio: "16:9" };
    }

    // Vimeo
    if (host === "vimeo.com") {
      const id = path.slice(1).split(/[?#/]/)[0];
      if (id && /^\d+$/.test(id)) return { type: "iframe", embedUrl: `https://player.vimeo.com/video/${id}`, platform: "Vimeo", aspectRatio: "16:9" };
    }

    // Spotify
    if (host === "open.spotify.com") {
      const match = path.match(/^\/(episode|show)\/([a-zA-Z0-9]+)/);
      if (match) return { type: "iframe", embedUrl: `https://open.spotify.com/embed/${match[1]}/${match[2]}`, platform: "Spotify", aspectRatio: "spotify" };
    }

    // TikTok
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      const videoMatch = path.match(/\/@[^/]+\/video\/(\d+)/);
      if (videoMatch) return { type: "iframe", embedUrl: `https://www.tiktok.com/embed/v2/${videoMatch[1]}`, platform: "TikTok", aspectRatio: "9:16" };
    }

    // Dailymotion
    if (host === "dailymotion.com") {
      const id = path.match(/\/video\/([a-zA-Z0-9]+)/)?.[1];
      if (id) return { type: "iframe", embedUrl: `https://www.dailymotion.com/embed/video/${id}`, platform: "Dailymotion", aspectRatio: "16:9" };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Determine the content display mode for the preview panel.
 * @param {string} url - The submission URL
 * @param {string} bodyText - Article body text (if extracted)
 * @returns {"embed" | "article-with-card" | "og-card"}
 */
export function getContentDisplayMode(url, bodyText) {
  if (getEmbedInfo(url)) return "embed";
  if (bodyText && bodyText.trim().length > 100) return "article-with-card";
  return "og-card";
}

/**
 * Get Amazon product image URL from an Amazon URL.
 * Amazon product images follow a predictable pattern based on ASIN.
 */
export function getAmazonThumbnail(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("amazon.")) return null;
    // Extract ASIN from URL patterns: /dp/ASIN, /gp/product/ASIN, /ASIN/
    const dpMatch = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (dpMatch) return `https://images-na.ssl-images-amazon.com/images/P/${dpMatch[1]}.01._SCLZZZZZZZ_SX200_.jpg`;
    // Fallback: look for ASIN-like pattern in path
    const asinMatch = u.pathname.match(/\/([A-Z0-9]{10})(?:\/|$)/);
    if (asinMatch) return `https://images-na.ssl-images-amazon.com/images/P/${asinMatch[1]}.01._SCLZZZZZZZ_SX200_.jpg`;
  } catch {}
  return null;
}

/**
 * Get YouTube thumbnail URL from a video URL.
 * Always available even when embedding is disabled.
 */
export function getYouTubeThumbnail(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    let videoId = null;
    if (host === "youtu.be") videoId = u.pathname.slice(1).split(/[?#]/)[0];
    else if (host === "youtube.com") {
      if (u.pathname.startsWith("/watch")) videoId = u.searchParams.get("v");
      else if (u.pathname.startsWith("/shorts/")) videoId = u.pathname.split("/shorts/")[1]?.split(/[?#]/)[0];
      else if (u.pathname.startsWith("/embed/")) videoId = u.pathname.split("/embed/")[1]?.split(/[?#]/)[0];
    }
    if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  } catch {}
  return null;
}

/**
 * Extract the domain name from a URL for display.
 */
export function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

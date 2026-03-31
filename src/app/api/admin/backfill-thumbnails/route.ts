import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, serverError } from "@/lib/api-utils";

/**
 * POST /api/admin/backfill-thumbnails
 *
 * Fetches og:image for all submissions that don't have a thumbnail_url yet.
 * Uses the same lightweight regex approach as the import service.
 * Safe to run multiple times — skips submissions that already have thumbnails.
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function getMetaContent(html: string, nameOrProp: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${nameOrProp}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${nameOrProp}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

// YouTube thumbnail from video ID (always available)
function getYouTubeThumbnail(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    let videoId: string | null = null;
    if (host === "youtu.be") videoId = u.pathname.slice(1).split(/[?#]/)[0];
    else if (host === "youtube.com") {
      if (u.pathname.startsWith("/watch")) videoId = u.searchParams.get("v");
      else if (u.pathname.startsWith("/shorts/")) videoId = u.pathname.split("/shorts/")[1]?.split(/[?#]/)[0] || null;
    }
    if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  } catch {}
  return null;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    // Find submissions without thumbnails
    const subs = await sql`
      SELECT id, url FROM submissions
      WHERE (thumbnail_url IS NULL OR thumbnail_url = '')
      ORDER BY created_at DESC
      LIMIT 100
    `;

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const details: string[] = [];

    for (const sub of subs.rows) {
      const url = sub.url as string;
      let thumbnail: string | null = null;

      // Try instant thumbnails first (no fetch needed)
      thumbnail = getYouTubeThumbnail(url);
      // Amazon product image from ASIN
      if (!thumbnail && url.includes("amazon.")) {
        const dpMatch = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
        const asinMatch = !dpMatch ? url.match(/\/([A-Z0-9]{10})(?:\/|$)/) : null;
        const asin = dpMatch?.[1] || asinMatch?.[1];
        if (asin) thumbnail = `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_SX200_.jpg`;
      }

      // Otherwise fetch the page and extract og:image
      if (!thumbnail) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, "Accept": "text/html" },
            redirect: "follow",
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (response.ok) {
            // Read first 50KB — og:image is always in <head>
            const reader = response.body?.getReader();
            if (reader) {
              const decoder = new TextDecoder();
              let html = "";
              let bytes = 0;
              while (bytes < 50000) {
                const { done, value } = await reader.read();
                if (done) break;
                html += decoder.decode(value, { stream: true });
                bytes += value.length;
              }
              reader.cancel().catch(() => {});

              thumbnail = getMetaContent(html, "og:image") || getMetaContent(html, "twitter:image");
            }
          }
        } catch {
          // Fetch failed — skip this one
        }
      }

      if (thumbnail) {
        await sql`UPDATE submissions SET thumbnail_url = ${thumbnail} WHERE id = ${sub.id as string}`;
        updated++;
        details.push(`${(sub.id as string).slice(0, 8)}... -> ${thumbnail.slice(0, 60)}...`);
      } else {
        skipped++;
      }
    }

    return ok({
      message: `Backfilled ${updated} thumbnails, skipped ${skipped}, failed ${failed} (of ${subs.rows.length} checked).`,
      updated,
      skipped,
      total: subs.rows.length,
      details: details.slice(0, 20),
    });
  } catch (e) {
    return serverError("POST /api/admin/backfill-thumbnails", e);
  }
}

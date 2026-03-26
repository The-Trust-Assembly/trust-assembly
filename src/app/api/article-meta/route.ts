import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api-utils";
import { getCurrentUserFromRequest } from "@/lib/auth";

// GET /api/article-meta?url=... — fetch headline and author from an article URL
export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return err("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !/^https?:\/\/.+\..+/.test(url)) {
    return err("Valid URL required");
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; TrustAssembly/1.0; +https://trustassembly.org)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return err(`Failed to fetch article (HTTP ${res.status})`);

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
      return err("URL does not point to an HTML page");
    }

    // Read only the first 100KB to avoid downloading huge pages
    const reader = res.body?.getReader();
    if (!reader) return err("Could not read response");

    let html = "";
    const decoder = new TextDecoder();
    const MAX_BYTES = 100_000;
    let totalBytes = 0;

    while (totalBytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      totalBytes += value.length;
    }
    reader.cancel();

    // Extract metadata
    const headline = extractHeadline(html);
    const authors = extractAuthors(html);
    const bodyText = extractBodyText(html);

    return ok({
      headline: headline || null,
      authors: authors.length > 0 ? authors : null,
      bodyText: bodyText || null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("abort")) {
      return err("Request timed out fetching article");
    }
    return err(`Failed to fetch article: ${message}`);
  }
}

function decodeEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function getMetaContent(html: string, nameOrProp: string): string | null {
  // Match both name= and property= attributes
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${nameOrProp}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${nameOrProp}["']`,
      "i"
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1].trim());
  }
  return null;
}

function extractHeadline(html: string): string | null {
  // Priority order: og:title > twitter:title > <title> > <h1>

  const ogTitle = getMetaContent(html, "og:title");
  if (ogTitle) return ogTitle;

  const twitterTitle = getMetaContent(html, "twitter:title");
  if (twitterTitle) return twitterTitle;

  // JSON-LD structured data
  const ldMatch = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (ldMatch?.[1]) {
    try {
      const ld = JSON.parse(ldMatch[1]);
      const headline = ld.headline || ld.name;
      if (headline && typeof headline === "string") return decodeEntities(headline);
      // Handle @graph arrays
      if (Array.isArray(ld["@graph"])) {
        for (const item of ld["@graph"]) {
          if (item.headline) return decodeEntities(item.headline);
        }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  }

  // <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    let title = decodeEntities(titleMatch[1].trim());
    // Strip common suffixes like " - CNN" or " | The New York Times"
    title = title.replace(/\s*[\|\-–—]\s*[^|\-–—]{2,30}$/, "").trim();
    if (title.length > 10) return title;
  }

  // First <h1>
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match?.[1]) {
    const h1 = decodeEntities(h1Match[1].replace(/<[^>]+>/g, "").trim());
    if (h1.length > 5) return h1;
  }

  return null;
}

function extractAuthors(html: string): string[] {
  const authors: string[] = [];
  const seen = new Set<string>();

  const addAuthor = (name: string) => {
    const cleaned = name.trim().replace(/^by\s+/i, "").trim();
    if (cleaned && cleaned.length > 1 && cleaned.length < 100 && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      authors.push(cleaned);
    }
  };

  // JSON-LD author
  const ldMatch = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (ldMatch?.[1]) {
    try {
      const ld = JSON.parse(ldMatch[1]);
      const extractLdAuthor = (obj: Record<string, unknown>) => {
        const author = obj.author;
        if (typeof author === "string") addAuthor(author);
        else if (Array.isArray(author)) {
          for (const a of author) {
            if (typeof a === "string") addAuthor(a);
            else if (a?.name) addAuthor(String(a.name));
          }
        } else if (author && typeof author === "object" && (author as Record<string, unknown>).name) {
          addAuthor(String((author as Record<string, unknown>).name));
        }
      };
      extractLdAuthor(ld);
      if (Array.isArray(ld["@graph"])) {
        for (const item of ld["@graph"]) extractLdAuthor(item);
      }
    } catch {
      // Invalid JSON-LD
    }
  }

  // Meta tags
  for (const prop of ["author", "article:author", "sailthru.author", "dc.creator"]) {
    const val = getMetaContent(html, prop);
    if (val) {
      // May be comma-separated
      for (const part of val.split(/,\s*/)) addAuthor(part);
    }
  }

  // <a rel="author">
  const relAuthorMatch = html.match(
    /<a[^>]+rel=["']author["'][^>]*>([^<]+)<\/a>/gi
  );
  if (relAuthorMatch) {
    for (const m of relAuthorMatch) {
      const nameMatch = m.match(/>([^<]+)</);
      if (nameMatch?.[1]) addAuthor(decodeEntities(nameMatch[1]));
    }
  }

  return authors;
}

function extractBodyText(html: string): string | null {
  // Remove script and style tags first
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  let container: string | null = null;

  // 1. Try <article> tag
  const articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (articleMatch?.[1]) {
    container = articleMatch[1];
  }

  // 2. Fall back to common article body selectors
  if (!container) {
    const selectors = [
      /role=["']article["']/i,
      /class=["'][^"']*\barticle-body\b[^"']*["']/i,
      /class=["'][^"']*\bpost-content\b[^"']*["']/i,
      /class=["'][^"']*\bentry-content\b[^"']*["']/i,
      /class=["'][^"']*\bstory-body\b[^"']*["']/i,
    ];

    for (const selector of selectors) {
      // Find the opening tag with this selector, then grab content until closing tag
      const tagPattern = new RegExp(
        `<(\\w+)[^>]*${selector.source}[^>]*>([\\s\\S]*?)<\\/\\1>`,
        "i"
      );
      const match = cleaned.match(tagPattern);
      if (match?.[2]) {
        container = match[2];
        break;
      }
    }
  }

  // 3. Extract <p> tags from the container (or entire page as fallback)
  const source = container || cleaned;
  const pMatches = source.match(/<p[\s\S]*?>([\s\S]*?)<\/p>/gi);
  if (!pMatches || pMatches.length === 0) return null;

  const paragraphs = pMatches
    .map((p) => {
      // Strip HTML tags
      let text = p.replace(/<[^>]+>/g, "");
      // Decode entities
      text = decodeEntities(text);
      // Collapse whitespace
      text = text.replace(/\s+/g, " ").trim();
      return text;
    })
    .filter((text) => text.length > 0);

  if (paragraphs.length === 0) return null;

  // Join with double newlines and cap at 10,000 characters
  const bodyText = paragraphs.join("\n\n");
  return bodyText.slice(0, 10_000);
}

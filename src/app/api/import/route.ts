import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api-utils";
import registryData from "../../../../site-registry.json";

// In-memory cache (24h TTL)
const cache = new Map<string, { data: ImportResult; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface FieldResult { value: string; source: string; confidence: number; }
interface ImportResult {
  success: boolean;
  platform: string;
  template: string;
  confidence: number;
  fields: Record<string, FieldResult>;
  canonical: string;
  submitted: string;
  normalized: string;
  recipeUsed: string | null;
  fetchError?: string;
  extractionTime: string;
  fromCache?: boolean;
}

// ─── Registry ──────────────────────────────────────────────────────

const registry = registryData as Record<string, unknown>;
const recipes = (registry.recipes || {}) as Record<string, Record<string, unknown>>;

function findRecipe(rawUrl: string): { key: string; recipe: Record<string, unknown> } | null {
  const hostname = new URL(rawUrl).hostname.replace(/^www\./, "");
  for (const [key, recipe] of Object.entries(recipes)) {
    if (key.startsWith("_")) continue;
    const domains = recipe.domains as string[] | undefined;
    if (domains?.includes(hostname) || domains?.includes(`www.${hostname}`)) return { key, recipe };
    const domainPattern = recipe.domainPattern as string | undefined;
    if (domainPattern) {
      const pattern = domainPattern.replace("*.", "");
      if (hostname.endsWith(pattern) && hostname !== pattern) return { key, recipe };
    }
  }
  return null;
}

// ─── URL Normalization ─────────────────────────────────────────────

const GLOBAL_STRIP_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "gclsrc", "dclid", "msclkid",
  "mc_cid", "mc_eid", "ref", "_ga", "source", "via",
];

function normalizeUrl(rawUrl: string, recipe: Record<string, unknown> | null): string {
  const url = new URL(rawUrl);
  GLOBAL_STRIP_PARAMS.forEach(p => url.searchParams.delete(p));
  const normRules = recipe?.urlNormalization as Record<string, unknown> | undefined;
  if (normRules?.stripParams) {
    for (const pattern of normRules.stripParams as string[]) {
      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1);
        const toDelete: string[] = [];
        url.searchParams.forEach((_, key) => { if (key.startsWith(prefix)) toDelete.push(key); });
        toDelete.forEach(k => url.searchParams.delete(k));
      } else {
        url.searchParams.delete(pattern);
      }
    }
  }
  if (normRules?.normalizeDomain) url.hostname = normRules.normalizeDomain as string;
  return url.toString();
}

// ─── Regex-Based Extraction (ported from article-meta) ─────────────

function decodeEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ");
}

function getMetaContent(html: string, nameOrProp: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${nameOrProp}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${nameOrProp}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1].trim());
  }
  return null;
}

// Layer 1: Meta tags (og, twitter, standard)
function extractMetaFields(html: string): Record<string, FieldResult> {
  const fields: Record<string, FieldResult> = {};
  const metaMappings: Array<{ field: string; tags: string[]; confidence: number }> = [
    { field: "title", tags: ["og:title", "twitter:title"], confidence: 0.8 },
    { field: "description", tags: ["og:description", "twitter:description", "description"], confidence: 0.7 },
    { field: "author", tags: ["article:author", "author", "twitter:creator", "sailthru.author", "dc.creator"], confidence: 0.7 },
    { field: "publishDate", tags: ["article:published_time", "date", "pubdate"], confidence: 0.7 },
    { field: "siteName", tags: ["og:site_name", "twitter:site", "application-name"], confidence: 0.7 },
    { field: "thumbnail", tags: ["og:image", "twitter:image"], confidence: 0.8 },
  ];
  for (const { field, tags, confidence } of metaMappings) {
    for (const tag of tags) {
      const value = getMetaContent(html, tag);
      if (value) { fields[field] = { value, source: "meta", confidence }; break; }
    }
  }
  return fields;
}

// Layer 2: JSON-LD structured data
function extractJsonLd(html: string): Record<string, FieldResult> {
  const fields: Record<string, FieldResult> = {};
  // Find ALL JSON-LD blocks
  const ldPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = ldPattern.exec(html)) !== null) {
    try {
      let data = JSON.parse(match[1]);
      if (data["@graph"]) data = data["@graph"];
      if (!Array.isArray(data)) data = [data];
      for (const item of data) {
        const type = item["@type"];
        // Articles
        if (["NewsArticle", "Article", "BlogPosting", "WebPage", "ReportageNewsArticle"].includes(type)) {
          if (item.headline && !fields.title) fields.title = { value: decodeEntities(String(item.headline)), source: "json-ld", confidence: 0.9 };
          if (item.description && !fields.description) fields.description = { value: decodeEntities(String(item.description)), source: "json-ld", confidence: 0.85 };
          if (item.author) {
            const authors = Array.isArray(item.author) ? item.author : [item.author];
            const names = authors.map((a: Record<string, string>) => a?.name || (typeof a === "string" ? a : null)).filter(Boolean);
            if (names.length > 0 && !fields.author) fields.author = { value: names.join(", "), source: "json-ld", confidence: 0.9 };
          }
          if (item.datePublished && !fields.publishDate) fields.publishDate = { value: String(item.datePublished), source: "json-ld", confidence: 0.9 };
          if (item.publisher?.name && !fields.publication) fields.publication = { value: String(item.publisher.name), source: "json-ld", confidence: 0.9 };
        }
        // Products
        if (type === "Product") {
          if (item.name && !fields.title) fields.title = { value: decodeEntities(String(item.name)), source: "json-ld", confidence: 0.95 };
          if (item.brand?.name && !fields.brand) fields.brand = { value: String(item.brand.name), source: "json-ld", confidence: 0.95 };
          if (item.description && !fields.description) fields.description = { value: decodeEntities(String(item.description)), source: "json-ld", confidence: 0.85 };
          if (item.aggregateRating && !fields.rating) {
            fields.rating = { value: `${item.aggregateRating.ratingValue}/${item.aggregateRating.bestRating || 5} (${item.aggregateRating.reviewCount || "?"} reviews)`, source: "json-ld", confidence: 0.95 };
          }
        }
        // Videos
        if (type === "VideoObject") {
          if (item.name && !fields.title) fields.title = { value: decodeEntities(String(item.name)), source: "json-ld", confidence: 0.9 };
          if (item.duration && !fields.duration) fields.duration = { value: String(item.duration), source: "json-ld", confidence: 0.9 };
          if (item.author?.name && !fields.author) fields.author = { value: String(item.author.name), source: "json-ld", confidence: 0.9 };
        }
        // Podcasts
        if (["PodcastEpisode", "AudioObject", "RadioEpisode"].includes(type)) {
          if (item.name && !fields.title) fields.title = { value: decodeEntities(String(item.name)), source: "json-ld", confidence: 0.9 };
          if (item.duration && !fields.duration) fields.duration = { value: String(item.duration), source: "json-ld", confidence: 0.9 };
          if (item.partOfSeries?.name && !fields.showName) fields.showName = { value: String(item.partOfSeries.name), source: "json-ld", confidence: 0.9 };
        }
      }
    } catch { /* invalid JSON-LD */ }
  }
  return fields;
}

// Layer 3: HTML fallbacks
function extractHtmlFallbacks(html: string): Record<string, FieldResult> {
  const fields: Record<string, FieldResult> = {};

  // <title> tag (strip common suffixes)
  if (!fields.title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) {
      let title = decodeEntities(titleMatch[1].trim());
      title = title.replace(/\s*[\|\-–—]\s*[^|\-–—]{2,30}$/, "").trim();
      if (title.length > 10) fields.title = { value: title, source: "html-title", confidence: 0.6 };
    }
  }

  // First <h1>
  if (!fields.title) {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match?.[1]) {
      const h1 = decodeEntities(h1Match[1].replace(/<[^>]+>/g, "").trim());
      if (h1.length > 5) fields.title = { value: h1, source: "html-h1", confidence: 0.5 };
    }
  }

  // Author from <a rel="author">
  const relAuthorMatch = html.match(/<a[^>]+rel=["']author["'][^>]*>([^<]+)<\/a>/gi);
  if (relAuthorMatch && !fields.author) {
    const names: string[] = [];
    for (const m of relAuthorMatch) {
      const nameMatch = m.match(/>([^<]+)</);
      if (nameMatch?.[1]) names.push(decodeEntities(nameMatch[1].trim()));
    }
    if (names.length > 0) fields.author = { value: names.join(", "), source: "html-rel-author", confidence: 0.6 };
  }

  // Canonical URL
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (canonicalMatch?.[1]) fields._canonical = { value: canonicalMatch[1], source: "html", confidence: 1.0 };
  if (!fields._canonical) {
    const ogUrl = getMetaContent(html, "og:url");
    if (ogUrl) fields._canonical = { value: ogUrl, source: "meta", confidence: 0.9 };
  }

  return fields;
}

// Body text extraction via regex (replaces Readability)
function extractBodyText(html: string): string | null {
  // Remove script and style tags
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  let container: string | null = null;
  // Try <article> tag first
  const articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (articleMatch?.[1]) container = articleMatch[1];

  // Fallback to common article body selectors
  if (!container) {
    const selectors = [
      /role=["']article["']/i,
      /class=["'][^"']*\barticle-body\b[^"']*["']/i,
      /class=["'][^"']*\bpost-content\b[^"']*["']/i,
      /class=["'][^"']*\bentry-content\b[^"']*["']/i,
      /class=["'][^"']*\bstory-body\b[^"']*["']/i,
    ];
    for (const selector of selectors) {
      const tagPattern = new RegExp(`<(\\w+)[^>]*${selector.source}[^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
      const match = cleaned.match(tagPattern);
      if (match?.[2]) { container = match[2]; break; }
    }
  }

  // Extract <p> tags
  const source = container || cleaned;
  const pMatches = source.match(/<p[\s\S]*?>([\s\S]*?)<\/p>/gi);
  if (!pMatches || pMatches.length === 0) return null;

  const paragraphs = pMatches
    .map(p => decodeEntities(p.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()))
    .filter(text => text.length > 30); // skip short fragments

  if (paragraphs.length === 0) return null;
  return paragraphs.join("\n\n").slice(0, 10000);
}

// Layer 4: Platform APIs
async function extractWithRedditJson(url: string): Promise<Record<string, FieldResult> | null> {
  try {
    const jsonUrl = url.replace(/\/?(\?.*)?$/, ".json$1");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(jsonUrl, { headers: { "User-Agent": "TrustAssembly/1.0" }, signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = await response.json();
    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post) return null;
    const fields: Record<string, FieldResult> = {};
    if (post.title) fields.title = { value: post.title, source: "reddit-json", confidence: 1.0 };
    if (post.author) fields.author = { value: `u/${post.author}`, source: "reddit-json", confidence: 1.0 };
    if (post.selftext) fields.body = { value: post.selftext, source: "reddit-json", confidence: 1.0 };
    if (post.subreddit) fields.subreddit = { value: post.subreddit, source: "reddit-json", confidence: 1.0 };
    fields.postType = { value: post.is_self ? "text" : (post.is_video ? "video" : "link"), source: "reddit-json", confidence: 1.0 };
    return fields;
  } catch { return null; }
}

// Apply site registry metaHints (title stripping, field preferences)
function applyMetaHints(fields: Record<string, FieldResult>, recipe: Record<string, unknown> | null): void {
  const hints = recipe?.metaHints as Record<string, string> | undefined;
  if (!hints) return;

  // Strip title suffixes (e.g., " - CNN", " | Amazon.com")
  if (hints.titleStrip && fields.title?.value) {
    const suffix = hints.titleStrip;
    if (fields.title.value.endsWith(suffix)) {
      fields.title.value = fields.title.value.slice(0, -suffix.length).trim();
    }
    // Also try common separator patterns
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    fields.title.value = fields.title.value.replace(new RegExp(`\\s*[\\|\\-–—]\\s*${escaped}\\s*$`), "").trim();
  }
}

// ─── Main Import Function ──────────────────────────────────────────

async function importUrl(rawUrl: string): Promise<ImportResult> {
  const startTime = Date.now();
  const recipeMatch = findRecipe(rawUrl);
  const recipe = recipeMatch?.recipe || null;
  const normalizedUrl = normalizeUrl(rawUrl, recipe);

  let platform = (recipe?.platform as string) || "article";
  const template = (recipe?.template as string) || "article";

  // Platform APIs (Reddit JSON)
  let specialFields: Record<string, FieldResult> | null = null;
  if (recipe?.extractionStrategy === "reddit_json" || normalizedUrl.includes("reddit.com")) {
    specialFields = await extractWithRedditJson(normalizedUrl);
  }

  // Fetch HTML (first 200KB only — meta tags are in <head>)
  let html: string | null = null;
  let fetchError: string | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(normalizedUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (response.ok) {
      // Read only first 200KB
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let totalBytes = 0;
        const MAX_BYTES = 200_000;
        html = "";
        while (totalBytes < MAX_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
          totalBytes += value.length;
        }
        reader.cancel().catch(() => {});
      }
    } else {
      fetchError = `HTTP ${response.status}`;
      console.warn(`[import] Fetch failed for ${normalizedUrl}: ${fetchError}`);
    }
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e);
    console.warn(`[import] Fetch error for ${normalizedUrl}: ${fetchError}`);
  }

  // Run extraction layers — earlier layers fill first, later layers only fill gaps
  let fields: Record<string, FieldResult> = {};

  // Layer 4 first (API results are highest confidence)
  if (specialFields) {
    for (const [key, val] of Object.entries(specialFields)) { if (!fields[key]) fields[key] = val; }
  }

  if (html) {
    // Layer 2: JSON-LD (high confidence, structured data)
    const jsonLdFields = extractJsonLd(html);
    for (const [key, val] of Object.entries(jsonLdFields)) { if (!fields[key]) fields[key] = val; }

    // Layer 1: Meta tags
    const metaFields = extractMetaFields(html);
    for (const [key, val] of Object.entries(metaFields)) { if (!fields[key]) fields[key] = val; }

    // Layer 3: HTML fallbacks
    const htmlFields = extractHtmlFallbacks(html);
    for (const [key, val] of Object.entries(htmlFields)) { if (!fields[key]) fields[key] = val; }

    // Body text extraction (regex-based, replaces Readability)
    if (!fields.body) {
      const bodyText = extractBodyText(html);
      if (bodyText) fields.body = { value: bodyText, source: "html-body", confidence: 0.5 };
    }
  }

  // Apply site-specific hints (title stripping, etc.)
  applyMetaHints(fields, recipe);

  // Extract canonical URL
  const canonical = fields._canonical?.value || normalizedUrl;
  delete fields._canonical;

  // URL-based platform overrides
  if (recipe?.urlOverrides) {
    const overrides = recipe.urlOverrides as Record<string, Record<string, string>>;
    if (overrides.pathContains) {
      const path = new URL(normalizedUrl).pathname;
      for (const [pathFragment, overridePlatform] of Object.entries(overrides.pathContains)) {
        if (path.includes(pathFragment)) { platform = overridePlatform; break; }
      }
    }
  }

  // Compute overall confidence
  const fieldValues = Object.values(fields);
  const avgConfidence = fieldValues.length > 0
    ? fieldValues.reduce((sum, f) => sum + f.confidence, 0) / fieldValues.length
    : 0;

  return {
    success: Object.keys(fields).length > 0,
    platform,
    template,
    confidence: Math.round(avgConfidence * 100) / 100,
    fields,
    canonical,
    submitted: rawUrl,
    normalized: normalizedUrl,
    recipeUsed: recipeMatch?.key || null,
    fetchError: fetchError || undefined,
    extractionTime: `${Date.now() - startTime}ms`,
  };
}

// ─── API Routes ────────────────────────────────────────────────────

// GET /api/import?url=... — debug/test endpoint
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url || !url.startsWith("http")) return ok({ error: "Pass ?url=https://... to test import" });
  try {
    const result = await importUrl(url);
    return ok(result);
  } catch (e) {
    return ok({ error: e instanceof Error ? e.message : String(e) });
  }
}

// POST /api/import — main endpoint called by submit form
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return err("Invalid JSON body"); }

  const { url } = body;
  if (!url || typeof url !== "string" || !url.startsWith("http")) return err("Valid URL starting with http required");

  // Check cache
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return ok({ ...cached.data, fromCache: true });

  try {
    const result = await importUrl(url);
    if (result.success) {
      cache.set(url, { data: result, timestamp: Date.now() });
      if (result.canonical && result.canonical !== url) cache.set(result.canonical, { data: result, timestamp: Date.now() });
    }
    return ok(result);
  } catch (e) {
    console.error("[import] importUrl crashed:", e);
    return ok({
      success: false, platform: "article", template: "article", confidence: 0,
      fields: {}, canonical: url, submitted: url, normalized: url,
      recipeUsed: null, fetchError: e instanceof Error ? e.message : String(e), extractionTime: "0ms",
    });
  }
}

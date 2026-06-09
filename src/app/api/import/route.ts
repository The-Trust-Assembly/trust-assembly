import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api-utils";
import {
  fetchHtml,
  extractAllFields,
  extractBodyText,
  type Fields,
  type FieldResult,
} from "@/lib/import/extract";
import registryData from "../../../../site-registry.json";

// In-memory cache (24h TTL)
const cache = new Map<string, { data: ImportResult; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

interface ImportResult {
  success: boolean;
  platform: string;
  template: string;
  confidence: number;
  fields: Fields;
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
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
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
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
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

// ─── Platform APIs ─────────────────────────────────────────────────

async function extractWithRedditJson(url: string): Promise<Fields | null> {
  try {
    // Append .json to the path (before query string)
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/?$/, ".json");
    const jsonUrl = u.toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(jsonUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TrustAssembly/1.0; +https://trustassembly.org)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = await response.json();
    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post) return null;
    const fields: Fields = {};
    if (post.title) fields.title = { value: post.title, source: "reddit-json", confidence: 1.0 };
    if (post.author) fields.author = { value: `u/${post.author}`, source: "reddit-json", confidence: 1.0 };
    if (post.selftext) fields.body = { value: post.selftext, source: "reddit-json", confidence: 1.0 };
    if (post.subreddit) fields.subreddit = { value: post.subreddit, source: "reddit-json", confidence: 1.0 };
    if (post.thumbnail && post.thumbnail.startsWith("http")) fields.thumbnail = { value: post.thumbnail, source: "reddit-json", confidence: 0.9 };
    fields.postType = { value: post.is_self ? "text" : (post.is_video ? "video" : "link"), source: "reddit-json", confidence: 1.0 };
    return fields;
  } catch { return null; }
}

// Apply site registry metaHints (title stripping, field preferences)
function applyMetaHints(fields: Fields, recipe: Record<string, unknown> | null): void {
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
  let specialFields: Fields | null = null;
  if (recipe?.extractionStrategy === "reddit_json" || normalizedUrl.includes("reddit.com")) {
    specialFields = await extractWithRedditJson(normalizedUrl);
  }

  const { html, error: fetchError } = await fetchHtml(normalizedUrl);
  if (fetchError) console.warn(`[import] Fetch failed for ${normalizedUrl}: ${fetchError}`);

  // Run extraction layers — earlier layers fill first, later layers only fill gaps
  let fields: Fields = {};

  // Platform API results first (highest confidence)
  if (specialFields) {
    for (const [key, val] of Object.entries(specialFields)) { if (!fields[key]) fields[key] = val; }
  }

  if (html) {
    // Recipe selectors → JSON-LD → meta tags → HTML fallbacks
    const htmlFields = extractAllFields(html, recipe);
    for (const [key, val] of Object.entries(htmlFields)) { if (!fields[key]) fields[key] = val; }

    if (!fields.body) {
      const bodyText = extractBodyText(html, recipe);
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
  const fieldValues = Object.values(fields) as FieldResult[];
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

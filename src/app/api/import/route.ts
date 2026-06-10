import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api-utils";
import {
  fetchHtml,
  extractAllFields,
  extractBodyText,
  findAmpUrl,
  normalizeAuthors,
  type Fields,
  type FieldResult,
} from "@/lib/import/extract";
import { generateRecipe, validateRecipe } from "@/lib/import/llm-recipe";
import { getStoredRecipe, saveRecipe, logImport } from "@/lib/import/recipe-store";
import registryData from "../../../../site-registry.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  recipeSource: "registry" | "generated" | null;
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

// Extraction is "weak" when the article body is missing or stubby —
// the trigger for the AMP fallback and the LLM recipe generator.
const WEAK_BODY_CHARS = 400;
// Don't re-ask the LLM about a domain more than once per window —
// a fresh low-confidence recipe means the domain genuinely can't be
// extracted (JS-only shell), so this acts as a negative cache too.
const RECIPE_REGEN_WINDOW_MS = 6 * 60 * 60 * 1000;

function bodyIsWeak(fields: Fields): boolean {
  return !fields.body || fields.body.value.length < WEAK_BODY_CHARS;
}

// Re-extract with a recipe and merge: recipe-sourced fields win,
// everything else only fills gaps.
function mergeRecipeExtraction(html: string, recipeObj: Record<string, unknown>, fields: Fields): void {
  const re = extractAllFields(html, recipeObj);
  for (const [key, val] of Object.entries(re)) {
    if (val.source === "recipe" || !fields[key]) fields[key] = val;
  }
  if (bodyIsWeak(fields)) {
    const body = extractBodyText(html, recipeObj);
    if (body && body.length > (fields.body?.value.length || 0)) {
      fields.body = { value: body, source: "recipe-body", confidence: 0.8 };
    }
  }
}

async function importUrl(rawUrl: string): Promise<ImportResult> {
  const startTime = Date.now();
  const recipeMatch = findRecipe(rawUrl);
  const manualRecipe = recipeMatch?.recipe || null;
  const normalizedUrl = normalizeUrl(rawUrl, manualRecipe);
  const domain = (() => {
    try { return new URL(normalizedUrl).hostname.replace(/^www\./, ""); } catch { return ""; }
  })();

  // Generated recipe from a previous LLM run (manual registry wins)
  const stored = manualRecipe ? null : await getStoredRecipe(domain);
  const recipe = manualRecipe || (stored && stored.confidence > 0 ? stored.recipe : null);
  let recipeSource: ImportResult["recipeSource"] =
    manualRecipe ? "registry" : recipe ? "generated" : null;

  let platform = (manualRecipe?.platform as string) || "article";
  const template = (manualRecipe?.template as string) || "article";

  // Platform APIs (Reddit JSON)
  let specialFields: Fields | null = null;
  if (manualRecipe?.extractionStrategy === "reddit_json" || normalizedUrl.includes("reddit.com")) {
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

    // ── AMP fallback: free, no LLM. JS-rendered shells often link a
    // static AMP variant that extracts cleanly.
    if (bodyIsWeak(fields)) {
      const ampUrl = findAmpUrl(html, normalizedUrl);
      if (ampUrl) {
        const amp = await fetchHtml(ampUrl);
        if (amp.html) {
          const ampFields = extractAllFields(amp.html, recipe);
          for (const [key, val] of Object.entries(ampFields)) { if (!fields[key]) fields[key] = val; }
          const ampBody = extractBodyText(amp.html, recipe);
          if (ampBody && ampBody.length > (fields.body?.value.length || 0)) {
            fields.body = { value: ampBody, source: "amp-body", confidence: 0.6 };
          }
        }
      }
    }

    // ── LLM recipe generation: when extraction is still weak, ask
    // Haiku for CSS selectors (never content), validate them against
    // this page, and cache per-domain. Stale/failed recipes regenerate
    // after the window — that's the redesign drift detection.
    const recipeIsFresh = stored && Date.now() - stored.updatedAt.getTime() < RECIPE_REGEN_WINDOW_MS;
    if (bodyIsWeak(fields) && !manualRecipe && !recipeIsFresh && process.env.ANTHROPIC_API_KEY && domain) {
      const generated = await generateRecipe(normalizedUrl, html);
      if (generated) {
        const validation = validateRecipe(html, generated);
        if (validation.valid) {
          mergeRecipeExtraction(html, generated as unknown as Record<string, unknown>, fields);
          recipeSource = "generated";
          await saveRecipe(domain, generated as unknown as Record<string, unknown>, validation.confidence);
        } else {
          // Negative cache: remember that this domain can't be solved
          // with selectors right now, so we don't pay for the call again
          // on every import for the next window.
          await saveRecipe(domain, { selectors: {} }, 0);
        }
      }
    }
  }

  // Apply site-specific hints (title stripping, etc.)
  applyMetaHints(fields, manualRecipe);

  // Normalize the byline: strip "By", drop publication suffix, cap count
  if (fields.author?.value) {
    const siteName = fields.publication?.value || fields.siteName?.value;
    const normalized = normalizeAuthors(fields.author.value, siteName);
    if (normalized) fields.author.value = normalized;
    else delete fields.author;
  }

  // Extract canonical URL
  const canonical = fields._canonical?.value || normalizedUrl;
  delete fields._canonical;

  // URL-based platform overrides
  if (manualRecipe?.urlOverrides) {
    const overrides = manualRecipe.urlOverrides as Record<string, Record<string, string>>;
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

  const result: ImportResult = {
    success: Object.keys(fields).length > 0,
    platform,
    template,
    confidence: Math.round(avgConfidence * 100) / 100,
    fields,
    canonical,
    submitted: rawUrl,
    normalized: normalizedUrl,
    recipeUsed: recipeMatch?.key || (recipeSource === "generated" ? domain : null),
    recipeSource,
    fetchError: fetchError || undefined,
    extractionTime: `${Date.now() - startTime}ms`,
  };

  // Telemetry — fire and forget; failing domains become visible in
  // import_logs instead of guesswork.
  if (domain) {
    logImport({
      domain,
      url: normalizedUrl,
      success: result.success,
      confidence: result.confidence,
      fieldsFound: Object.keys(fields),
      bodyChars: fields.body?.value.length || 0,
      recipeSource: recipeSource || "none",
      fetchError: fetchError || undefined,
    }).catch(() => {});
  }

  return result;
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
      recipeUsed: null, recipeSource: null,
      fetchError: e instanceof Error ? e.message : String(e), extractionTime: "0ms",
    });
  }
}

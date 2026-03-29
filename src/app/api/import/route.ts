import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { ok, err } from "@/lib/api-utils";
import registryData from "../../../../site-registry.json";

// In-memory cache (24h TTL)
const cache = new Map<string, { data: ImportResult; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

// Use a browser-like User-Agent — many sites (CNN, NYT, etc.) block bot-like UAs
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface FieldResult {
  value: string;
  source: string;
  confidence: number;
}

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
  extractionTime: string;
  fromCache?: boolean;
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

  if (normRules?.normalizeDomain) {
    url.hostname = normRules.normalizeDomain as string;
  }

  return url.toString();
}

// ─── Recipe Lookup ─────────────────────────────────────────────────

const registry = registryData as Record<string, unknown>;
const recipes = (registry.recipes || {}) as Record<string, Record<string, unknown>>;

function findRecipe(rawUrl: string): { key: string; recipe: Record<string, unknown> } | null {
  const hostname = new URL(rawUrl).hostname.replace(/^www\./, "");

  for (const [key, recipe] of Object.entries(recipes)) {
    if (key.startsWith("_")) continue;
    const domains = recipe.domains as string[] | undefined;
    if (domains?.includes(hostname) || domains?.includes(`www.${hostname}`)) {
      return { key, recipe };
    }
    const domainPattern = recipe.domainPattern as string | undefined;
    if (domainPattern) {
      const pattern = domainPattern.replace("*.", "");
      if (hostname.endsWith(pattern) && hostname !== pattern) {
        return { key, recipe };
      }
    }
  }
  return null;
}

// ─── Extraction Layers ─────────────────────────────────────────────

function extractMetaValue($: cheerio.CheerioAPI, key: string): string | null {
  let el = $(`meta[property="${key}"]`);
  if (el.length) return el.attr("content") || null;
  el = $(`meta[name="${key}"]`);
  if (el.length) return el.attr("content") || null;
  if (key === "title") return $("title").text().trim() || null;
  return null;
}

function extractWithSelectors($: cheerio.CheerioAPI, selectors: Record<string, Record<string, unknown>>): Record<string, FieldResult> {
  const fields: Record<string, FieldResult> = {};
  for (const [fieldName, config] of Object.entries(selectors)) {
    if (fieldName.startsWith("_")) continue;
    let value: string | null = null;
    let source = "selector";
    const css = config.css as string | null;
    if (css) {
      const el = $(css).first();
      if (el.length) {
        value = config.attr ? (el.attr(config.attr as string) || null) : el.text().trim();
      }
      if (config.multi && $(css).length > 1) {
        const values: string[] = [];
        $(css).each((_, el) => { const text = $(el).text().trim(); if (text) values.push(text); });
        if (values.length > 0) value = values.join((config.separator as string || ", ") + " ");
      }
    }
    if (!value && config.fallback) {
      value = extractMetaValue($, config.fallback as string);
      source = "meta";
    }
    if (value) {
      fields[fieldName] = { value: value.trim(), source, confidence: source === "selector" ? 0.9 : 0.7 };
    }
  }
  return fields;
}

async function extractWithRedditJson(url: string): Promise<Record<string, FieldResult> | null> {
  try {
    const jsonUrl = url.replace(/\/?(\?.*)?$/, ".json$1");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(jsonUrl, {
      headers: { "User-Agent": "TrustAssembly/1.0" },
      signal: controller.signal,
    });
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

async function extractWithOembed(url: string, recipe: Record<string, unknown>): Promise<Record<string, FieldResult> | null> {
  const endpoint = recipe.oembedEndpoint as string | undefined;
  if (!endpoint) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(endpoint + encodeURIComponent(url), { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = await response.json();
    const fields: Record<string, FieldResult> = {};
    if (data.title) fields.title = { value: data.title, source: "oembed", confidence: 0.85 };
    if (data.author_name) fields.author = { value: data.author_name, source: "oembed", confidence: 0.85 };
    if (data.provider_name) fields.publication = { value: data.provider_name, source: "oembed", confidence: 0.85 };
    return fields;
  } catch { return null; }
}

function extractMetaTags($: cheerio.CheerioAPI): Record<string, FieldResult> {
  const fields: Record<string, FieldResult> = {};
  const mappings = [
    { field: "title", tags: ["og:title", "twitter:title", "title"] },
    { field: "description", tags: ["og:description", "twitter:description", "description"] },
    { field: "author", tags: ["article:author", "twitter:creator", "author"] },
    { field: "publishDate", tags: ["article:published_time", "date", "pubdate"] },
    { field: "siteName", tags: ["og:site_name", "twitter:site", "application-name"] },
    { field: "thumbnail", tags: ["og:image", "twitter:image", "thumbnail"] },
  ];
  for (const { field, tags } of mappings) {
    for (const tag of tags) {
      const value = extractMetaValue($, tag);
      if (value) { fields[field] = { value, source: "meta", confidence: 0.7 }; break; }
    }
  }
  return fields;
}

function extractJsonLd($: cheerio.CheerioAPI): Record<string, FieldResult> {
  const fields: Record<string, FieldResult> = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      let data = JSON.parse($(el).html() || "");
      if (data["@graph"]) data = data["@graph"];
      if (!Array.isArray(data)) data = [data];
      for (const item of data) {
        const type = item["@type"];
        if (["NewsArticle", "Article", "BlogPosting", "WebPage", "ReportageNewsArticle"].includes(type)) {
          if (item.headline && !fields.title) fields.title = { value: item.headline, source: "json-ld", confidence: 0.85 };
          if (item.author) {
            const authors = Array.isArray(item.author) ? item.author : [item.author];
            const names = authors.map((a: Record<string, string>) => a.name || a).filter(Boolean);
            if (names.length > 0 && !fields.author) fields.author = { value: names.join(", "), source: "json-ld", confidence: 0.9 };
          }
          if (item.datePublished && !fields.publishDate) fields.publishDate = { value: item.datePublished, source: "json-ld", confidence: 0.9 };
          if (item.publisher?.name && !fields.publication) fields.publication = { value: item.publisher.name, source: "json-ld", confidence: 0.9 };
        }
        if (type === "Product") {
          if (item.name && !fields.title) fields.title = { value: item.name, source: "json-ld", confidence: 0.95 };
          if (item.brand?.name && !fields.brand) fields.brand = { value: item.brand.name, source: "json-ld", confidence: 0.95 };
          if (item.description && !fields.description) fields.description = { value: item.description, source: "json-ld", confidence: 0.85 };
          if (item.aggregateRating && !fields.rating) {
            fields.rating = { value: `${item.aggregateRating.ratingValue}/${item.aggregateRating.bestRating || 5} (${item.aggregateRating.reviewCount || "?"} reviews)`, source: "json-ld", confidence: 0.95 };
          }
        }
        if (type === "VideoObject") {
          if (item.name && !fields.title) fields.title = { value: item.name, source: "json-ld", confidence: 0.9 };
          if (item.duration && !fields.duration) fields.duration = { value: item.duration, source: "json-ld", confidence: 0.9 };
          if (item.author?.name && !fields.author) fields.author = { value: item.author.name, source: "json-ld", confidence: 0.9 };
        }
        if (["PodcastEpisode", "AudioObject", "RadioEpisode"].includes(type)) {
          if (item.name && !fields.title) fields.title = { value: item.name, source: "json-ld", confidence: 0.9 };
          if (item.duration && !fields.duration) fields.duration = { value: item.duration, source: "json-ld", confidence: 0.9 };
          if (item.partOfSeries?.name && !fields.showName) fields.showName = { value: item.partOfSeries.name, source: "json-ld", confidence: 0.9 };
        }
      }
    } catch { /* invalid JSON-LD */ }
  });
  return fields;
}

function extractWithReadability(html: string, url: string): Record<string, FieldResult> {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (article) {
      const result: Record<string, FieldResult> = {};
      if (article.textContent) result.body = { value: article.textContent.substring(0, 5000), source: "readability", confidence: 0.6 };
      if (article.title && !article.title.includes("|")) result.title = { value: article.title, source: "readability", confidence: 0.5 };
      if (article.byline) result.author = { value: article.byline, source: "readability", confidence: 0.5 };
      return result;
    }
  } catch { /* readability failed */ }
  return {};
}

function findCanonicalUrl($: cheerio.CheerioAPI, originalUrl: string): string {
  const canonical = $('link[rel="canonical"]').attr("href");
  if (canonical) return canonical;
  const ogUrl = $('meta[property="og:url"]').attr("content");
  if (ogUrl) return ogUrl;
  return originalUrl;
}

// ─── Main Import Function ──────────────────────────────────────────

async function importUrl(rawUrl: string): Promise<ImportResult> {
  const startTime = Date.now();
  const recipeMatch = findRecipe(rawUrl);
  const recipe = recipeMatch?.recipe || null;
  const normalizedUrl = normalizeUrl(rawUrl, recipe);

  let platform = (recipe?.platform as string) || "article";
  let template = (recipe?.template as string) || "article";

  // Special extraction strategies
  let specialFields: Record<string, FieldResult> | null = null;
  if (recipe?.extractionStrategy === "reddit_json") {
    specialFields = await extractWithRedditJson(normalizedUrl);
  } else if (recipe?.extractionStrategy === "oembed") {
    specialFields = await extractWithOembed(normalizedUrl, recipe);
  }

  // Fetch HTML (8-second timeout, browser-like headers to avoid blocks)
  let html: string | null = null;
  let $: cheerio.CheerioAPI | null = null;
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
      html = await response.text();
      $ = cheerio.load(html);
    } else {
      fetchError = `HTTP ${response.status} ${response.statusText}`;
      console.warn(`[import] Fetch failed for ${normalizedUrl}: ${fetchError}`);
    }
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e);
    console.warn(`[import] Fetch error for ${normalizedUrl}: ${fetchError}`);
  }

  // Run extraction layers — earlier layers win
  let fields: Record<string, FieldResult> = {};

  // Layer 1: Site-specific selectors
  if ($ && recipe?.selectors) {
    fields = { ...fields, ...extractWithSelectors($, recipe.selectors as Record<string, Record<string, unknown>>) };
  }

  // Layer 2: Special strategies
  if (specialFields) {
    for (const [key, val] of Object.entries(specialFields)) {
      if (!fields[key]) fields[key] = val;
    }
  }

  // Layer 3: Meta tags
  if ($) {
    const metaFields = extractMetaTags($);
    for (const [key, val] of Object.entries(metaFields)) { if (!fields[key]) fields[key] = val; }
  }

  // Layer 4: JSON-LD
  if ($) {
    const jsonLdFields = extractJsonLd($);
    for (const [key, val] of Object.entries(jsonLdFields)) { if (!fields[key]) fields[key] = val; }
  }

  // Layer 5: Readability
  if (html) {
    const readabilityFields = extractWithReadability(html, normalizedUrl);
    for (const [key, val] of Object.entries(readabilityFields)) { if (!fields[key]) fields[key] = val; }
  }

  const canonical = $ ? findCanonicalUrl($, normalizedUrl) : normalizedUrl;

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

// ─── API Route ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { url } = body;
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    return err("Valid URL starting with http required");
  }

  // Check cache
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return ok({ ...cached.data, fromCache: true });
  }

  try {
    const result = await importUrl(url);

    // Cache successful results
    if (result.success) {
      cache.set(url, { data: result, timestamp: Date.now() });
      if (result.canonical && result.canonical !== url) {
        cache.set(result.canonical, { data: result, timestamp: Date.now() });
      }
    }

    return ok(result);
  } catch (e) {
    // Import failed — return empty result, never block the user
    return ok({
      success: false,
      platform: "article",
      template: "article",
      confidence: 0,
      fields: {},
      canonical: url,
      submitted: url,
      normalized: url,
      recipeUsed: null,
      extractionTime: "0ms",
    });
  }
}

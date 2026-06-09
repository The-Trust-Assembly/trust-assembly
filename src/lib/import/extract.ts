// Trust Assembly Import Service — extraction engine
// ----------------------------------------------------
// Cheerio-based extraction shared by /api/import. Replaces the old
// regex extraction, which truncated values at apostrophes, missed
// JSON-LD @type arrays, and captured nested containers incorrectly.
//
// Extraction layers (earlier layers win, later layers fill gaps):
//   0. Site-registry CSS selectors (per-site recipes)
//   1. JSON-LD structured data
//   2. Meta tags (og:, twitter:, standard)
//   3. HTML fallbacks (<title>, <h1>, rel=author, canonical)
//   4. Body text (recipe selector → scored containers → all <p>)

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

export interface FieldResult {
  value: string;
  source: string;
  confidence: number;
}

export type Fields = Record<string, FieldResult>;

// ─── Fetching ──────────────────────────────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const BOT_UA =
  "Mozilla/5.0 (compatible; TrustAssembly/1.0; +https://trustassembly.org)";

const FETCH_TIMEOUT_MS = 9000;
// Modern news pages run 500KB-2MB of HTML; the old 200KB cap cut
// JSON-LD blocks and article bodies in half.
const MAX_BYTES = 1_500_000;

export interface FetchHtmlResult {
  html: string | null;
  error: string | null;
  httpStatus?: number;
}

async function fetchOnce(url: string, userAgent: string): Promise<FetchHtmlResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      return { html: null, error: `HTTP ${response.status}`, httpStatus: response.status };
    }

    // Read up to MAX_BYTES, then decode with the declared charset
    const reader = response.body?.getReader();
    if (!reader) return { html: null, error: "Empty response body" };
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (totalBytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalBytes += value.length;
    }
    reader.cancel().catch(() => {});

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk.subarray(0, totalBytes - offset), offset);
      offset += chunk.length;
      if (offset >= totalBytes) break;
    }
    return { html: decodeHtmlBytes(bytes, response.headers.get("content-type")), error: null };
  } catch (e) {
    const message = e instanceof Error ? (e.name === "AbortError" ? "Timed out" : e.message) : String(e);
    return { html: null, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

function decodeHtmlBytes(bytes: Uint8Array, contentType: string | null): string {
  const headerCharset = contentType?.match(/charset=([\w-]+)/i)?.[1];
  if (headerCharset) {
    try {
      return new TextDecoder(headerCharset.toLowerCase()).decode(bytes);
    } catch { /* unknown label — fall through to UTF-8 */ }
  }
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  // No charset header — check for a <meta charset> declaration
  const metaCharset = utf8.slice(0, 2048).match(/charset=["']?([\w-]+)/i)?.[1]?.toLowerCase();
  if (metaCharset && metaCharset !== "utf-8" && metaCharset !== "utf8") {
    try {
      return new TextDecoder(metaCharset).decode(bytes);
    } catch { /* unknown label */ }
  }
  return utf8;
}

// Fetch with a browser UA first; on a block (401/403/429/503) retry
// once with the identified-crawler UA, which some publishers allow.
export async function fetchHtml(url: string): Promise<FetchHtmlResult> {
  const first = await fetchOnce(url, BROWSER_UA);
  if (first.html) return first;
  if (first.httpStatus && [401, 403, 429, 503].includes(first.httpStatus)) {
    const second = await fetchOnce(url, BOT_UA);
    if (second.html) return second;
  }
  return first;
}

// ─── Layer 0: Site-registry CSS selectors ──────────────────────────

interface SelectorRule {
  css?: string;
  attr?: string | null;
  multi?: boolean;
  separator?: string;
  fallback?: string;
  strategy?: string;
}

function extractWithSelector($: CheerioAPI, rule: SelectorRule): string | null {
  if (!rule.css) return null;
  let elements;
  try {
    elements = $(rule.css);
  } catch {
    return null; // invalid selector in registry
  }
  if (elements.length === 0) return null;

  const readOne = (el: ReturnType<CheerioAPI>) =>
    (rule.attr ? el.attr(rule.attr) : el.text())?.trim() || null;

  if (rule.multi) {
    const values: string[] = [];
    elements.each((_, el) => {
      const v = readOne($(el));
      if (v && !values.includes(v)) values.push(v);
    });
    return values.length > 0 ? values.join(rule.separator || ", ") : null;
  }
  return readOne(elements.first());
}

export function extractRecipeFields(
  $: CheerioAPI,
  recipe: Record<string, unknown> | null
): Fields {
  const fields: Fields = {};
  const selectors = recipe?.selectors as Record<string, SelectorRule> | undefined;
  if (!selectors) return fields;

  for (const [field, rule] of Object.entries(selectors)) {
    if (field === "body") continue; // handled by extractBodyText
    const value = extractWithSelector($, rule);
    if (value) fields[field] = { value, source: "recipe", confidence: 0.95 };
  }
  return fields;
}

// ─── Layer 1: JSON-LD structured data ──────────────────────────────

const ARTICLE_TYPES = new Set([
  "NewsArticle", "Article", "BlogPosting", "WebPage", "ReportageNewsArticle",
  "LiveBlogPosting", "OpinionNewsArticle", "AnalysisNewsArticle",
  "BackgroundNewsArticle", "ScholarlyArticle", "TechArticle", "SocialMediaPosting",
]);

// @type may be a string or an array of strings
function typeMatches(rawType: unknown, allowed: Set<string>): boolean {
  const types = Array.isArray(rawType) ? rawType : [rawType];
  return types.some((t) => typeof t === "string" && allowed.has(t));
}

function authorNames(rawAuthor: unknown): string | null {
  const authors = Array.isArray(rawAuthor) ? rawAuthor : [rawAuthor];
  const names = authors
    .map((a) => {
      if (typeof a === "string") return a.trim();
      if (a && typeof a === "object") {
        const name = (a as Record<string, unknown>).name;
        return typeof name === "string" ? name.trim() : null;
      }
      return null;
    })
    .filter((n): n is string => !!n && n.length > 0);
  return names.length > 0 ? [...new Set(names)].join(", ") : null;
}

export function extractJsonLd($: CheerioAPI): Fields {
  const fields: Fields = {};
  const setOnce = (key: string, value: unknown, confidence: number) => {
    if (fields[key]) return;
    const str = typeof value === "string" ? value.trim() : String(value ?? "").trim();
    if (str) fields[key] = { value: str, source: "json-ld", confidence };
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw?.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // malformed or truncated JSON-LD
    }

    // Flatten top-level arrays and @graph containers
    const items: Record<string, unknown>[] = [];
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj["@graph"])) queue.push(...(obj["@graph"] as unknown[]));
      if (obj["@type"]) items.push(obj);
    }

    for (const item of items) {
      if (typeMatches(item["@type"], ARTICLE_TYPES)) {
        setOnce("title", item.headline || item.name, 0.9);
        setOnce("description", item.description, 0.85);
        if (item.author && !fields.author) {
          const names = authorNames(item.author);
          if (names) fields.author = { value: names, source: "json-ld", confidence: 0.9 };
        }
        setOnce("publishDate", item.datePublished, 0.9);
        const publisher = item.publisher as Record<string, unknown> | undefined;
        setOnce("publication", publisher?.name, 0.9);
        const image = item.image as Record<string, unknown> | string | string[] | undefined;
        if (typeof image === "string") setOnce("thumbnail", image, 0.85);
        else if (Array.isArray(image)) setOnce("thumbnail", image[0], 0.85);
        else if (image?.url) setOnce("thumbnail", image.url, 0.85);
      }
      if (typeMatches(item["@type"], new Set(["Product"]))) {
        setOnce("title", item.name, 0.95);
        const brand = item.brand as Record<string, unknown> | undefined;
        setOnce("brand", typeof item.brand === "string" ? item.brand : brand?.name, 0.95);
        setOnce("description", item.description, 0.85);
        const rating = item.aggregateRating as Record<string, unknown> | undefined;
        if (rating?.ratingValue && !fields.rating) {
          fields.rating = {
            value: `${rating.ratingValue}/${rating.bestRating || 5} (${rating.reviewCount || "?"} reviews)`,
            source: "json-ld",
            confidence: 0.95,
          };
        }
      }
      if (typeMatches(item["@type"], new Set(["VideoObject"]))) {
        setOnce("title", item.name, 0.9);
        setOnce("duration", item.duration, 0.9);
        const author = item.author as Record<string, unknown> | undefined;
        setOnce("author", author?.name, 0.9);
      }
      if (typeMatches(item["@type"], new Set(["PodcastEpisode", "AudioObject", "RadioEpisode"]))) {
        setOnce("title", item.name, 0.9);
        setOnce("duration", item.duration, 0.9);
        const series = item.partOfSeries as Record<string, unknown> | undefined;
        setOnce("showName", series?.name, 0.9);
      }
    }
  });

  return fields;
}

// ─── Layer 2: Meta tags ────────────────────────────────────────────

function getMeta($: CheerioAPI, nameOrProp: string): string | null {
  const value =
    $(`meta[property="${nameOrProp}"]`).attr("content") ||
    $(`meta[name="${nameOrProp}"]`).attr("content") ||
    $(`meta[itemprop="${nameOrProp}"]`).attr("content");
  return value?.trim() || null;
}

export function extractMetaFields($: CheerioAPI): Fields {
  const fields: Fields = {};
  const metaMappings: Array<{ field: string; tags: string[]; confidence: number }> = [
    { field: "title", tags: ["og:title", "twitter:title"], confidence: 0.8 },
    { field: "description", tags: ["og:description", "twitter:description", "description"], confidence: 0.7 },
    { field: "author", tags: ["article:author", "author", "parsely-author", "sailthru.author", "dc.creator", "twitter:creator", "byl"], confidence: 0.7 },
    { field: "publishDate", tags: ["article:published_time", "parsely-pub-date", "date", "pubdate", "sailthru.date"], confidence: 0.7 },
    { field: "siteName", tags: ["og:site_name", "twitter:site", "application-name"], confidence: 0.7 },
    { field: "thumbnail", tags: ["og:image", "twitter:image"], confidence: 0.8 },
  ];
  for (const { field, tags, confidence } of metaMappings) {
    for (const tag of tags) {
      const value = getMeta($, tag);
      // article:author is sometimes a profile URL, not a name — skip those
      if (value && !(field === "author" && /^https?:\/\//.test(value))) {
        fields[field] = { value, source: "meta", confidence };
        break;
      }
    }
  }
  return fields;
}

// ─── Layer 3: HTML fallbacks ───────────────────────────────────────

export function extractHtmlFallbacks($: CheerioAPI): Fields {
  const fields: Fields = {};

  const titleTag = $("title").first().text().trim();
  if (titleTag) {
    // Strip common " | Site Name" suffixes
    const stripped = titleTag.replace(/\s*[|\-–—]\s*[^|\-–—]{2,40}$/, "").trim();
    const title = stripped.length > 10 ? stripped : titleTag;
    if (title.length > 3) fields.title = { value: title, source: "html-title", confidence: 0.6 };
  }

  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  if (!fields.title && h1.length > 5) {
    fields.title = { value: h1, source: "html-h1", confidence: 0.5 };
  }

  const authorLinks: string[] = [];
  $('a[rel="author"]').each((_, el) => {
    const name = $(el).text().trim();
    if (name && !authorLinks.includes(name)) authorLinks.push(name);
  });
  if (authorLinks.length > 0) {
    fields.author = { value: authorLinks.join(", "), source: "html-rel-author", confidence: 0.6 };
  }

  const time = $("time[datetime]").first().attr("datetime")?.trim();
  if (time) fields.publishDate = { value: time, source: "html-time", confidence: 0.6 };

  const canonical = $('link[rel="canonical"]').attr("href")?.trim() || getMeta($, "og:url");
  if (canonical) fields._canonical = { value: canonical, source: "html", confidence: 1.0 };

  return fields;
}

// ─── Layer 4: Body text ────────────────────────────────────────────

const BODY_CONTAINER_SELECTORS = [
  '[itemprop="articleBody"]',
  "article",
  '[role="article"]',
  ".article-body", ".article__body", ".article-content", ".article__content",
  ".story-body", ".story-content",
  ".post-content", ".post-body", ".entry-content",
  ".rich-text", ".body-copy",
  "main",
];

const NOISE_SELECTORS = [
  "script", "style", "noscript", "template", "svg", "iframe", "form",
  "nav", "header", "footer", "aside", "figure", "button",
  '[class*="advert"]', '[class*="promo"]', '[class*="newsletter"]',
  '[class*="related"]', '[class*="comment"]', '[class*="share"]',
  '[class*="social"]', '[class*="sidebar"]', '[class*="paywall"]',
  '[id*="advert"]', '[id*="sidebar"]', '[id*="comment"]',
].join(", ");

const MAX_BODY_CHARS = 10000;
const MIN_PARAGRAPH_CHARS = 30;

function paragraphsFrom($: CheerioAPI, container: ReturnType<CheerioAPI>): string[] {
  const paragraphs: string[] = [];
  container.find("p, blockquote, h2, h3, li").each((_, el) => {
    // Skip elements nested inside another collected element (e.g. <p> in <blockquote>)
    if ($(el).parents("blockquote, li").length > 0) return;
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length >= MIN_PARAGRAPH_CHARS) paragraphs.push(text);
  });
  return paragraphs;
}

export function extractBodyText(html: string, recipe: Record<string, unknown> | null): string | null {
  const $ = cheerio.load(html);
  $(NOISE_SELECTORS).remove();

  // Recipe body selector — collect paragraph elements directly
  const bodyRule = (recipe?.selectors as Record<string, SelectorRule> | undefined)?.body;
  if (bodyRule?.css) {
    try {
      const elements = $(bodyRule.css);
      if (elements.length > 0) {
        const paragraphs: string[] = [];
        elements.each((_, el) => {
          const text = $(el).text().replace(/\s+/g, " ").trim();
          if (text.length >= MIN_PARAGRAPH_CHARS) paragraphs.push(text);
        });
        if (paragraphs.length > 0) return paragraphs.join("\n\n").slice(0, MAX_BODY_CHARS);
      }
    } catch { /* invalid selector — fall through */ }
  }

  // Score candidate containers by total paragraph text; pick the best
  // rather than the first match, so a stub <article> in a sidebar
  // doesn't shadow the real story body.
  let bestParagraphs: string[] = [];
  let bestScore = 0;
  for (const selector of BODY_CONTAINER_SELECTORS) {
    $(selector).each((_, el) => {
      const paragraphs = paragraphsFrom($, $(el));
      const score = paragraphs.reduce((sum, p) => sum + p.length, 0);
      if (score > bestScore) {
        bestScore = score;
        bestParagraphs = paragraphs;
      }
    });
    if (bestScore > 1500) break; // strong match — no need to scan weaker selectors
  }

  if (bestScore < 200) {
    // Last resort: every <p> on the page
    const all = paragraphsFrom($, $("body"));
    const allScore = all.reduce((sum, p) => sum + p.length, 0);
    if (allScore > bestScore) bestParagraphs = all;
  }

  if (bestParagraphs.length === 0) return null;
  return bestParagraphs.join("\n\n").slice(0, MAX_BODY_CHARS);
}

// ─── Combined extraction ───────────────────────────────────────────

export function extractAllFields(html: string, recipe: Record<string, unknown> | null): Fields {
  const $ = cheerio.load(html);
  const fields: Fields = {};
  const layers = [
    extractRecipeFields($, recipe),
    extractJsonLd($),
    extractMetaFields($),
    extractHtmlFallbacks($),
  ];
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (!fields[key]) fields[key] = value;
    }
  }
  return fields;
}

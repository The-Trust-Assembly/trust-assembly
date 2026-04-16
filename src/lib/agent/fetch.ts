// Trust Assembly Agent — article fetcher
// ----------------------------------------
// Server-side article fetcher using cheerio (already installed for the
// import service). The desktop app uses jsdom + Mozilla Readability,
// which would add ~7MB of dependencies. Cheerio + heuristics is good
// enough for most modern article pages and adds zero new deps.
//
// For each URL: fetch HTML, strip script/style/nav/footer/aside, try
// common article container selectors, fall back to body text. Truncate
// to MAX_CHARS so we don't blow up Claude prompts.

import * as cheerio from "cheerio";

const MAX_CHARS = 30000;
const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; TrustAssemblyAgent/1.0; +https://trustassembly.org)";

const ARTICLE_SELECTORS = [
  "article",
  '[role="article"]',
  ".article-body",
  ".article-content",
  ".post-content",
  ".entry-content",
  ".story-body",
  "main",
];

export interface FetchedArticle {
  url: string;
  headline?: string;
  text: string;
}

export interface FetchError {
  url: string;
  error: string;
}

export type FetchResult =
  | { success: true; article: FetchedArticle }
  | { success: false; error: FetchError };

export async function fetchArticle(url: string): Promise<FetchResult> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!response.ok) {
      return { success: false, error: { url, error: `HTTP ${response.status}` } };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Pull headline from <h1> or og:title or <title>
    const headline =
      $("h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("title").first().text().trim() ||
      undefined;

    // Strip noise
    $("script, style, noscript, nav, header, footer, aside, form, iframe").remove();
    $('[class*="advert"], [class*="sidebar"], [class*="related"], [class*="comment"]').remove();
    $('[id*="advert"], [id*="sidebar"], [id*="related"], [id*="comment"]').remove();

    // Try article selectors
    let text = "";
    for (const selector of ARTICLE_SELECTORS) {
      const element = $(selector).first();
      if (element.length) {
        const candidate = element.text().trim();
        if (candidate.length > 200) {
          text = candidate;
          break;
        }
      }
    }

    // Fall back to body
    if (!text) {
      text = $("body").text().trim();
    }

    // Normalize whitespace
    text = text.replace(/\s+/g, " ").trim();

    if (!text || text.length < 100) {
      return { success: false, error: { url, error: "No article content extracted" } };
    }

    if (text.length > MAX_CHARS) {
      text = text.substring(0, MAX_CHARS) + "\n\n[Article truncated for analysis]";
    }

    return { success: true, article: { url, headline, text } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: { url, error: message } };
  }
}

const FETCH_CONCURRENCY = 4;

export async function fetchArticles(urls: string[]): Promise<{
  articles: FetchedArticle[];
  errors: FetchError[];
}> {
  const articles: FetchedArticle[] = [];
  const errors: FetchError[] = [];

  // Process in batches to avoid hammering target sites and rate limits
  for (let i = 0; i < urls.length; i += FETCH_CONCURRENCY) {
    const batch = urls.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map(fetchArticle));
    for (const r of results) {
      if (r.success) articles.push(r.article);
      else errors.push(r.error);
    }
  }

  return { articles, errors };
}

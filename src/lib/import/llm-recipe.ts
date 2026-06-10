// Trust Assembly Import Service — LLM recipe generation
// ---------------------------------------------------------
// Fallback for domains where deterministic extraction comes back
// weak. Instead of asking the model to transcribe content (which
// would corrupt exact-text matching for inline edits), we send a
// compact STRUCTURAL DIGEST of the page and ask Haiku to return
// CSS selectors. The selectors are validated against the same HTML
// with the deterministic cheerio extractor, then cached per-domain
// in import_recipes. Content is always extracted by cheerio.
//
// Cost: ~2k input tokens + ~200 output tokens on Haiku — a fraction
// of a cent, paid once per domain per site redesign.

import * as cheerio from "cheerio";
import { extractRecipeFields } from "./extract.ts";

const MAX_DIGEST_CHARS = 9000;
const MIN_VALID_BODY_CHARS = 400;
const MIN_VALID_TITLE_CHARS = 10;

// ─── Structural digest ─────────────────────────────────────────────

function selectorFor($: cheerio.CheerioAPI, el: Parameters<cheerio.CheerioAPI>[0]): string {
  const node = $(el);
  const tag = (node.prop("tagName") || "div").toLowerCase();
  const id = node.attr("id");
  if (id && /^[A-Za-z][\w-]*$/.test(id)) return `${tag}#${id}`;
  const classes = (node.attr("class") || "")
    .split(/\s+/)
    .filter((c) => /^[A-Za-z][\w-]*$/.test(c))
    .slice(0, 2);
  return classes.length > 0 ? `${tag}.${classes.join(".")}` : tag;
}

// Build a compact text description of the page structure: meta tags,
// headline candidates, byline candidates, timestamps, and paragraph
// containers. This is what the model sees — never the raw HTML.
export function buildDomDigest(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, template").remove();

  const lines: string[] = [];

  lines.push("== META TAGS ==");
  let metaCount = 0;
  $("meta").each((_, el) => {
    if (metaCount >= 25) return;
    const name = $(el).attr("property") || $(el).attr("name");
    const content = $(el).attr("content");
    if (name && content) {
      lines.push(`meta[${name}] = ${content.slice(0, 110)}`);
      metaCount++;
    }
  });

  lines.push("", "== HEADLINE CANDIDATES ==");
  $("h1, h2").slice(0, 6).each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim().slice(0, 110);
    if (text) lines.push(`${selectorFor($, el)} :: "${text}"`);
  });

  lines.push("", "== BYLINE CANDIDATES ==");
  let bylineCount = 0;
  $('[class*="byline"], [class*="author"], [class*="contributor"], [rel="author"], [itemprop="author"]').each((_, el) => {
    if (bylineCount >= 10) return;
    const text = $(el).text().replace(/\s+/g, " ").trim().slice(0, 90);
    if (text && text.length > 2) {
      lines.push(`${selectorFor($, el)} :: "${text}"`);
      bylineCount++;
    }
  });

  lines.push("", "== TIMESTAMPS ==");
  $("time").slice(0, 5).each((_, el) => {
    const dt = $(el).attr("datetime") || "";
    const text = $(el).text().replace(/\s+/g, " ").trim().slice(0, 60);
    lines.push(`${selectorFor($, el)}${dt ? ` [datetime=${dt}]` : ""} :: "${text}"`);
  });

  lines.push("", "== PARAGRAPH CONTAINERS (direct <p> children) ==");
  const containers: Array<{ sel: string; pCount: number; textLen: number; preview: string }> = [];
  $("div, section, article, main").each((_, el) => {
    const node = $(el);
    const directPs = node.children("p");
    if (directPs.length < 2) return;
    let textLen = 0;
    directPs.each((_, p) => { textLen += $(p).text().length; });
    if (textLen < 150) return;
    containers.push({
      sel: selectorFor($, el),
      pCount: directPs.length,
      textLen,
      preview: directPs.first().text().replace(/\s+/g, " ").trim().slice(0, 130),
    });
  });
  containers.sort((a, b) => b.textLen - a.textLen);
  const seenSelectors = new Set<string>();
  for (const c of containers) {
    if (seenSelectors.has(c.sel)) continue;
    seenSelectors.add(c.sel);
    lines.push(`${c.sel} :: ${c.pCount} paragraphs, ${c.textLen} chars :: "${c.preview}"`);
    if (seenSelectors.size >= 8) break;
  }

  return lines.join("\n").slice(0, MAX_DIGEST_CHARS);
}

// ─── Recipe generation ─────────────────────────────────────────────

export interface GeneratedRecipe {
  selectors: Record<string, { css?: string; attr?: string | null; multi?: boolean; separator?: string }>;
}

const RECIPE_PROMPT = `You are configuring a CSS-selector extraction recipe for a news/article page. Below is a structural digest of the page: its meta tags, headline candidates, byline candidates, timestamps, and paragraph containers, each with the CSS selector that matches it.

URL: {{URL}}

{{DIGEST}}

Pick the selectors that identify the MAIN article content (not related stories, teasers, or comments). Respond with ONLY a JSON object in this exact shape (omit any field you cannot determine confidently):

{
  "selectors": {
    "title": { "css": "<selector for the article headline>" },
    "author": { "css": "<selector for byline name element(s)>", "multi": true },
    "publishDate": { "css": "<selector for time element>", "attr": "datetime" },
    "body": { "css": "<selector for the container holding the article paragraphs, suffixed with ' p' to select the paragraphs>" }
  }
}

Rules:
- Use ONLY selectors that appear in the digest (you may append " p" to a container selector for body).
- For body, choose the container with the most paragraph text that reads like the article itself.
- Prefer class-based selectors over bare tag names.
- If the page appears to be a video page, gallery, or has no real article body, return {"selectors": {}}.`;

export type ModelCaller = (prompt: string) => Promise<string>;

// Default caller uses Haiku via the shared Anthropic client.
async function defaultCaller(prompt: string): Promise<string> {
  const { getClaudeClient, HAIKU_MODEL } = await import("@/lib/agent/claude-client");
  const claude = getClaudeClient();
  const response = await claude.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}

export async function generateRecipe(
  url: string,
  html: string,
  caller: ModelCaller = defaultCaller
): Promise<GeneratedRecipe | null> {
  const digest = buildDomDigest(html);
  const prompt = RECIPE_PROMPT.replace("{{URL}}", url).replace("{{DIGEST}}", digest);

  let raw: string;
  try {
    raw = await caller(prompt);
  } catch {
    return null;
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as GeneratedRecipe;
    if (!parsed.selectors || typeof parsed.selectors !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── Validation ────────────────────────────────────────────────────
// Run the generated recipe through the real extractor against the
// same HTML. A recipe is only stored if it actually produces a
// plausible title or body — hallucinated selectors die here.

export interface RecipeValidation {
  valid: boolean;
  titleOk: boolean;
  bodyChars: number;
  confidence: number;
}

export function validateRecipe(html: string, recipe: GeneratedRecipe): RecipeValidation {
  const recipeObj = recipe as unknown as Record<string, unknown>;
  const $ = cheerio.load(html);
  const fields = extractRecipeFields($, recipeObj);

  // Measure ONLY the recipe's own body selector — extractBodyText's
  // generic fallbacks would make a hallucinated selector look valid.
  let bodyChars = 0;
  const bodyCss = recipe.selectors?.body?.css;
  if (bodyCss) {
    try {
      $(bodyCss).each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (text.length >= 30) bodyChars += text.length;
      });
    } catch { /* invalid selector — bodyChars stays 0 */ }
  }

  const titleOk = (fields.title?.value?.length || 0) >= MIN_VALID_TITLE_CHARS;
  const bodyOk = bodyChars >= MIN_VALID_BODY_CHARS;

  let confidence = 0;
  if (titleOk) confidence += 0.4;
  if (bodyOk) confidence += 0.5;
  if (fields.author?.value) confidence += 0.05;
  if (fields.publishDate?.value) confidence += 0.05;

  return { valid: titleOk || bodyOk, titleOk, bodyChars, confidence: Math.round(confidence * 100) / 100 };
}

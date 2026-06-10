// Import service extraction tests
// ----------------------------------
// Offline fixtures modeled on real-world article HTML. Each fixture
// reproduces a failure mode of the old regex-based extractor.
//
// Run with:
//   node --experimental-strip-types tests/import-extract.test.ts

import { strict as assert } from "node:assert";
import {
  extractAllFields,
  extractBodyText,
} from "../src/lib/import/extract.ts";

let passed = 0;
let failed = 0;
const pending: Promise<void>[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  const report = (e?: unknown) => {
    if (e === undefined) {
      passed++;
      console.log(`  ok    ${name}`);
    } else {
      failed++;
      console.error(`  FAIL  ${name}`);
      console.error(`        ${e instanceof Error ? e.message : e}`);
    }
  };
  try {
    const result = fn();
    if (result instanceof Promise) {
      pending.push(result.then(() => report()).catch((e) => report(e)));
    } else {
      report();
    }
  } catch (e) {
    report(e);
  }
}

// ─── Fixture 1: apostrophes + reversed attribute order in meta tags ──
// The old regex `content=["']([^"']+)["']` truncated "Trump's plan…"
// to "Trump" and required name/property to come first.

const APOSTROPHE_HTML = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Trump's plan sparks debate over 'emergency' powers">
<meta content="The president's allies say it's legal. Critics aren't sure." property="og:description">
<meta name="author" content="Jane O'Brien, Sam D'Angelo">
<title>Trump's plan sparks debate | The Daily Record</title>
</head><body><h1>Trump's plan sparks debate</h1></body></html>`;

test("meta extraction survives apostrophes in attribute values", () => {
  const fields = extractAllFields(APOSTROPHE_HTML, null);
  assert.equal(fields.title?.value, "Trump's plan sparks debate over 'emergency' powers");
});

test("meta extraction handles content= before property=", () => {
  const fields = extractAllFields(APOSTROPHE_HTML, null);
  assert.equal(fields.description?.value, "The president's allies say it's legal. Critics aren't sure.");
});

test("author with apostrophes extracts fully", () => {
  const fields = extractAllFields(APOSTROPHE_HTML, null);
  assert.equal(fields.author?.value, "Jane O'Brien, Sam D'Angelo");
});

// ─── Fixture 2: JSON-LD with @graph and @type arrays ────────────────
// Major outlets (NYT, Guardian, WaPo) emit `"@type": ["NewsArticle"]`
// inside an @graph container. The old code compared the array itself
// against a string list, so the layer never matched.

const JSONLD_HTML = `<!DOCTYPE html><html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "name": "The Gazette" },
    {
      "@type": ["NewsArticle", "Article"],
      "headline": "Senate passes \\"landmark\\" climate bill after all-night session",
      "description": "The 51-49 vote followed months of negotiation.",
      "datePublished": "2026-06-01T08:30:00Z",
      "author": [{ "@type": "Person", "name": "Maria Chen" }, { "@type": "Person", "name": "Tom Walsh" }],
      "publisher": { "@type": "Organization", "name": "The Gazette" },
      "image": { "@type": "ImageObject", "url": "https://gazette.example/img/climate.jpg" }
    }
  ]
}
</script>
<meta property="og:title" content="Senate passes landmark climate bill - The Gazette">
</head><body></body></html>`;

test("JSON-LD with @type array inside @graph extracts headline", () => {
  const fields = extractAllFields(JSONLD_HTML, null);
  assert.equal(fields.title?.value, 'Senate passes "landmark" climate bill after all-night session');
  assert.equal(fields.title?.source, "json-ld");
});

test("JSON-LD author array of Person objects joins names", () => {
  const fields = extractAllFields(JSONLD_HTML, null);
  assert.equal(fields.author?.value, "Maria Chen, Tom Walsh");
});

test("JSON-LD publisher and image extract", () => {
  const fields = extractAllFields(JSONLD_HTML, null);
  assert.equal(fields.publication?.value, "The Gazette");
  assert.equal(fields.thumbnail?.value, "https://gazette.example/img/climate.jpg");
});

test("malformed JSON-LD block is skipped without breaking other layers", () => {
  const html = `<html><head>
    <script type="application/ld+json">{ "truncated": "mid-doc`
    + `</script>
    <meta property="og:title" content="Fallback title works here">
    </head><body></body></html>`;
  const fields = extractAllFields(html, null);
  assert.equal(fields.title?.value, "Fallback title works here");
});

// ─── Fixture 3: body text in a container with nested divs ───────────
// The old regex `<div[^>]*class="article-body"...>([\s\S]*?)</div>`
// stopped at the FIRST closing </div> — the inner ad wrapper — and
// returned a fragment.

const para = (i: number) =>
  `<p>Paragraph ${i} of the story continues with enough text to clear the minimum length filter for extraction.</p>`;

const NESTED_BODY_HTML = `<!DOCTYPE html><html><head><title>Story</title></head><body>
<nav><p>Home News Sports Opinion Weather Subscribe Today For Less Than One Dollar Per Week</p></nav>
<div class="article-body">
  ${para(1)}
  <div class="inline-ad"><span>Advertisement</span></div>
  ${para(2)}
  <div class="photo-wrapper"><div class="caption">A photo caption here</div></div>
  ${para(3)}
  ${para(4)}
</div>
<footer><p>Copyright 2026 The Gazette. All rights reserved. Terms of service and privacy policy apply.</p></footer>
</body></html>`;

test("body extraction captures paragraphs past nested closing divs", () => {
  const body = extractBodyText(NESTED_BODY_HTML, null);
  assert.ok(body, "body should be extracted");
  for (const i of [1, 2, 3, 4]) {
    assert.ok(body!.includes(`Paragraph ${i}`), `missing paragraph ${i}`);
  }
});

test("body extraction excludes nav and footer noise", () => {
  const body = extractBodyText(NESTED_BODY_HTML, null);
  assert.ok(!body!.includes("Subscribe Today"), "nav text leaked into body");
  assert.ok(!body!.includes("All rights reserved"), "footer text leaked into body");
});

// ─── Fixture 4: site-registry CSS selectors ──────────────────────────
// Recipes carry per-site selectors that the old route ignored entirely.

const RECIPE = {
  selectors: {
    title: { css: "h1[data-testid='Heading']", attr: null, fallback: "og:title" },
    author: { css: "a[data-testid='AuthorName']", attr: null, multi: true, separator: ", " },
    publishDate: { css: "time[data-testid='Published']", attr: "datetime" },
    body: { css: "[data-testid='paragraph']" },
  },
} as Record<string, unknown>;

const RECIPE_HTML = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Wrong title from stale OG tag">
</head><body>
<h1 data-testid="Heading">Exclusive: Regulators open inquiry into data broker</h1>
<a data-testid="AuthorName">Priya Patel</a>
<a data-testid="AuthorName">Lee Nakamura</a>
<time data-testid="Published" datetime="2026-05-30T12:00:00Z">May 30</time>
<div data-testid="paragraph">The inquiry was opened after a complaint alleging unauthorized resale of location data.</div>
<div data-testid="paragraph">The company denied wrongdoing in a statement released Friday afternoon to investors.</div>
</body></html>`;

test("recipe CSS selectors take priority over meta tags", () => {
  const fields = extractAllFields(RECIPE_HTML, RECIPE);
  assert.equal(fields.title?.value, "Exclusive: Regulators open inquiry into data broker");
  assert.equal(fields.title?.source, "recipe");
});

test("recipe multi-selector joins authors", () => {
  const fields = extractAllFields(RECIPE_HTML, RECIPE);
  assert.equal(fields.author?.value, "Priya Patel, Lee Nakamura");
});

test("recipe attr selector reads datetime attribute", () => {
  const fields = extractAllFields(RECIPE_HTML, RECIPE);
  assert.equal(fields.publishDate?.value, "2026-05-30T12:00:00Z");
});

test("recipe body selector collects paragraph elements", () => {
  const body = extractBodyText(RECIPE_HTML, RECIPE);
  assert.ok(body!.includes("unauthorized resale of location data"));
  assert.ok(body!.includes("denied wrongdoing"));
});

test("invalid recipe selector falls back gracefully", () => {
  const badRecipe = { selectors: { title: { css: "h1[[[" } } } as Record<string, unknown>;
  const fields = extractAllFields(APOSTROPHE_HTML, badRecipe);
  assert.equal(fields.title?.value, "Trump's plan sparks debate over 'emergency' powers");
});

// ─── Fixture 5: HTML entities and fallbacks ─────────────────────────

test("named HTML entities decode in meta content", () => {
  const html = `<html><head>
    <meta property="og:title" content="It&rsquo;s official &mdash; the merger is dead&hellip;">
    </head><body></body></html>`;
  const fields = extractAllFields(html, null);
  assert.equal(fields.title?.value, "It’s official — the merger is dead…");
});

test("falls back to <title> then <h1> when no meta tags exist", () => {
  const html = `<html><head><title>Council votes to expand transit service | Metro News</title></head>
    <body><h1>Council votes to expand transit service</h1></body></html>`;
  const fields = extractAllFields(html, null);
  assert.equal(fields.title?.value, "Council votes to expand transit service");
});

test("canonical URL extracted from link tag", () => {
  const html = `<html><head>
    <link rel="canonical" href="https://example.com/story/canonical-path">
    <meta property="og:title" content="A story title goes here">
    </head><body></body></html>`;
  const fields = extractAllFields(html, null);
  assert.equal(fields._canonical?.value, "https://example.com/story/canonical-path");
});

// ─── Fixture 6: paragraph fallback when no known container exists ───

test("falls back to page-wide paragraphs when no container matches", () => {
  const html = `<html><body>
    <div class="weird-custom-wrapper">
      ${para(1)} ${para(2)} ${para(3)}
    </div>
  </body></html>`;
  const body = extractBodyText(html, null);
  assert.ok(body!.includes("Paragraph 1"));
  assert.ok(body!.includes("Paragraph 3"));
});

// ─── Fixture 7: live-updates pages (CNN-style) ──────────────────────
// Live blogs repeat byline elements in every update post and in
// "related story" teasers. A multi:true recipe selector must scope to
// the page-level byline block, not vacuum the whole page. Body text
// lives across many <article> posts (or in JSON-LD liveBlogUpdate).

import { normalizeAuthors } from "../src/lib/import/extract.ts";

const CNN_RECIPE = {
  selectors: {
    title: { css: "h1.headline__text", attr: null, fallback: "og:title" },
    author: { css: ".byline__name", attr: null, multi: true, separator: ", " },
    body: { css: ".article__content p, .zn-body__paragraph" },
  },
} as Record<string, unknown>;

const livePost = (i: number, author: string) => `
<article class="live-story-post">
  <header><h2>Update ${i}: strikes reported near the border</h2>
  <div class="byline"><span class="byline__name">${author}</span></div></header>
  <div class="live-story-post__content">
    <p>Update ${i} body paragraph one with enough words to pass the extraction length filter comfortably.</p>
    <p>Update ${i} body paragraph two describing further developments reported by correspondents on the ground.</p>
  </div>
</article>`;

const LIVE_PAGE_HTML = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Live updates: US military launches strikes | CNN">
</head><body>
<h1 class="headline__text">Live updates: US military launches strikes</h1>
<div class="headline__byline">
  <div class="byline__names">
    <span class="byline__name">Davis Winkie</span>
    <span class="byline__name">Alayna Treene</span>
    <span class="byline__name">Kit Maher</span>
  </div>
</div>
${livePost(1, "Jeremy Diamond")}
${livePost(2, "Zachary Cohen")}
${livePost(3, "Haley Britzky")}
<div class="related-content">
  <article class="card"><h3>Analysis: what comes next</h3>
  <span class="byline__name">Aaron Blake</span></article>
  <article class="card"><h3>Markets react to the news</h3>
  <span class="byline__name">Matt Egan</span></article>
</div>
</body></html>`;

test("live page: multi-selector scopes to page-level byline block", () => {
  const fields = extractAllFields(LIVE_PAGE_HTML, CNN_RECIPE);
  assert.equal(fields.author?.value, "Davis Winkie, Alayna Treene, Kit Maher");
});

test("live page: body concatenates update posts, skips teaser stubs", () => {
  const body = extractBodyText(LIVE_PAGE_HTML, CNN_RECIPE);
  assert.ok(body, "body should be extracted");
  for (const i of [1, 2, 3]) {
    assert.ok(body!.includes(`Update ${i} body paragraph one`), `missing update ${i}`);
  }
  assert.ok(!body!.includes("Markets react"), "related-story teaser leaked into body");
});

test("JSON-LD liveBlogUpdate assembles body without collecting update authors", () => {
  const html = `<html><head><script type="application/ld+json">
  {
    "@type": "LiveBlogPosting",
    "headline": "Live updates: severe weather across the plains",
    "author": { "@type": "Organization", "name": "The Gazette" },
    "liveBlogUpdate": [
      { "@type": "BlogPosting", "headline": "Tornado warning issued", "articleBody": "The national weather service issued a warning for three counties.", "author": { "name": "Contributor One" } },
      { "@type": "BlogPosting", "headline": "Power outages spread", "articleBody": "Utilities reported forty thousand customers without electricity.", "author": { "name": "Contributor Two" } }
    ]
  }
  </script></head><body></body></html>`;
  const fields = extractAllFields(html, null);
  assert.equal(fields.title?.value, "Live updates: severe weather across the plains");
  assert.ok(fields.body?.value.includes("Tornado warning issued"));
  assert.ok(fields.body?.value.includes("forty thousand customers"));
  assert.equal(fields.author?.value, "The Gazette");
});

// ─── Fixture 8: author normalization ────────────────────────────────

test("normalizeAuthors strips 'By', publication suffix, and 'and'", () => {
  assert.equal(
    normalizeAuthors("By Kevin Liptak, Alayna Treene and Kit Maher, CNN", "CNN"),
    "Kevin Liptak, Alayna Treene, Kit Maher"
  );
});

test("normalizeAuthors caps runaway contributor lists", () => {
  const twentyFour = Array.from({ length: 24 }, (_, i) => `Reporter ${i + 1}`).join(", ");
  const result = normalizeAuthors(twentyFour);
  assert.equal(result.split(", ").length, 6);
});

test("normalizeAuthors dedupes repeated names", () => {
  assert.equal(normalizeAuthors("Jane Doe, jane doe, Jane Doe"), "Jane Doe");
});

// ─── Fixture 9: self-healing LLM recipe pipeline ────────────────────
// The model only ever sees a structural digest and returns selectors;
// content is always extracted deterministically by cheerio.

import { findAmpUrl } from "../src/lib/import/extract.ts";
import { buildDomDigest, generateRecipe, validateRecipe } from "../src/lib/import/llm-recipe.ts";

const STRANGE_SITE_HTML = `<!DOCTYPE html><html><head>
<title>City approves stadium deal | The Bugle</title>
</head><body>
<div class="bgl-masthead"><h2>The Bugle</h2></div>
<h1 class="bgl-hed">City approves controversial stadium deal in 5-4 vote</h1>
<div class="bgl-credit"><span class="bgl-credit-name">Rosa Martinez</span></div>
<time datetime="2026-06-09T18:00:00Z">June 9</time>
<div class="bgl-story-text">
  <p>The city council approved the stadium financing package after a marathon session that stretched past midnight on Tuesday.</p>
  <p>Opponents argued the public contribution had grown far beyond the figure presented to voters during last year's referendum campaign.</p>
  <p>The mayor defended the deal, saying the projected tax revenue from surrounding development would cover the city's bond obligations.</p>
  <p>Construction is expected to begin in the fall, with the first season in the new venue planned for two years later.</p>
</div>
<div class="bgl-related"><p>Related: Voters approved the referendum by a narrow margin last November after a contentious campaign season.</p></div>
</body></html>`;

test("DOM digest surfaces headline, byline, and container selectors", () => {
  const digest = buildDomDigest(STRANGE_SITE_HTML);
  assert.ok(digest.includes("h1.bgl-hed"), "missing headline selector");
  assert.ok(digest.includes("div.bgl-story-text"), "missing body container selector");
  assert.ok(digest.includes("4 paragraphs"), "missing paragraph count");
  assert.ok(!digest.includes("marathon session that stretched past midnight on Tuesday.</p>"), "raw HTML leaked into digest");
});

test("generateRecipe + validateRecipe: model selectors extract deterministically", async () => {
  // Fake model: answers with selectors as Haiku would, based on the digest
  const fakeModel = async (prompt: string) => {
    assert.ok(prompt.includes("h1.bgl-hed"), "digest not in prompt");
    return `{"selectors": {
      "title": {"css": "h1.bgl-hed"},
      "author": {"css": ".bgl-credit-name", "multi": true},
      "publishDate": {"css": "time", "attr": "datetime"},
      "body": {"css": ".bgl-story-text p"}
    }}`;
  };
  const recipe = await generateRecipe("https://bugle.example/stadium", STRANGE_SITE_HTML, fakeModel);
  assert.ok(recipe, "recipe should parse");
  const validation = validateRecipe(STRANGE_SITE_HTML, recipe!);
  assert.ok(validation.valid, "recipe should validate");
  assert.ok(validation.titleOk);
  assert.ok(validation.bodyChars > 400, `body too short: ${validation.bodyChars}`);

  // And the recipe drives the standard extractor end to end
  const fields = extractAllFields(STRANGE_SITE_HTML, recipe as unknown as Record<string, unknown>);
  assert.equal(fields.title?.value, "City approves controversial stadium deal in 5-4 vote");
  assert.equal(fields.author?.value, "Rosa Martinez");
  assert.equal(fields.publishDate?.value, "2026-06-09T18:00:00Z");
  const body = extractBodyText(STRANGE_SITE_HTML, recipe as unknown as Record<string, unknown>);
  assert.ok(body!.startsWith("The city council approved"), "body must be verbatim page text");
  assert.ok(!body!.includes("Related:"), "related teaser leaked into recipe body");
});

test("validateRecipe rejects hallucinated selectors", () => {
  const bad = { selectors: { title: { css: ".does-not-exist" }, body: { css: ".also-fake p" } } };
  const validation = validateRecipe(STRANGE_SITE_HTML, bad);
  assert.equal(validation.valid, false);
  assert.equal(validation.confidence, 0);
});

test("generateRecipe survives a rambling model response", async () => {
  const chatty = async () => `Sure! Based on the digest, here is the recipe:\n{"selectors": {"title": {"css": "h1.bgl-hed"}}}\nLet me know if you need anything else.`;
  const recipe = await generateRecipe("https://x.example", STRANGE_SITE_HTML, chatty);
  assert.equal(recipe?.selectors?.title?.css, "h1.bgl-hed");
});

test("generateRecipe returns null on model failure", async () => {
  const broken = async () => { throw new Error("rate limited"); };
  assert.equal(await generateRecipe("https://x.example", STRANGE_SITE_HTML, broken), null);
});

test("findAmpUrl resolves relative amphtml links", () => {
  const html = `<html><head><link rel="amphtml" href="/2026/06/09/story.amp.html"></head><body></body></html>`;
  assert.equal(
    findAmpUrl(html, "https://news.example/2026/06/09/story.html"),
    "https://news.example/2026/06/09/story.amp.html"
  );
  assert.equal(findAmpUrl("<html><head></head></html>", "https://news.example/a"), null);
});

await Promise.all(pending);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

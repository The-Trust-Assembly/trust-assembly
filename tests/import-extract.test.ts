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

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${e instanceof Error ? e.message : e}`);
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

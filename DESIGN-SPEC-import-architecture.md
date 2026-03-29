# Trust Assembly — Import Service Architecture

## Overview

The Import Service is the server-side system that powers the "Import" button on the submit form. When a user pastes a URL and clicks Import (or leaves the URL field), the client calls `POST /api/import` with the URL. The server fetches the page, extracts structured content, and returns field values with per-field confidence scores.

**This is the most critical piece of infrastructure for submission UX.** If import works well, citizens see their article spring to life in the form. If it fails, they face a wall of empty fields and many will bounce.

## Architecture: Five-Layer Extraction Waterfall

Each URL runs through five extraction layers in priority order. Earlier layers win — later layers only fill gaps where earlier layers returned nothing.

### Layer 1: Site Registry (Curated CSS Selectors)

A JSON config file (`site-registry.json`) contains hand-tuned extraction rules for the top 100+ domains. Each recipe defines:

- `domains` — list of hostnames this recipe matches
- `platform` — which Trust Assembly platform type (article, youtube, twitter, etc.)
- `template` — which form template to use (article, shortform, video, audio, product)
- `selectors` — CSS selectors per field (title, author, subtitle, publishDate, body)
- `urlNormalization` — which tracking params to strip, domain normalization rules
- `extractionStrategy` — special strategies like "reddit_json" or "oembed"

**Confidence: 0.9** — These selectors are curated and tested. Highest confidence except for structured APIs.

**Maintenance:** Site selectors break when publishers redesign. Each recipe should include a `lastVerified` date. Build a weekly automated test that fetches 1 real URL per recipe and verifies the title selector still works. Alert when selectors fail.

### Layer 2: Platform APIs and oEmbed

For platforms with structured APIs:

- **Reddit**: Append `.json` to any Reddit URL. Returns title, author (u/handle), selftext (body), post type, subreddit, score. **Free, no API key, no rate limit concerns at Trust Assembly's scale.** Confidence: 1.0.

- **oEmbed**: Standardized protocol supported by YouTube, TikTok, Instagram, Vimeo, Dailymotion, SoundCloud, Spotify, WordPress, Medium, and many others. Returns title, author_name, author_url, provider_name, thumbnail. Call the provider's oEmbed endpoint with the URL. Confidence: 0.85.

- **YouTube Data API v3** (future — requires API key): Returns title, channel, description, duration, thumbnail, tags, publish date. Free tier: 10,000 units/day. Confidence: 1.0.

- **Spotify Web API** (future — requires OAuth client credentials): Returns episode title, show name, description, duration_ms, release_date, show hosts. Confidence: 1.0.

### Layer 3: Meta Tag Extraction

Almost every page on the internet has meta tags. Parse in this priority order:

1. **Open Graph** (`og:title`, `og:description`, `og:image`, `og:site_name`, `og:type`, `article:author`, `article:published_time`)
2. **Twitter Cards** (`twitter:title`, `twitter:description`, `twitter:creator`, `twitter:site`)
3. **Standard HTML** (`<meta name="author">`, `<meta name="description">`, `<title>`)

**Confidence: 0.7** — Meta tags are nearly universal but sometimes stale, truncated, or SEO-optimized rather than accurate.

### Layer 4: JSON-LD / Schema.org

Many sites embed structured data for SEO. Parse `<script type="application/ld+json">` blocks. Look for:

- `NewsArticle`, `Article`, `BlogPosting` → headline, author, datePublished, publisher
- `Product` → name, brand, offers, aggregateRating, description
- `VideoObject` → name, duration, author
- `PodcastEpisode`, `AudioObject` → name, duration, partOfSeries

**Confidence: 0.85-0.95** — When present, JSON-LD is very reliable. Product schema on e-commerce sites is especially strong.

### Layer 5: Readability.js (Body Extraction)

Mozilla's Readability library (the engine behind Firefox Reader View) extracts the main content from any page. Use it for:

- Article body text (for the inline edit preview)
- Fallback title and byline extraction
- Cleaning up the page to just the readable content

**Confidence: 0.5-0.6** — Works surprisingly well across most sites, but can include sidebar content or miss content behind lazy-loading.

**Dependency:** `@mozilla/readability` + `jsdom`

## Response Format

```json
{
  "success": true,
  "platform": "article",
  "template": "article",
  "confidence": 0.87,
  "fields": {
    "title": {
      "value": "Americans Spend More on Insurance Than Federal Income Tax",
      "source": "selector",
      "confidence": 0.9
    },
    "author": {
      "value": "Ryan Morik, Paulina Dedaj",
      "source": "json-ld",
      "confidence": 0.9
    },
    "subtitle": {
      "value": "New report finds insurance costs exceed...",
      "source": "meta",
      "confidence": 0.7
    },
    "publishDate": {
      "value": "2025-03-15T14:30:00Z",
      "source": "selector",
      "confidence": 0.9
    },
    "body": {
      "value": "The full article text extracted by Readability...",
      "source": "readability",
      "confidence": 0.6
    }
  },
  "canonical": "https://reuters.com/economy/us-insurance-spending-2025",
  "submitted": "https://reuters.com/economy/us-insurance-spending-2025?utm_source=twitter",
  "normalized": "https://reuters.com/economy/us-insurance-spending-2025",
  "recipeUsed": "reuters",
  "extractionTime": "1243ms"
}
```

## Client-Side Integration

### How the submit form consumes import results

1. User pastes URL → client-side platform detection runs immediately (hostname matching, ~0ms)
2. Form morphs to detected template (shows correct fields/labels)
3. User clicks Import (or auto-trigger on blur) → `POST /api/import` fires
4. While waiting: show skeleton loading states in the form fields
5. Response arrives → populate fields:
   - Fields with confidence >= 0.8: auto-fill and show as confirmed (subtle green check or locked appearance)
   - Fields with confidence 0.5-0.79: auto-fill but show "verify" indicator (subtle gold outline)
   - Fields with confidence < 0.5: leave empty, don't auto-fill
6. If import fails entirely: leave fields empty, no error message needed — the user just fills them in manually

### Timeout behavior

- Set a 5-second total timeout on the import call
- If the server hasn't responded in 5 seconds, abandon the request silently
- The user can always type manually — import is a convenience, not a gate

## URL Normalization

This is critical for cache hits and for matching corrections to the same content.

### Always strip (global):
`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `fbclid`, `gclid`, `gclsrc`, `dclid`, `msclkid`, `mc_cid`, `mc_eid`, `ref`, `_ga`, `source`, `via`

### Per-recipe strip examples:
- NYT: `smid`, `smtyp`, `algo`, `module`, `action`
- Fox: `intcmp`
- WSJ: `mod`
- Forbes: `sh`
- Amazon: `ref`, `ref_`, `pf_rd_*`, `tag`, `linkCode`, `th`, `psc`
- eBay: `hash`, `var`, `mkevt`, `mkcid`

### Canonical URL resolution:
1. Follow all HTTP redirects (up to 5)
2. Check `<link rel="canonical" href="...">` in HTML
3. Check `og:url` meta tag
4. Store both the submitted URL and the canonical URL
5. Use canonical for cache keys and correction matching

### Domain normalization:
- `twitter.com` → `x.com`
- `m.youtube.com` → `youtube.com`
- `old.reddit.com` → `www.reddit.com`
- `mobile.x.com` → `x.com`

## Caching Strategy

- Cache import results keyed by **canonical URL**
- TTL: 24 hours (articles don't change that often; if they do, the import was just a starting point)
- Also cache by submitted URL (so the same shared link doesn't re-fetch)
- Implementation: start with in-memory Map, migrate to Redis when needed

## Error Handling

The import service should never block the user. Every failure mode degrades gracefully:

| Failure | Behavior |
|---------|----------|
| URL fetch times out | Return empty result, form stays manual |
| URL returns 403/404 | Return { success: false, error: "page_not_accessible" } |
| URL is paywalled | Meta tags usually still work — return what we got |
| Selectors return nothing | Fall through to meta/JSON-LD layers |
| All layers return nothing | Return { success: false } — user fills in manually |
| Invalid URL format | Client-side validation catches this before API call |

## Implementation Files

- `site-registry.json` — The curated selector configs for top 100+ domains
- `import-service.js` — The Node.js service with all 5 extraction layers
- Express route: `POST /api/import` with caching

## Dependencies

```
npm install cheerio @mozilla/readability jsdom node-fetch
```

## Future Enhancements (Post-Launch)

1. **YouTube Data API v3 integration** — when funding allows
2. **Spotify Web API integration** — for podcast episode metadata  
3. **Automated recipe testing** — weekly cron that verifies selectors still work
4. **Puppeteer fallback** — for client-rendered pages (Twitter, LinkedIn) that don't server-render content
5. **User-submitted recipe corrections** — if a citizen reports that import failed for a site, flag it for recipe maintenance
6. **ASIN/product ID extraction** — normalize Amazon URLs to ASIN for deduplication

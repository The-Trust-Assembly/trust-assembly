/**
 * Trust Assembly — Import Service
 * 
 * Server-side endpoint that fetches a URL and extracts structured content
 * for the submission form. Uses a waterfall of extraction strategies:
 * 
 *   1. Site Registry (curated CSS selectors for top 100 domains)
 *   2. Platform-specific APIs (Reddit JSON, oEmbed endpoints)  
 *   3. Meta tags (Open Graph, Twitter Cards, standard meta)
 *   4. JSON-LD / Schema.org structured data
 *   5. Readability.js (body content extraction)
 * 
 * Dependencies to install:
 *   npm install cheerio @mozilla/readability jsdom node-fetch
 * 
 * Usage:
 *   POST /api/import
 *   Body: { "url": "https://reuters.com/article/..." }
 *   Returns: { platform, template, confidence, fields, canonical }
 */

const cheerio = require('cheerio');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const fetch = require('node-fetch');
const { URL } = require('url');

// Load registry
const registry = require('./site-registry.json');

// ─── URL Normalization ─────────────────────────────────────────────

/**
 * Normalize a URL: resolve redirects, strip tracking params, find canonical.
 * This is critical — the same article shared from Twitter, Facebook, and 
 * Google News will have different URLs with different tracking params.
 */
function normalizeUrl(rawUrl, recipe) {
  const url = new URL(rawUrl);

  // Always strip common tracking params
  const globalStripParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid',
    'mc_cid', 'mc_eid', 'ref', '_ga', 'source', 'via',
  ];

  globalStripParams.forEach(p => url.searchParams.delete(p));

  // Apply recipe-specific param stripping
  if (recipe?.urlNormalization?.stripParams) {
    recipe.urlNormalization.stripParams.forEach(pattern => {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        const keysToDelete = [];
        url.searchParams.forEach((_, key) => {
          if (key.startsWith(prefix)) keysToDelete.push(key);
        });
        keysToDelete.forEach(k => url.searchParams.delete(k));
      } else {
        url.searchParams.delete(pattern);
      }
    });
  }

  // Normalize domain if specified (e.g., twitter.com → x.com)
  if (recipe?.urlNormalization?.normalizeDomain) {
    url.hostname = recipe.urlNormalization.normalizeDomain;
  }

  return url.toString();
}

/**
 * Extract the hostname from a URL and find the matching registry recipe.
 * Handles subdomains (e.g., astralcodexten.substack.com → substack recipe).
 */
function findRecipe(url) {
  const hostname = new URL(url).hostname.replace(/^www\./, '');

  for (const [key, recipe] of Object.entries(registry.recipes)) {
    if (key.startsWith('_')) continue; // skip _template and _meta

    // Direct domain match
    if (recipe.domains?.includes(hostname) || recipe.domains?.includes(`www.${hostname}`)) {
      return { key, recipe };
    }

    // Subdomain pattern match (e.g., *.substack.com)
    if (recipe.domainPattern) {
      const pattern = recipe.domainPattern.replace('*.', '');
      if (hostname.endsWith(pattern) && hostname !== pattern) {
        return { key, recipe };
      }
    }
  }

  return null;
}

// ─── Extraction Layers ─────────────────────────────────────────────

/**
 * Layer 1: Extract using site-specific CSS selectors from registry
 */
function extractWithSelectors($, selectors) {
  const fields = {};

  for (const [fieldName, config] of Object.entries(selectors)) {
    if (fieldName.startsWith('_')) continue;

    let value = null;
    let source = 'selector';

    // Try CSS selector first
    if (config.css) {
      const el = $(config.css).first();
      if (el.length) {
        value = config.attr ? el.attr(config.attr) : el.text().trim();
      }

      // Multi-value extraction (e.g., multiple authors, bullet points)
      if (config.multi && $(config.css).length > 1) {
        const values = [];
        $(config.css).each((_, el) => {
          const text = $(el).text().trim();
          if (text) values.push(text);
        });
        if (values.length > 0) {
          value = config.separator ? values.join(config.separator + ' ') : values;
        }
      }
    }

    // Fallback to meta tags
    if (!value && config.fallback) {
      value = extractMetaValue($, config.fallback);
      source = 'meta';
    }

    if (value) {
      fields[fieldName] = {
        value: typeof value === 'string' ? value.trim() : value,
        source,
        confidence: source === 'selector' ? 0.9 : 0.7,
      };
    }
  }

  return fields;
}

/**
 * Layer 2: oEmbed extraction
 */
async function extractWithOembed(url, recipe) {
  if (recipe?.extractionStrategy !== 'oembed' || !recipe.oembedEndpoint) {
    // Try auto-discovery
    return null;
  }

  try {
    const oembedUrl = recipe.oembedEndpoint + encodeURIComponent(url);
    const response = await fetch(oembedUrl, { timeout: 3000 });
    if (!response.ok) return null;

    const data = await response.json();
    const fields = {};

    if (data.title) fields.title = { value: data.title, source: 'oembed', confidence: 0.85 };
    if (data.author_name) fields.author = { value: data.author_name, source: 'oembed', confidence: 0.85 };
    if (data.provider_name) fields.publication = { value: data.provider_name, source: 'oembed', confidence: 0.85 };
    if (data.thumbnail_url) fields.thumbnail = { value: data.thumbnail_url, source: 'oembed', confidence: 0.9 };

    return fields;
  } catch (e) {
    console.warn(`oEmbed failed for ${url}:`, e.message);
    return null;
  }
}

/**
 * Layer 2b: Reddit JSON extraction (append .json to URL)
 */
async function extractWithRedditJson(url) {
  try {
    // Ensure URL ends with .json
    const jsonUrl = url.replace(/\/?(\?.*)?$/, '.json$1');
    const response = await fetch(jsonUrl, {
      timeout: 3000,
      headers: { 'User-Agent': 'TrustAssembly/1.0' },
    });
    if (!response.ok) return null;

    const data = await response.json();
    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post) return null;

    const fields = {};
    if (post.title) fields.title = { value: post.title, source: 'reddit-json', confidence: 1.0 };
    if (post.author) fields.author = { value: `u/${post.author}`, source: 'reddit-json', confidence: 1.0 };
    if (post.selftext) fields.body = { value: post.selftext, source: 'reddit-json', confidence: 1.0 };
    if (post.subreddit) fields.subreddit = { value: post.subreddit, source: 'reddit-json', confidence: 1.0 };

    // Determine post type
    const postType = post.is_self ? 'text' : (post.is_video ? 'video' : 'link');
    fields.postType = { value: postType, source: 'reddit-json', confidence: 1.0 };

    if (post.url && !post.is_self) {
      fields.linkedUrl = { value: post.url, source: 'reddit-json', confidence: 1.0 };
    }

    return fields;
  } catch (e) {
    console.warn(`Reddit JSON failed for ${url}:`, e.message);
    return null;
  }
}

/**
 * Layer 3: Meta tag extraction (OG, Twitter Cards, standard meta)
 */
function extractMetaTags($) {
  const fields = {};

  // Priority: OG > Twitter > standard
  const mappings = [
    { field: 'title', tags: ['og:title', 'twitter:title', 'title'] },
    { field: 'description', tags: ['og:description', 'twitter:description', 'description'] },
    { field: 'author', tags: ['article:author', 'twitter:creator', 'author'] },
    { field: 'publishDate', tags: ['article:published_time', 'date', 'pubdate'] },
    { field: 'siteName', tags: ['og:site_name', 'twitter:site', 'application-name'] },
    { field: 'thumbnail', tags: ['og:image', 'twitter:image', 'thumbnail'] },
    { field: 'type', tags: ['og:type'] },
  ];

  for (const { field, tags } of mappings) {
    for (const tag of tags) {
      const value = extractMetaValue($, tag);
      if (value) {
        fields[field] = { value, source: 'meta', confidence: 0.7 };
        break;
      }
    }
  }

  return fields;
}

/**
 * Helper: get a meta tag value by property or name
 */
function extractMetaValue($, key) {
  // Try og: / article: style (property attribute)
  let el = $(`meta[property="${key}"]`);
  if (el.length) return el.attr('content');

  // Try name attribute
  el = $(`meta[name="${key}"]`);
  if (el.length) return el.attr('content');

  // Try <title> tag
  if (key === 'title') {
    return $('title').text().trim() || null;
  }

  return null;
}

/**
 * Layer 4: JSON-LD / Schema.org extraction
 */
function extractJsonLd($) {
  const fields = {};

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      let data = JSON.parse($(el).html());

      // Handle @graph arrays
      if (data['@graph']) {
        data = data['@graph'];
      }
      if (!Array.isArray(data)) data = [data];

      for (const item of data) {
        const type = item['@type'];

        // Article types
        if (['NewsArticle', 'Article', 'BlogPosting', 'WebPage', 'ReportageNewsArticle'].includes(type)) {
          if (item.headline && !fields.title) {
            fields.title = { value: item.headline, source: 'json-ld', confidence: 0.85 };
          }
          if (item.description && !fields.description) {
            fields.description = { value: item.description, source: 'json-ld', confidence: 0.85 };
          }
          if (item.author) {
            const authors = Array.isArray(item.author) ? item.author : [item.author];
            const names = authors.map(a => a.name || a).filter(Boolean);
            if (names.length > 0 && !fields.author) {
              fields.author = { value: names.join(', '), source: 'json-ld', confidence: 0.9 };
            }
          }
          if (item.datePublished && !fields.publishDate) {
            fields.publishDate = { value: item.datePublished, source: 'json-ld', confidence: 0.9 };
          }
          if (item.publisher?.name && !fields.publication) {
            fields.publication = { value: item.publisher.name, source: 'json-ld', confidence: 0.9 };
          }
        }

        // Product types
        if (type === 'Product') {
          if (item.name && !fields.title) {
            fields.title = { value: item.name, source: 'json-ld', confidence: 0.95 };
          }
          if (item.brand?.name && !fields.brand) {
            fields.brand = { value: item.brand.name, source: 'json-ld', confidence: 0.95 };
          }
          if (item.description && !fields.description) {
            fields.description = { value: item.description, source: 'json-ld', confidence: 0.85 };
          }
          if (item.aggregateRating && !fields.rating) {
            fields.rating = {
              value: `${item.aggregateRating.ratingValue}/${item.aggregateRating.bestRating || 5} (${item.aggregateRating.reviewCount || '?'} reviews)`,
              source: 'json-ld',
              confidence: 0.95,
            };
          }
          if (item.offers) {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            if (offer.price && !fields.price) {
              fields.price = {
                value: `${offer.priceCurrency || '$'}${offer.price}`,
                source: 'json-ld',
                confidence: 0.9,
              };
            }
          }
        }

        // VideoObject
        if (type === 'VideoObject') {
          if (item.name && !fields.title) {
            fields.title = { value: item.name, source: 'json-ld', confidence: 0.9 };
          }
          if (item.duration && !fields.duration) {
            fields.duration = { value: item.duration, source: 'json-ld', confidence: 0.9 };
          }
          if (item.author?.name && !fields.author) {
            fields.author = { value: item.author.name, source: 'json-ld', confidence: 0.9 };
          }
        }

        // PodcastEpisode / AudioObject
        if (['PodcastEpisode', 'AudioObject', 'RadioEpisode'].includes(type)) {
          if (item.name && !fields.title) {
            fields.title = { value: item.name, source: 'json-ld', confidence: 0.9 };
          }
          if (item.duration && !fields.duration) {
            fields.duration = { value: item.duration, source: 'json-ld', confidence: 0.9 };
          }
          if (item.partOfSeries?.name && !fields.showName) {
            fields.showName = { value: item.partOfSeries.name, source: 'json-ld', confidence: 0.9 };
          }
        }
      }
    } catch (e) {
      // Invalid JSON-LD, skip
    }
  });

  return fields;
}

/**
 * Layer 5: Readability body extraction
 */
function extractWithReadability(html, url) {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article) {
      return {
        body: { value: article.textContent?.substring(0, 5000), source: 'readability', confidence: 0.6 },
        ...(article.title && !article.title.includes('|') ? {
          title: { value: article.title, source: 'readability', confidence: 0.5 },
        } : {}),
        ...(article.byline ? {
          author: { value: article.byline, source: 'readability', confidence: 0.5 },
        } : {}),
      };
    }
  } catch (e) {
    console.warn('Readability failed:', e.message);
  }
  return {};
}

/**
 * Find the canonical URL from link tags or OG tags
 */
function findCanonicalUrl($, originalUrl) {
  // <link rel="canonical">
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical) return canonical;

  // og:url
  const ogUrl = $('meta[property="og:url"]').attr('content');
  if (ogUrl) return ogUrl;

  return originalUrl;
}

// ─── Main Import Function ──────────────────────────────────────────

/**
 * Main entry point: fetch a URL and extract structured content.
 * Returns a standardized result object with per-field confidence scores.
 */
async function importUrl(rawUrl) {
  const startTime = Date.now();

  // Step 1: Find recipe
  const recipeMatch = findRecipe(rawUrl);
  const recipe = recipeMatch?.recipe || null;

  // Step 2: Normalize URL
  const normalizedUrl = normalizeUrl(rawUrl, recipe);

  // Step 3: Determine platform and template
  // (Recipe overrides generic detection)
  let platform = recipe?.platform || 'article';
  let template = recipe?.template || 'article';

  // Step 4: Check for special extraction strategies
  let specialFields = null;

  if (recipe?.extractionStrategy === 'reddit_json') {
    specialFields = await extractWithRedditJson(normalizedUrl);
  } else if (recipe?.extractionStrategy === 'oembed') {
    specialFields = await extractWithOembed(normalizedUrl, recipe);
  }

  // Step 5: Fetch the page HTML
  let html = null;
  let $ = null;

  try {
    const response = await fetch(normalizedUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TrustAssembly/1.0; +https://trustassembly.org)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      follow: 5, // follow up to 5 redirects
    });

    if (response.ok) {
      html = await response.text();
      $ = cheerio.load(html);
    }
  } catch (e) {
    console.warn(`Fetch failed for ${normalizedUrl}:`, e.message);
  }

  // Step 6: Run extraction layers and merge results
  // Earlier layers win — later layers only fill in gaps
  let fields = {};

  // Layer 1: Site-specific selectors
  if ($ && recipe?.selectors) {
    const selectorFields = extractWithSelectors($, recipe.selectors);
    fields = { ...fields, ...selectorFields };
  }

  // Layer 2: Special strategies (Reddit JSON, oEmbed) — already fetched
  if (specialFields) {
    // Only fill gaps — don't overwrite selector results
    for (const [key, val] of Object.entries(specialFields)) {
      if (!fields[key]) fields[key] = val;
    }
  }

  // Layer 3: Meta tags
  if ($) {
    const metaFields = extractMetaTags($);
    for (const [key, val] of Object.entries(metaFields)) {
      if (!fields[key]) fields[key] = val;
    }
  }

  // Layer 4: JSON-LD
  if ($) {
    const jsonLdFields = extractJsonLd($);
    for (const [key, val] of Object.entries(jsonLdFields)) {
      if (!fields[key]) fields[key] = val;
    }
  }

  // Layer 5: Readability (body extraction)
  if (html) {
    const readabilityFields = extractWithReadability(html, normalizedUrl);
    for (const [key, val] of Object.entries(readabilityFields)) {
      if (!fields[key]) fields[key] = val;
    }
  }

  // Step 7: Find canonical URL
  const canonical = $ ? findCanonicalUrl($, normalizedUrl) : normalizedUrl;

  // Step 8: Check for URL-based platform overrides (e.g., Substack notes vs articles)
  if (recipe?.urlOverrides?.pathContains) {
    const path = new URL(normalizedUrl).pathname;
    for (const [pathFragment, overridePlatform] of Object.entries(recipe.urlOverrides.pathContains)) {
      if (path.includes(pathFragment)) {
        platform = overridePlatform;
        break;
      }
    }
  }

  // Step 9: Compute overall confidence
  const fieldValues = Object.values(fields);
  const avgConfidence = fieldValues.length > 0
    ? fieldValues.reduce((sum, f) => sum + f.confidence, 0) / fieldValues.length
    : 0;

  const elapsed = Date.now() - startTime;

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
    extractionTime: `${elapsed}ms`,
  };
}

// ─── Express Endpoint ──────────────────────────────────────────────

/**
 * Example Express route. Add this to your existing Express app:
 * 
 *   const { createImportRouter } = require('./import-service');
 *   app.use('/api', createImportRouter());
 */
function createImportRouter() {
  const express = require('express');
  const router = express.Router();

  // Simple in-memory cache (replace with Redis for production)
  const cache = new Map();
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  router.post('/import', async (req, res) => {
    try {
      const { url } = req.body;

      if (!url || !url.startsWith('http')) {
        return res.status(400).json({ error: 'Valid URL required' });
      }

      // Check cache
      const cached = cache.get(url);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json({ ...cached.data, fromCache: true });
      }

      // Run import
      const result = await importUrl(url);

      // Cache successful results
      if (result.success) {
        cache.set(url, { data: result, timestamp: Date.now() });

        // Also cache by canonical URL if different
        if (result.canonical && result.canonical !== url) {
          cache.set(result.canonical, { data: result, timestamp: Date.now() });
        }
      }

      return res.json(result);
    } catch (e) {
      console.error('Import error:', e);
      return res.status(500).json({
        error: 'Import failed',
        message: e.message,
      });
    }
  });

  return router;
}

// ─── Exports ───────────────────────────────────────────────────────

module.exports = {
  importUrl,
  findRecipe,
  normalizeUrl,
  createImportRouter,
};

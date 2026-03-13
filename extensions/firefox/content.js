/**
 * Trust Assembly Extension — Content Script
 * Injected into every webpage. Checks for corrections, affirmations,
 * and translations, then renders them inline.
 */

(function () {
  "use strict";
  if (window.__trustAssemblyLoaded) return;
  window.__trustAssemblyLoaded = true;

  const BADGE_ID = "ta-ext-badge";
  const PANEL_ID = "ta-ext-panel";
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const COLORS = {
    navy: "#1B2A4A", linen: "#F0EDE6", vellum: "#FDFBF5",
    gold: "#B8963E", green: "#1B5E3F", red: "#C4573F",
    teal: "#2A6B6B", orange: "#D4850A", purple: "#5B2D8E"
  };

  // Current settings (defaults: both on)
  let settings = { showBadge: true, showTranslations: true };

  // ── Read settings from storage ──
  function loadSettings() {
    return new Promise((resolve) => {
      const storage = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local)
        ? chrome.storage.local
        : (typeof browser !== "undefined" && browser.storage && browser.storage.local)
          ? browser.storage.local
          : null;
      if (!storage) {
        resolve(settings);
        return;
      }
      storage.get(["showTranslations", "showBadge"], (result) => {
        settings.showBadge = result.showBadge !== false;
        settings.showTranslations = result.showTranslations !== false;
        resolve(settings);
      });
    });
  }

  // ── SessionStorage cache helpers ──
  function getCachedData(url) {
    try {
      const raw = sessionStorage.getItem("ta-cache:" + url);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - cached.timestamp > CACHE_TTL) {
        sessionStorage.removeItem("ta-cache:" + url);
        return null;
      }
      return cached.data;
    } catch (e) {
      return null;
    }
  }

  function setCachedData(url, data) {
    try {
      sessionStorage.setItem("ta-cache:" + url, JSON.stringify({
        timestamp: Date.now(),
        data: data
      }));
    } catch (e) {
      // sessionStorage full or unavailable — ignore
    }
  }

  // ── Fetch via Background Service Worker ──
  // Content scripts run in the page's origin (e.g. cnn.com), NOT the
  // extension's origin. In Manifest V3, Chrome no longer grants content
  // scripts the extension's CORS bypass, so a fetch from cnn.com to
  // trustassembly.org is blocked by the browser's same-origin policy.
  //
  // Solution: route the fetch through the background service worker,
  // which runs in the extension's origin and is not subject to CORS.
  // Falls back to direct fetch (via TA.getForURL) if messaging fails.
  function fetchViaBackground(url) {
    const apiUrl = (typeof TA !== "undefined" ? "https://trustassembly.org" : "https://trustassembly.org")
      + "/api/corrections?url=" + encodeURIComponent(url);
    return new Promise((resolve) => {
      const empty = { corrections: [], affirmations: [], translations: [], meta: {} };
      try {
        const rt = (typeof chrome !== "undefined" && chrome.runtime) ? chrome.runtime
          : (typeof browser !== "undefined" && browser.runtime) ? browser.runtime : null;
        if (!rt || !rt.sendMessage) {
          console.warn("[TrustAssembly] No runtime.sendMessage — falling back to direct fetch");
          TA.getForURL(url).then(resolve).catch(() => resolve(empty));
          return;
        }
        rt.sendMessage({ type: "TA_FETCH", url: apiUrl }, (response) => {
          if (rt.lastError) {
            console.warn("[TrustAssembly] Background fetch failed:", rt.lastError.message, "— falling back to direct fetch");
            TA.getForURL(url).then(resolve).catch(() => resolve(empty));
            return;
          }
          if (response && response.ok && response.data) {
            const data = response.data;
            // Normalize: older API versions may return flat array
            if (Array.isArray(data)) {
              resolve({
                corrections: data.filter(s => s.submissionType !== "affirmation"),
                affirmations: data.filter(s => s.submissionType === "affirmation"),
                translations: [],
                meta: {}
              });
            } else {
              resolve({
                corrections: data.corrections || [],
                affirmations: data.affirmations || [],
                translations: data.translations || [],
                meta: data.meta || {}
              });
            }
          } else {
            console.warn("[TrustAssembly] Background fetch returned error:", response?.error);
            TA.getForURL(url).then(resolve).catch(() => resolve(empty));
          }
        });
      } catch (e) {
        console.warn("[TrustAssembly] Exception sending message to background:", e.message);
        TA.getForURL(url).then(resolve).catch(() => resolve(empty));
      }
    });
  }

  // ── Site Architecture Detection ──
  // Branching logic to identify the site's CMS/framework and choose
  // the optimal headline selectors. Each site type returns a ranked
  // list of selectors plus a flag indicating whether the site renders
  // headlines dynamically (requiring a wait-for-element strategy).
  function detectSiteType() {
    const host = window.location.hostname.replace(/^www\./, "");
    const html = document.documentElement;

    // --- CNN (Clay CMS) ---
    if (host.includes("cnn.com") || html.getAttribute("data-layout-uri")?.includes("cnn.com")) {
      return {
        name: "cnn",
        dynamic: true,
        headlineSelectors: [
          'h1.headline__text', 'h1[data-editable="headlineText"]',
          '.headline__text', '.pg-headline', '[data-editable="headlineText"]',
          'h1[class*="headline"]', '.article__title', '.video__headline',
          '.headline', 'h1',
        ],
        articleRoot: '.article__content, .zn-body__paragraph, article, [data-zone-label="body"]',
        waitSelector: 'h1.headline__text, h1[data-editable="headlineText"], .headline__text, h1[class*="headline"], h1',
      };
    }

    // --- New York Times (React SPA) ---
    if (host.includes("nytimes.com")) {
      return {
        name: "nyt",
        dynamic: true,
        headlineSelectors: [
          'h1[data-testid="headline"]', 'h1[class*="headline"]',
          '[data-testid="headline"]', 'article h1',
          'h1[class*="StoryPage"]', 'h1',
        ],
        articleRoot: 'article, [data-testid="article-body"], section[name="articleBody"]',
        waitSelector: 'h1[data-testid="headline"], article h1, h1',
      };
    }

    // --- Washington Post ---
    if (host.includes("washingtonpost.com")) {
      return {
        name: "wapo",
        dynamic: true,
        headlineSelectors: [
          'h1[data-qa="headline"]', 'h1#main-content', '[data-qa="headline"]',
          'h1[class*="headline"]', 'article h1', 'h1',
        ],
        articleRoot: 'article, .article-body, [data-qa="article-body"]',
        waitSelector: 'h1[data-qa="headline"], h1#main-content, h1',
      };
    }

    // --- Fox News ---
    if (host.includes("foxnews.com")) {
      return {
        name: "fox",
        dynamic: true,
        headlineSelectors: [
          'h1.headline', 'h1[class*="headline"]', '.headline',
          'article h1', 'h1',
        ],
        articleRoot: 'article, .article-body, .content-body',
        waitSelector: 'h1.headline, article h1, h1',
      };
    }

    // --- BBC ---
    if (host.includes("bbc.com") || host.includes("bbc.co.uk")) {
      return {
        name: "bbc",
        dynamic: true,
        headlineSelectors: [
          'h1#main-heading', 'h1[class*="Headline"]', '[data-testid="headline"]',
          'h1[class*="headline"]', 'article h1', 'h1',
        ],
        articleRoot: 'article, [data-component="text-block"], main',
        waitSelector: 'h1#main-heading, h1[class*="Headline"], article h1, h1',
      };
    }

    // --- Reuters ---
    if (host.includes("reuters.com")) {
      return {
        name: "reuters",
        dynamic: true,
        headlineSelectors: [
          'h1[data-testid="Heading"]', 'h1[class*="article-header"]',
          'h1[class*="headline"]', 'article h1', 'h1',
        ],
        articleRoot: 'article, [data-testid="article-body"], .article-body__content',
        waitSelector: 'h1[data-testid="Heading"], article h1, h1',
      };
    }

    // --- Associated Press ---
    if (host.includes("apnews.com")) {
      return {
        name: "ap",
        dynamic: true,
        headlineSelectors: [
          'h1[class*="Page-headline"]', 'h1.headline',
          'h1[class*="headline"]', 'article h1', 'h1',
        ],
        articleRoot: 'article, .RichTextStoryBody, .Article',
        waitSelector: 'h1[class*="headline"], article h1, h1',
      };
    }

    // --- NPR ---
    if (host.includes("npr.org")) {
      return {
        name: "npr",
        dynamic: false,
        headlineSelectors: [
          'h1.storytitle', 'h1[class*="title"]', 'article h1', 'h1',
        ],
        articleRoot: 'article, .storytext, #storytext',
        waitSelector: null,
      };
    }

    // --- MSNBC / NBC News ---
    if (host.includes("msnbc.com") || host.includes("nbcnews.com")) {
      return {
        name: "nbc",
        dynamic: true,
        headlineSelectors: [
          'h1[class*="headline"]', 'h1[class*="article-hero"]',
          'h1.article-hero__headline', 'article h1', 'h1',
        ],
        articleRoot: 'article, .article-body, [class*="article-body"]',
        waitSelector: 'h1[class*="headline"], article h1, h1',
      };
    }

    // --- The Guardian ---
    if (host.includes("theguardian.com")) {
      return {
        name: "guardian",
        dynamic: false,
        headlineSelectors: [
          'h1[data-gu-name="headline"]', 'h1[class*="headline"]',
          '.content__headline', 'article h1', 'h1',
        ],
        articleRoot: 'article, .article-body-commercial-selector, .content__article-body',
        waitSelector: null,
      };
    }

    // --- WordPress (detected by meta generator or body class) ---
    const wpMeta = document.querySelector('meta[name="generator"][content*="WordPress"]');
    const wpBody = document.body?.classList.contains("wp-") || document.body?.className?.includes("wordpress");
    if (wpMeta || wpBody) {
      return {
        name: "wordpress",
        dynamic: false,
        headlineSelectors: [
          '.entry-title', '.post-title', 'h1.entry-title', 'h1.post-title',
          'article h1', '.article-title', 'h1[class*="title"]', 'h1',
        ],
        articleRoot: 'article, .entry-content, .post-content, .article-content',
        waitSelector: null,
      };
    }

    // --- Substack ---
    if (host.includes("substack.com") || document.querySelector('meta[property="article:publisher"][content*="substack"]')) {
      return {
        name: "substack",
        dynamic: false,
        headlineSelectors: [
          'h1.post-title', 'h1[class*="post-title"]',
          '.post-header h1', 'article h1', 'h1',
        ],
        articleRoot: 'article, .body.markup, .post-content',
        waitSelector: null,
      };
    }

    // --- Medium ---
    if (host.includes("medium.com") || document.querySelector('meta[property="al:android:package"][content="com.medium.reader"]')) {
      return {
        name: "medium",
        dynamic: true,
        headlineSelectors: [
          'h1[data-testid="storyTitle"]', 'article h1',
          'h1[class*="title"]', 'h1',
        ],
        articleRoot: 'article, [data-testid="storyContent"]',
        waitSelector: 'article h1, h1',
      };
    }

    // --- Yahoo News ---
    if (host.includes("yahoo.com")) {
      return {
        name: "yahoo",
        dynamic: true,
        headlineSelectors: [
          '[data-test-locator="headline"]', 'h1[data-test-locator="headline"]',
          'h1.caas-title-url', 'h1[class*="caas-title"]',
          'h1[class*="headline"]', 'article h1', 'h1',
        ],
        articleRoot: '.caas-body, article, [data-test-locator="articleBody"]',
        waitSelector: '[data-test-locator="headline"], h1[class*="caas-title"], h1',
      };
    }

    // --- Daily Mail ---
    if (host.includes("dailymail.co.uk") || host.includes("mailonline.com")) {
      return {
        name: "dailymail",
        dynamic: false,
        headlineSelectors: [
          'h2#js-article-text', 'h2.mol-para-with-font',
          '#js-article-text h2', '[itemprop="headline"]',
          'h1[class*="headline"]', 'h2[class*="headline"]',
          'h1', 'h2',
        ],
        articleRoot: '#js-article-text, .article-text, article, [itemprop="articleBody"]',
        waitSelector: null,
      };
    }

    // --- Wall Street Journal ---
    if (host.includes("wsj.com")) {
      return {
        name: "wsj",
        dynamic: true,
        headlineSelectors: [
          'h1.wsj-article-headline', 'h1[class*="StyledHeadline"]',
          'h1[class*="headline"]', 'h1[class*="article"]',
          'article h1', 'h1',
        ],
        articleRoot: '.article-content, [class*="article-body"], article',
        waitSelector: 'h1.wsj-article-headline, h1[class*="headline"], article h1, h1',
      };
    }

    // --- Bloomberg ---
    if (host.includes("bloomberg.com")) {
      return {
        name: "bloomberg",
        dynamic: true,
        headlineSelectors: [
          'h1[data-component="hed"]', 'h1[class*="headline"]',
          'h1[class*="lede"]', 'article h1', 'h1',
        ],
        articleRoot: 'article, [class*="body-content"], .article-body',
        waitSelector: 'h1[data-component="hed"], h1[class*="headline"], h1',
      };
    }

    // --- Politico ---
    if (host.includes("politico.com") || host.includes("politico.eu")) {
      return {
        name: "politico",
        dynamic: true,
        headlineSelectors: [
          'h2.headline', 'h1.headline', 'h1[class*="headline"]',
          'h2[class*="headline"]', '.story-main-content h2',
          'article h1', 'article h2', 'h1', 'h2',
        ],
        articleRoot: '.story-text, .article__text, article, .story-main-content',
        waitSelector: 'h2.headline, h1.headline, h1, h2',
      };
    }

    // --- The Hill ---
    if (host.includes("thehill.com")) {
      return {
        name: "thehill",
        dynamic: true,
        headlineSelectors: [
          'h1.page-title', 'h1[class*="title"]',
          'h1[class*="headline"]', 'article h1', 'h1',
        ],
        articleRoot: 'article, .field-items, .content-wrp',
        waitSelector: 'h1.page-title, article h1, h1',
      };
    }

    // --- Axios ---
    if (host.includes("axios.com")) {
      return {
        name: "axios",
        dynamic: true,
        headlineSelectors: [
          'h1[class*="headline"]', 'h1[class*="gtm-hed"]',
          'article h1', 'h1',
        ],
        articleRoot: 'article, .story-content, [class*="story-body"]',
        waitSelector: 'article h1, h1',
      };
    }

    // --- USA Today / Gannett properties ---
    if (host.includes("usatoday.com") || document.querySelector('meta[name="generator"][content*="Gannett"]') || host.match(/\.(com|org)$/) && document.querySelector('[data-ss-t]')) {
      return {
        name: "gannett",
        dynamic: true,
        headlineSelectors: [
          'h1[data-ss-t]', 'h1.gnt_ar_hl', 'h1[class*="gnt_ar"]',
          'h1[class*="headline"]', 'h1[class*="title"]',
          'article h1', 'h1',
        ],
        articleRoot: '.gnt_ar_b, article, [class*="article-body"]',
        waitSelector: 'h1[data-ss-t], h1.gnt_ar_hl, article h1, h1',
      };
    }

    // --- Vox Media (Verge, Vox, SB Nation, Eater, Polygon) ---
    if (host.includes("theverge.com") || host.includes("vox.com") || host.includes("sbnation.com") || host.includes("eater.com") || host.includes("polygon.com")) {
      return {
        name: "voxmedia",
        dynamic: true,
        headlineSelectors: [
          'h1.c-page-title', 'h1[class*="c-page-title"]',
          'h1[class*="entry-title"]', 'h1[class*="headline"]',
          'article h1', 'h1',
        ],
        articleRoot: '.c-entry-content, article, .entry-content',
        waitSelector: 'h1.c-page-title, article h1, h1',
      };
    }

    // --- Newsweek ---
    if (host.includes("newsweek.com")) {
      return {
        name: "newsweek",
        dynamic: true,
        headlineSelectors: [
          'h1.article-title', 'h1[class*="article-title"]',
          'h1[class*="headline"]', 'article h1', 'h1',
        ],
        articleRoot: 'article, .article-body, [class*="article-body"]',
        waitSelector: 'h1.article-title, article h1, h1',
      };
    }

    // --- The Intercept / ProPublica / investigative ---
    if (host.includes("theintercept.com") || host.includes("propublica.org")) {
      return {
        name: "investigative",
        dynamic: false,
        headlineSelectors: [
          'h1[class*="headline"]', 'h1[class*="hed"]',
          'h1.entry-title', 'article h1', 'h1',
        ],
        articleRoot: 'article, .entry-content, .article-body, [class*="article-body"]',
        waitSelector: null,
      };
    }

    // --- Al Jazeera ---
    if (host.includes("aljazeera.com")) {
      return {
        name: "aljazeera",
        dynamic: true,
        headlineSelectors: [
          'h1.article-header', 'h1[class*="post-title"]',
          'h1[class*="headline"]', 'article h1', 'h1',
        ],
        articleRoot: '.wysiwyg, article, .article-body',
        waitSelector: 'article h1, h1',
      };
    }

    // --- AMP pages (Google AMP / any publisher) ---
    if (host.includes("amp.") || host.includes("cdn.ampproject.org") || document.documentElement.hasAttribute("amp") || document.documentElement.hasAttribute("⚡")) {
      return {
        name: "amp",
        dynamic: false,
        headlineSelectors: [
          'h1[class*="headline"]', 'h1[class*="title"]',
          'h1.amp-article-header', '[itemprop="headline"]',
          'article h1', 'h1',
        ],
        articleRoot: 'article, amp-story, .article-body, [itemprop="articleBody"]',
        waitSelector: null,
      };
    }

    // --- Generic / unknown (broadest set of selectors) ---
    // Detect if the site appears to be an SPA by checking for common
    // framework markers (#app, #root, #__next, [data-reactroot], etc.)
    const spaRoot = document.querySelector('#app, #root, #__next, [data-reactroot], [ng-app], [data-v-app]');
    return {
      name: "generic",
      dynamic: !!spaRoot,
      headlineSelectors: [
        'h1[class*="headline"]', 'h1[class*="title"]',
        'h1[data-editable="headlineText"]', 'h1[data-testid*="headline"]',
        'h1[data-testid*="title"]', '[itemprop="headline"]',
        'article h1', '[role="main"] h1',
        '.article-header h1', '.post-header h1', '.entry-title',
        'h1.article-title', 'h1.main-headline', 'h1.headline',
        'h2[class*="headline"]', 'h2.headline', // some sites use h2
        'h1', 'h2', // last resort
      ],
      articleRoot: 'article, [role="main"], .article-body, .post-content, .entry-content, .story-body, main',
      waitSelector: spaRoot ? 'h1, h2' : null,
    };
  }

  // Cache the detected site type (computed once per page)
  let _siteType = null;
  function getSiteType() {
    if (!_siteType) _siteType = detectSiteType();
    return _siteType;
  }

  // ── Find the article body container (site-aware, reusable) ──
  // Used by corrections, affirmations, context card, and unapplied box
  // to find the best place to inject content. Falls back aggressively.
  function findArticleBody() {
    const site = getSiteType();
    // Try site-specific roots first
    if (site.articleRoot) {
      for (const sel of site.articleRoot.split(", ")) {
        try {
          const el = document.querySelector(sel.trim());
          if (el) return el;
        } catch (e) {}
      }
    }
    // Generic fallbacks
    const fallbacks = [
      "article", '[role="main"]', "main",
      ".article-body", ".article-content", ".post-content",
      ".entry-content", ".story-body", ".story-text",
      "[itemprop='articleBody']", ".content-body",
    ];
    for (const sel of fallbacks) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (e) {}
    }
    // Last resort: parent of first headline or body
    const h1 = document.querySelector("h1") || document.querySelector("h2");
    return (h1 && h1.parentElement) || document.body;
  }

  // ── Find the best headline element (site-aware, reusable) ──
  function findPrimaryHeadline() {
    const site = getSiteType();
    for (const selector of site.headlineSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim().length > 3) return el;
      } catch (e) {}
    }
    // CMS attribute fallbacks
    const cmsFallbacks = [
      '[itemprop="headline"]', '[data-editable="headlineText"]',
      '[data-testid="headline"]', '[data-qa="headline"]',
      '[data-test-locator="headline"]',
    ];
    for (const sel of cmsFallbacks) {
      try {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 3) return el;
      } catch (e) {}
    }
    return document.querySelector("h1") || document.querySelector("h2");
  }

  // ── Wait for an element to appear in the DOM ──
  // Returns a Promise that resolves when a matching element is found,
  // or rejects after the timeout. Essential for SPA/dynamic sites.
  function waitForElement(selector, timeout) {
    timeout = timeout || 8000;
    return new Promise((resolve, reject) => {
      // Check if already present
      const existing = document.querySelector(selector);
      if (existing && existing.textContent.trim()) {
        resolve(existing);
        return;
      }

      let timer;
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(el);
        }
      });

      observer.observe(document.documentElement, {
        childList: true, subtree: true, characterData: true
      });

      timer = setTimeout(() => {
        observer.disconnect();
        // Final check
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          resolve(el);
        } else {
          reject(new Error("Timeout waiting for: " + selector));
        }
      }, timeout);
    });
  }

  // ── Detect page URL and check for corrections ──
  // ── Real-time polling state ──
  const POLL_INTERVAL = 30 * 1000; // 30 seconds
  let pollTimer = null;
  let lastDataHash = null;

  async function init() {
    const url = window.location.href;
    if (!url.startsWith("http")) return;

    // Load user settings before doing anything
    await loadSettings();

    // Detect the site architecture
    const site = getSiteType();
    console.log("[TrustAssembly] Detected site type:", site.name, site.dynamic ? "(dynamic)" : "(static)");

    // For dynamic/SPA sites, wait for the headline element to appear
    // before fetching corrections — this ensures the DOM is ready
    if (site.dynamic && site.waitSelector) {
      try {
        await waitForElement(site.waitSelector, 10000);
        console.log("[TrustAssembly] Headline element detected in DOM, proceeding.");
      } catch (e) {
        console.log("[TrustAssembly] Headline not found after waiting — proceeding anyway (may retry via observer).");
      }
    }

    // Check cache first, then API
    let data = getCachedData(url);
    if (data) {
      console.log("[TrustAssembly] Using cached data for:", url);
    } else {
      console.log("[TrustAssembly] Fetching from API for:", url);
      data = await fetchViaBackground(url);
      setCachedData(url, data);
    }

    console.log("[TrustAssembly] API response:", data.corrections.length, "corrections,",
      data.affirmations.length, "affirmations,", data.translations.length, "translations");

    lastDataHash = hashData(data);
    applyData(data, url);

    // Re-apply after delays to survive framework hydration (React, Vue, etc.)
    // that can wipe injected DOM nodes shortly after initial load.
    // CNN's React hydration can take several seconds, so we retry aggressively.
    if (site.dynamic) {
      setTimeout(() => reapplyToNewContent(data), 800);
      setTimeout(() => reapplyToNewContent(data), 2000);
      setTimeout(() => reapplyToNewContent(data), 4000);
      setTimeout(() => reapplyToNewContent(data), 8000);
    }

    // Start polling for real-time updates
    startPolling(url);
  }

  function applyData(data, url) {
    const total = data.corrections.length + data.affirmations.length + data.translations.length;

    // Notify background script for badge count (even if zero, to clear old counts)
    try {
      chrome.runtime.sendMessage({ type: "TA_COUNT", count: total, url });
    } catch (e) {
      try { browser.runtime.sendMessage({ type: "TA_COUNT", count: total, url }); } catch (_) {}
    }

    if (total === 0 && (!data.vault || data.vault.length === 0)) return;

    // Apply corrections and affirmations inline on headlines
    if (data.corrections.length > 0) {
      applyInlineCorrections(data.corrections);
      applyInlineEdits(data.corrections);
    }
    if (data.affirmations.length > 0) {
      applyInlineAffirmations(data.affirmations);
    }

    // Apply translations inline (if enabled)
    if (settings.showTranslations && data.translations.length > 0) {
      applyTranslations(data.translations);
    }

    // Render the Trust Context Card below the headline
    renderTrustContextCard(data);

    // Render the floating badge (if enabled)
    if (settings.showBadge) {
      renderBadge(data);
    }

    // Store data on window for later use by settings changes
    window.__trustAssemblyData = data;

    // Start watching for dynamically loaded content (Twitter feeds,
    // Facebook posts, SPA navigations, infinite scroll, etc.)
    startObserver(data);
  }

  // ── Real-time polling ──
  // Periodically re-fetch corrections from the API so new approvals
  // appear without requiring a page refresh.
  function startPolling(url) {
    if (pollTimer) return;

    pollTimer = setInterval(async () => {
      try {
        const freshData = await fetchViaBackground(url);
        const freshHash = hashData(freshData);

        if (freshHash !== lastDataHash) {
          lastDataHash = freshHash;
          // Update cache
          setCachedData(url, freshData);

          // Remove old Trust Context Card so it re-renders with new data
          const oldCard = document.getElementById("ta-context-card");
          if (oldCard) oldCard.remove();

          // Remove old unapplied box
          const oldUnapplied = document.getElementById("ta-unapplied-box");
          if (oldUnapplied) oldUnapplied.remove();

          // Re-apply everything
          applyData(freshData, url);

          console.log("[TrustAssembly] Real-time update: new corrections detected and applied.");
        }
      } catch (e) {
        // Silently ignore polling errors — network hiccups shouldn't break anything
      }
    }, POLL_INTERVAL);
  }

  // Simple hash to detect data changes without deep comparison
  function hashData(data) {
    const sig = [
      data.corrections.map(c => c.id || c.originalHeadline).join(","),
      data.affirmations.map(a => a.id || a.originalHeadline).join(","),
      data.translations.map(t => t.id || t.original).join(","),
    ].join("|");
    // Simple string hash
    let hash = 0;
    for (let i = 0; i < sig.length; i++) {
      hash = ((hash << 5) - hash) + sig.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  // ── Listen for settings change messages from popup/background ──
  function listenForSettingsChanges() {
    const runtime = (typeof chrome !== "undefined" && chrome.runtime) ? chrome.runtime
      : (typeof browser !== "undefined" && browser.runtime) ? browser.runtime : null;
    if (!runtime) return;

    runtime.onMessage.addListener((message) => {
      if (message.type === "TA_SETTINGS_CHANGED") {
        const oldSettings = { ...settings };
        if (message.showBadge !== undefined) settings.showBadge = message.showBadge;
        if (message.showTranslations !== undefined) settings.showTranslations = message.showTranslations;

        const data = window.__trustAssemblyData;
        if (!data) return;

        // Handle badge visibility
        if (settings.showBadge && !document.getElementById(BADGE_ID)) {
          renderBadge(data);
        } else if (!settings.showBadge) {
          const badge = document.getElementById(BADGE_ID);
          if (badge) badge.remove();
          const panel = document.getElementById(PANEL_ID);
          if (panel) panel.remove();
        }

        // Handle translations visibility
        if (settings.showTranslations && !oldSettings.showTranslations) {
          // Re-apply translations (page reload is cleaner, but we can re-apply)
          if (data.translations.length > 0) {
            applyTranslations(data.translations);
          }
        } else if (!settings.showTranslations && oldSettings.showTranslations) {
          // Remove inline translations
          removeTranslations();
        }
      }
    });
  }

  // ── Also listen for storage changes (works without messaging) ──
  function listenForStorageChanges() {
    const storage = (typeof chrome !== "undefined" && chrome.storage) ? chrome.storage
      : (typeof browser !== "undefined" && browser.storage) ? browser.storage : null;
    if (!storage) return;

    storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      const data = window.__trustAssemblyData;
      if (!data) return;

      if (changes.showBadge !== undefined) {
        settings.showBadge = changes.showBadge.newValue !== false;
        if (settings.showBadge && !document.getElementById(BADGE_ID)) {
          renderBadge(data);
        } else if (!settings.showBadge) {
          const badge = document.getElementById(BADGE_ID);
          if (badge) badge.remove();
          const panel = document.getElementById(PANEL_ID);
          if (panel) panel.remove();
        }
      }

      if (changes.showTranslations !== undefined) {
        const wasEnabled = settings.showTranslations;
        settings.showTranslations = changes.showTranslations.newValue !== false;
        if (settings.showTranslations && !wasEnabled && data.translations.length > 0) {
          applyTranslations(data.translations);
        } else if (!settings.showTranslations && wasEnabled) {
          removeTranslations();
        }
      }
    });
  }

  // ── Remove inline translations ──
  function removeTranslations() {
    document.querySelectorAll(".ta-ext-translated").forEach(span => {
      // Replace the annotated span with its original text (without the TA superscript)
      const sup = span.querySelector("sup");
      if (sup) sup.remove();
      const text = document.createTextNode(span.textContent);
      span.parentNode.replaceChild(text, span);
    });
  }

  // ── Floating Badge ──
  function renderBadge(data) {
    const total = data.corrections.length + data.affirmations.length + data.translations.length;
    if (document.getElementById(BADGE_ID)) return;

    const badge = document.createElement("div");
    badge.id = BADGE_ID;
    badge.innerHTML = `
      <div class="ta-ext-badge-inner">
        <div class="ta-ext-badge-icon">⚖</div>
        <div class="ta-ext-badge-count">${total}</div>
      </div>
    `;
    badge.addEventListener("click", () => togglePanel(data));
    document.body.appendChild(badge);
  }

  // ── Conflict resolution ──
  // Group corrections by originalHeadline. Within each group, pick winner by:
  // 1. Highest trustScore (descending)
  // 2. Ties: alphabetical by orgName (ascending)
  function resolveConflicts(corrections) {
    const groups = {};
    corrections.forEach(sub => {
      const key = (sub.originalHeadline || "").toLowerCase().trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(sub);
    });
    return Object.values(groups).map(items => {
      items.sort((a, b) => {
        const sa = a.trustScore ?? -1;
        const sb = b.trustScore ?? -1;
        if (sb !== sa) return sb - sa;
        return (a.orgName || "").localeCompare(b.orgName || "");
      });
      return { winner: items[0], others: items.slice(1) };
    });
  }

  // ── Relationship badge (Joined/Followed) ──
  function relBadge(orgId, assemblies) {
    if (!assemblies || !orgId) return "";
    if (assemblies.joined && assemblies.joined.some(o => o.id === orgId)) {
      return '<span style="display:inline-block;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:1px 5px;border-radius:2px;margin-left:4px;background:#1B5E3F;color:#fff">Joined</span>';
    }
    if (assemblies.followed && assemblies.followed.some(o => o.id === orgId)) {
      return '<span style="display:inline-block;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:1px 5px;border-radius:2px;margin-left:4px;background:#2A6B6B;color:#fff">Followed</span>';
    }
    return "";
  }

  // ── Status color for card border ──
  function statusBorderColor(status) {
    if (status === "consensus") return COLORS.purple;
    if (status === "approved") return "#1B5E3F";
    return COLORS.gold;
  }

  // ── Render a single correction card ──
  function renderCorrectionCard(sub, assemblies) {
    const profile = sub.profile?.displayName || "Citizen";
    const score = sub.trustScore != null ? sub.trustScore : "—";
    const borderColor = statusBorderColor(sub.status);
    return `
      <div class="ta-ext-card ta-ext-card-correction" style="border-left-color:${borderColor}">
        <div class="ta-ext-card-meta">
          <span class="ta-ext-profile-badge" style="border-color:${COLORS.red}; color:${COLORS.red}">
            ${profile} · ${score}
          </span>
          <span class="ta-ext-card-assembly">${sub.orgName || "Assembly"}${relBadge(sub.orgId, assemblies)}</span>
        </div>
        <div class="ta-ext-headline-original">${escapeHtml(sub.originalHeadline)}</div>
        <div class="ta-ext-headline-replacement">${escapeHtml(sub.replacement)}</div>
        ${sub.author ? `<div class="ta-ext-author">Author: ${escapeHtml(sub.author)}</div>` : ""}
        <div class="ta-ext-reasoning">${escapeHtml(sub.reasoning)}</div>
        ${sub.evidence && sub.evidence.length > 0 ? `
          <div class="ta-ext-evidence">
            ${sub.evidence.map(e => `<a href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${escapeHtml(e.explanation || e.url)}</a>`).join("")}
          </div>` : ""}
        <div class="ta-ext-card-status ta-ext-status-${sub.status || "approved"}">${formatStatus(sub.status)}</div>
      </div>
    `;
  }

  // ── Side Panel ──
  function togglePanel(data) {
    const existing = document.getElementById(PANEL_ID);
    if (existing) { existing.remove(); return; }

    // Try to load cached assemblies for badges
    let assemblies = null;
    try {
      const stored = sessionStorage.getItem("ta-assemblies-cache");
      if (stored) assemblies = JSON.parse(stored);
    } catch (e) {}
    // Also try from extension storage (async, but we render sync — fill on next open)
    if (!assemblies) {
      try {
        const storage = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;
        if (storage) {
          storage.get(["ta-assemblies"], (result) => {
            if (result["ta-assemblies"]) {
              try { sessionStorage.setItem("ta-assemblies-cache", result["ta-assemblies"]); } catch (e) {}
            }
          });
        }
      } catch (e) {}
    }

    const panel = document.createElement("div");
    panel.id = PANEL_ID;

    let html = `
      <div class="ta-ext-panel-header">
        <div class="ta-ext-panel-title">⚖ Trust Assembly</div>
        <button class="ta-ext-panel-close" id="ta-ext-close">✕</button>
      </div>
      <div class="ta-ext-panel-subtitle">${data.corrections.length} correction${data.corrections.length !== 1 ? "s" : ""} · ${data.affirmations.length} affirmation${data.affirmations.length !== 1 ? "s" : ""} · ${data.translations.length} translation${data.translations.length !== 1 ? "s" : ""}</div>
      <div class="ta-ext-panel-body">
    `;

    // Corrections — conflict-resolved
    const resolved = resolveConflicts(data.corrections);
    resolved.forEach(group => {
      // Winner: full display
      html += renderCorrectionCard(group.winner, assemblies);
      // Others: collapsed
      if (group.others.length > 0) {
        const gid = "ta-cg-" + Math.random().toString(36).slice(2, 8);
        html += `<div style="font-size:10px;color:${COLORS.gold};cursor:pointer;padding:2px 12px 8px" onclick="var el=document.getElementById('${gid}');el.style.display=el.style.display==='none'?'':'none'">See ${group.others.length} other correction${group.others.length !== 1 ? "s" : ""}</div>`;
        html += `<div id="${gid}" style="display:none">`;
        group.others.forEach(sub => { html += renderCorrectionCard(sub, assemblies); });
        html += `</div>`;
      }
    });

    // Affirmations
    data.affirmations.forEach(sub => {
      const profile = sub.profile?.displayName || "Citizen";
      const score = sub.trustScore != null ? sub.trustScore : "—";
      const borderColor = statusBorderColor(sub.status);
      html += `
        <div class="ta-ext-card ta-ext-card-affirmation" style="border-left-color:${borderColor}">
          <div class="ta-ext-card-meta">
            <span class="ta-ext-profile-badge" style="border-color:${COLORS.green}; color:${COLORS.green}">
              ${profile} · ${score}
            </span>
            <span class="ta-ext-card-assembly">${sub.orgName || "Assembly"}${relBadge(sub.orgId, assemblies)}</span>
          </div>
          <div class="ta-ext-headline-affirmed">✓ ${escapeHtml(sub.originalHeadline)}</div>
          ${sub.author ? `<div class="ta-ext-author">Author: ${escapeHtml(sub.author)}</div>` : ""}
          <div class="ta-ext-reasoning">${escapeHtml(sub.reasoning)}</div>
          ${sub.evidence && sub.evidence.length > 0 ? `
            <div class="ta-ext-evidence">
              ${sub.evidence.map(e => `<a href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${escapeHtml(e.explanation || e.url)}</a>`).join("")}
            </div>` : ""}
          <div class="ta-ext-card-status ta-ext-status-${sub.status || "approved"}">${formatStatus(sub.status)}</div>
        </div>
      `;
    });

    // Translations applied to this page
    if (data.translations.length > 0) {
      html += `<div class="ta-ext-section-title">🔄 Active Translations</div>`;
      data.translations.forEach(t => {
        const typeLabels = { clarity: "Clarity", propaganda: "Anti-Propaganda", euphemism: "Euphemism", satirical: "Satirical" };
        html += `
          <div class="ta-ext-card ta-ext-card-translation">
            <div class="ta-ext-card-meta">
              <span class="ta-ext-translation-type">${typeLabels[t.type] || t.type}</span>
              <span class="ta-ext-card-assembly">${t.orgName || "Assembly"}</span>
            </div>
            <div class="ta-ext-translation-pair">
              <span class="ta-ext-translation-original">${escapeHtml(t.original)}</span>
              <span class="ta-ext-translation-arrow">→</span>
              <span class="ta-ext-translation-result">${escapeHtml(t.translated)}</span>
            </div>
          </div>
        `;
      });
    }

    html += `
      </div>
      <div class="ta-ext-panel-footer">
        <a href="https://trustassembly.org" target="_blank" rel="noopener">Trust Assembly</a> · Truth Will Out
      </div>
    `;

    panel.innerHTML = html;
    document.body.appendChild(panel);

    document.getElementById("ta-ext-close").addEventListener("click", () => panel.remove());
  }

  // ── Fuzzy headline text matching ──
  // Normalizes and compares two strings to determine if they refer to the
  // same headline, handling whitespace, punctuation, and encoding differences.
  function normalizeForMatch(text) {
    return text.replace(/\s+/g, " ").replace(/['']/g, "'").replace(/[""]/g, '"').trim().toLowerCase();
  }

  function headlinesMatch(pageText, correctionText) {
    const a = normalizeForMatch(pageText);
    const b = normalizeForMatch(correctionText);
    if (!a || !b) return false;
    // Exact match
    if (a === b) return true;
    // Containment (one inside the other)
    if (a.includes(b) || b.includes(a)) return true;
    // Prefix/suffix match (headline may have been truncated or have trailing junk)
    if (a.length > 20 && b.length > 20) {
      const shorter = a.length < b.length ? a : b;
      const longer = a.length < b.length ? b : a;
      // 80% of shorter string matches start of longer
      const prefixLen = Math.floor(shorter.length * 0.8);
      if (longer.startsWith(shorter.slice(0, prefixLen))) return true;
    }
    return false;
  }

  // ── Apply Corrections Inline on Headlines ──
  function applyInlineCorrections(corrections) {
    if (!corrections || corrections.length === 0) return;

    // Find all headline elements on the page
    const headlineEls = findAllHeadlineElements();
    const articleBody = findArticleBody();

    console.log("[TrustAssembly] Found", headlineEls.length, "headline elements on page");
    headlineEls.forEach((el, i) => {
      console.log("[TrustAssembly]   headline[" + i + "]:", JSON.stringify(el.textContent.trim().slice(0, 80)));
    });

    // Resolve conflicts so we show the winning correction
    const resolved = resolveConflicts(corrections);

    console.log("[TrustAssembly] Resolved to", resolved.length, "correction group(s)");

    // Track which corrections could not be matched to any element
    const unapplied = [];

    resolved.forEach(group => {
      const sub = group.winner;
      if (!sub.originalHeadline || !sub.replacement) return;

      console.log("[TrustAssembly] Looking for match — originalHeadline:", JSON.stringify(sub.originalHeadline.slice(0, 80)));

      let matched = false;

      // Phase 1: Match against found headline elements
      headlineEls.forEach(el => {
        // If previously annotated, check that the annotation still exists
        // in the DOM. Frameworks like React can re-render parent containers,
        // removing our injected siblings while leaving the h1 intact.
        if (el.dataset.taAnnotated) {
          const annotationExists = el.nextElementSibling?.classList.contains("ta-inline-correction")
            || el.parentNode?.querySelector(".ta-inline-correction")
            || document.querySelector(".ta-inline-correction");
          if (annotationExists) return;
          // Annotation was removed — clear flag and re-apply
          delete el.dataset.taAnnotated;
          el.classList.remove("ta-inline-headline-corrected");
        }
        if (!headlinesMatch(el.textContent, sub.originalHeadline)) return;

        matched = true;
        el.dataset.taAnnotated = "true";

        console.log("[TrustAssembly] Injecting inline correction after headline element:", el.tagName, el.className);

        // Create inline annotation wrapper with forced inline styles
        // to survive hostile site CSS (overflow:hidden, flex layouts, etc.)
        const wrapper = document.createElement("div");
        wrapper.className = "ta-inline-correction";
        wrapper.setAttribute("style",
          "display:block !important;visibility:visible !important;opacity:1 !important;" +
          "overflow:visible !important;max-height:none !important;height:auto !important;" +
          "position:relative !important;z-index:10000 !important;" +
          "margin:8px 0 16px !important;padding:12px 16px !important;" +
          "border-left:4px solid #C4573F !important;background:#FDF8F7 !important;" +
          "border-radius:0 4px 4px 0 !important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif !important;" +
          "width:auto !important;min-height:40px !important;float:none !important;clear:both !important;" +
          "clip:auto !important;clip-path:none !important;transform:none !important;"
        );

        const origSpan = document.createElement("div");
        origSpan.className = "ta-inline-original";
        origSpan.setAttribute("style",
          "display:block !important;font-size:14px !important;text-decoration:line-through !important;" +
          "text-decoration-color:#C4573F !important;color:#5A5650 !important;margin-bottom:4px !important;line-height:1.4 !important;"
        );
        origSpan.textContent = el.textContent;

        const replSpan = document.createElement("div");
        replSpan.className = "ta-inline-replacement";
        replSpan.setAttribute("style",
          "display:block !important;font-size:18px !important;color:#C4573F !important;" +
          "font-weight:700 !important;line-height:1.4 !important;margin-bottom:6px !important;"
        );
        replSpan.textContent = sub.replacement;

        const metaSpan = document.createElement("div");
        metaSpan.className = "ta-inline-meta";
        metaSpan.setAttribute("style",
          "display:block !important;font-size:11px !important;color:#7A7570 !important;" +
          "margin-bottom:4px !important;letter-spacing:0.02em !important;"
        );
        const org = sub.orgName || "Assembly";
        const profile = sub.profile?.displayName || "Citizen";
        const score = sub.trustScore != null ? sub.trustScore : "—";
        metaSpan.innerHTML = `⚖ <strong style="color:#1B2A4A !important">${escapeHtml(org)}</strong> · ${escapeHtml(profile)} · Trust Score ${score}`;

        wrapper.appendChild(origSpan);
        wrapper.appendChild(replSpan);
        wrapper.appendChild(metaSpan);
        if (sub.reasoning) {
          const reasonSpan = document.createElement("div");
          reasonSpan.className = "ta-inline-reasoning";
          reasonSpan.setAttribute("style",
            "display:block !important;font-size:12px !important;color:#5A5650 !important;" +
            "line-height:1.5 !important;font-style:italic !important;"
          );
          const maxLen = 180;
          reasonSpan.textContent = sub.reasoning.length > maxLen
            ? sub.reasoning.slice(0, maxLen) + "…"
            : sub.reasoning;
          wrapper.appendChild(reasonSpan);
        }

        // Find a safe insertion point — walk up from the headline element
        // to escape tightly-constrained layout containers (flex, grid,
        // overflow:hidden) that would clip or hide our injection.
        let insertTarget = el;
        let insertParent = el.parentNode;
        for (let i = 0; i < 5 && insertParent && insertParent !== document.body; i++) {
          const style = window.getComputedStyle(insertParent);
          const isConstrained = style.overflow === "hidden" || style.overflow === "clip"
            || style.display === "flex" || style.display === "inline-flex"
            || style.display === "grid" || style.display === "inline-grid";
          if (isConstrained) {
            // Move up — insert after this constrained parent instead
            insertTarget = insertParent;
            insertParent = insertParent.parentNode;
            console.log("[TrustAssembly] Escaping constrained container:", insertTarget.tagName, insertTarget.className, "(" + style.display + ", overflow:" + style.overflow + ")");
          } else {
            break;
          }
        }

        insertParent.insertBefore(wrapper, insertTarget.nextSibling);
        el.classList.add("ta-inline-headline-corrected");
        console.log("[TrustAssembly] Correction injected. wrapper.offsetHeight:", wrapper.offsetHeight, "wrapper.getBoundingClientRect():", JSON.stringify(wrapper.getBoundingClientRect()));
      });

      // Phase 2: If no headline element matched, do a raw text-node search
      // This catches headlines in non-standard elements (spans, divs, etc.)
      if (!matched) {
        console.log("[TrustAssembly] Phase 1 failed, trying text-node search...");
        const searchRoot = articleBody || document.body;
        const walker = document.createTreeWalker(searchRoot, NodeFilter.SHOW_TEXT, null, false);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent || node.textContent.trim().length < 10) continue;
          // Skip our own injections
          if (node.parentNode.closest && node.parentNode.closest("[class^='ta-inline'], [class^='ta-ext'], [id^='ta-']")) continue;
          if (headlinesMatch(node.textContent, sub.originalHeadline)) {
            matched = true;
            const parent = node.parentElement;
            if (parent && !parent.dataset.taAnnotated) {
              parent.dataset.taAnnotated = "true";
              const wrapper = document.createElement("div");
              wrapper.className = "ta-inline-correction";
              wrapper.setAttribute("style",
                "display:block !important;visibility:visible !important;opacity:1 !important;" +
                "overflow:visible !important;max-height:none !important;height:auto !important;" +
                "position:relative !important;z-index:10000 !important;" +
                "margin:8px 0 16px !important;padding:12px 16px !important;" +
                "border-left:4px solid #C4573F !important;background:#FDF8F7 !important;" +
                "border-radius:0 4px 4px 0 !important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif !important;" +
                "width:auto !important;min-height:40px !important;float:none !important;clear:both !important;" +
                "clip:auto !important;clip-path:none !important;transform:none !important;"
              );

              const origSpan = document.createElement("div");
              origSpan.className = "ta-inline-original";
              origSpan.setAttribute("style",
                "display:block !important;font-size:14px !important;text-decoration:line-through !important;" +
                "text-decoration-color:#C4573F !important;color:#5A5650 !important;margin-bottom:4px !important;line-height:1.4 !important;"
              );
              origSpan.textContent = node.textContent.trim();

              const replSpan = document.createElement("div");
              replSpan.className = "ta-inline-replacement";
              replSpan.setAttribute("style",
                "display:block !important;font-size:18px !important;color:#C4573F !important;" +
                "font-weight:700 !important;line-height:1.4 !important;margin-bottom:6px !important;"
              );
              replSpan.textContent = sub.replacement;

              const metaSpan = document.createElement("div");
              metaSpan.className = "ta-inline-meta";
              metaSpan.setAttribute("style",
                "display:block !important;font-size:11px !important;color:#7A7570 !important;" +
                "margin-bottom:4px !important;letter-spacing:0.02em !important;"
              );
              const org = sub.orgName || "Assembly";
              const profile = sub.profile?.displayName || "Citizen";
              const score = sub.trustScore != null ? sub.trustScore : "—";
              metaSpan.innerHTML = `⚖ <strong style="color:#1B2A4A !important">${escapeHtml(org)}</strong> · ${escapeHtml(profile)} · Trust Score ${score}`;

              wrapper.appendChild(origSpan);
              wrapper.appendChild(replSpan);
              wrapper.appendChild(metaSpan);
              if (sub.reasoning) {
                const reasonSpan = document.createElement("div");
                reasonSpan.className = "ta-inline-reasoning";
                reasonSpan.setAttribute("style",
                  "display:block !important;font-size:12px !important;color:#5A5650 !important;" +
                  "line-height:1.5 !important;font-style:italic !important;"
                );
                reasonSpan.textContent = sub.reasoning.length > 180
                  ? sub.reasoning.slice(0, 180) + "…" : sub.reasoning;
                wrapper.appendChild(reasonSpan);
              }

              // Walk up to escape constrained containers
              let insertTarget = parent;
              let insertParent = parent.parentNode;
              for (let i = 0; i < 5 && insertParent && insertParent !== document.body; i++) {
                const style = window.getComputedStyle(insertParent);
                const isConstrained = style.overflow === "hidden" || style.overflow === "clip"
                  || style.display === "flex" || style.display === "inline-flex"
                  || style.display === "grid" || style.display === "inline-grid";
                if (isConstrained) {
                  insertTarget = insertParent;
                  insertParent = insertParent.parentNode;
                } else {
                  break;
                }
              }

              insertParent.insertBefore(wrapper, insertTarget.nextSibling);
              parent.classList.add("ta-inline-headline-corrected");
              console.log("[TrustAssembly] Phase 2: injected via text-node match. wrapper.offsetHeight:", wrapper.offsetHeight);
            }
            break; // only match first occurrence
          }
        }
      }

      if (matched) {
        console.log("[TrustAssembly] ✓ Matched and applied correction for:", JSON.stringify(sub.originalHeadline.slice(0, 80)));
        replaceHeadlineAcrossDOM(sub.originalHeadline, sub.replacement);
      } else {
        console.log("[TrustAssembly] ✗ No match found for correction:", JSON.stringify(sub.originalHeadline.slice(0, 80)));
        unapplied.push(sub);
      }
    });

    // If corrections couldn't be matched to any element, inject them at
    // the top of the article body so they're always visible to the reader.
    if (unapplied.length > 0) {
      renderUnappliedCorrectionsBox(unapplied);
    }
  }

  // ── Unapplied Corrections Education Box ──
  // When corrections exist for a page but the original headline text can
  // no longer be found (headline was updated, site redesigned, etc.),
  // render an informational box at the top of the article body.
  function renderUnappliedCorrectionsBox(unapplied) {
    // Don't render duplicates
    if (document.getElementById("ta-unapplied-box")) return;

    const insertTarget = findArticleBody();

    const box = document.createElement("div");
    box.id = "ta-unapplied-box";
    box.className = "ta-unapplied-box";

    let html = `
      <div class="ta-unapplied-header">
        <span class="ta-unapplied-icon">⚖</span>
        <span class="ta-unapplied-title">Trust Assembly — Corrections No Longer Matched</span>
      </div>
      <div class="ta-unapplied-body">
        <p class="ta-unapplied-explanation">The following corrections were submitted for this article but the original headline text could no longer be found on the page. The headline may have been updated by the publisher.</p>
    `;

    unapplied.forEach(sub => {
      const org = sub.orgName || "Assembly";
      const profile = sub.profile?.displayName || "Citizen";
      const score = sub.trustScore != null ? sub.trustScore : "—";

      html += `
        <div class="ta-unapplied-item">
          <div class="ta-unapplied-original">${escapeHtml(sub.originalHeadline)}</div>
          <div class="ta-unapplied-arrow">↓ corrected to</div>
          <div class="ta-unapplied-replacement">${escapeHtml(sub.replacement)}</div>
          <div class="ta-unapplied-meta">⚖ <strong>${escapeHtml(org)}</strong> · ${escapeHtml(profile)} · Trust Score ${score}</div>
          ${sub.reasoning ? `<div class="ta-unapplied-reasoning">${escapeHtml(sub.reasoning)}</div>` : ""}
        </div>
      `;
    });

    html += `</div>`;
    box.innerHTML = html;

    // Insert at the top of the article body
    if (insertTarget.firstChild) {
      insertTarget.insertBefore(box, insertTarget.firstChild);
    } else {
      insertTarget.appendChild(box);
    }
  }

  // ── Trust Context Card ──
  // A compact summary card rendered below the headline giving the reader
  // an at-a-glance overview of all Trust Assembly activity on this article:
  // correction/affirmation counts, assembly involvement, consensus status,
  // and standing corrections, arguments, and beliefs from the vault.
  function renderTrustContextCard(data) {
    // Don't render duplicates
    if (document.getElementById("ta-context-card")) return;

    const corrections = data.corrections || [];
    const affirmations = data.affirmations || [];
    const translations = data.translations || [];
    const meta = data.meta || {};
    const total = corrections.length + affirmations.length;

    // Don't render if there's nothing to show
    if (total === 0 && translations.length === 0) return;

    // Try to insert after the headline; if that fails, insert at the
    // top of the article body. This ensures the card always renders.
    const headlineEl = findPrimaryHeadline();
    const articleBody = findArticleBody();
    if (!headlineEl && !articleBody) return;

    const card = document.createElement("div");
    card.id = "ta-context-card";
    card.className = "ta-context-card";

    // Gather unique assemblies involved
    const assemblies = new Map();
    [...corrections, ...affirmations].forEach(sub => {
      if (sub.orgName && sub.orgId) {
        if (!assemblies.has(sub.orgId)) {
          assemblies.set(sub.orgId, sub.orgName);
        }
      }
    });
    const assemblyNames = Array.from(assemblies.values());

    // Determine overall trust signal
    let signalClass, signalIcon, signalText;
    if (corrections.length > 0 && affirmations.length === 0) {
      signalClass = "ta-signal-corrected";
      signalIcon = "⚠";
      signalText = "Corrections Filed";
    } else if (affirmations.length > 0 && corrections.length === 0) {
      signalClass = "ta-signal-affirmed";
      signalIcon = "✓";
      signalText = "Headline Verified";
    } else if (corrections.length > 0 && affirmations.length > 0) {
      signalClass = "ta-signal-mixed";
      signalIcon = "⚖";
      signalText = "Mixed Reviews";
    } else {
      signalClass = "ta-signal-neutral";
      signalIcon = "⚖";
      signalText = "Community Reviewed";
    }

    if (meta.highestConsensus) {
      signalText += " · Consensus Reached";
    }

    let html = `
      <div class="ta-context-header">
        <span class="ta-context-signal ${signalClass}">${signalIcon} ${signalText}</span>
        <span class="ta-context-brand">Trust Assembly</span>
      </div>
      <div class="ta-context-body">
        <div class="ta-context-stats">
    `;

    if (corrections.length > 0) {
      html += `<span class="ta-context-stat ta-stat-correction">${corrections.length} correction${corrections.length !== 1 ? "s" : ""}</span>`;
    }
    if (affirmations.length > 0) {
      html += `<span class="ta-context-stat ta-stat-affirmation">${affirmations.length} affirmation${affirmations.length !== 1 ? "s" : ""}</span>`;
    }
    if (translations.length > 0) {
      html += `<span class="ta-context-stat ta-stat-translation">${translations.length} translation${translations.length !== 1 ? "s" : ""}</span>`;
    }

    html += `</div>`;

    // Assemblies involved
    if (assemblyNames.length > 0) {
      html += `<div class="ta-context-assemblies">Reviewed by: ${assemblyNames.map(n => `<strong>${escapeHtml(n)}</strong>`).join(", ")}</div>`;
    }

    html += `</div>`;

    // Vault sections container (populated async)
    html += `<div id="ta-context-vault"></div>`;

    card.innerHTML = html;

    // Insert after the headline if found, otherwise at top of article body
    if (headlineEl && headlineEl.parentNode) {
      headlineEl.parentNode.insertBefore(card, headlineEl.nextSibling);
    } else if (articleBody) {
      if (articleBody.firstChild) {
        articleBody.insertBefore(card, articleBody.firstChild);
      } else {
        articleBody.appendChild(card);
      }
    }

    // Fetch vault entries asynchronously (standing corrections, arguments, beliefs)
    fetchAndRenderVaultEntries(assemblyNames.length > 0 ? assemblies : null);
  }

  // ── Fetch and render vault entries ──
  // Standing corrections, arguments, and foundational beliefs from
  // assemblies that have reviewed this article. These are not URL-specific
  // but provide broader context about the assemblies' positions.
  async function fetchAndRenderVaultEntries(assemblies) {
    const vaultContainer = document.getElementById("ta-context-vault");
    if (!vaultContainer) return;

    // If no assemblies involved, skip vault fetch
    if (!assemblies || assemblies.size === 0) return;

    const orgIds = Array.from(assemblies.keys()).join(",");

    try {
      // Fetch all three vault types in parallel
      const [vaultRes, argsRes, beliefsRes] = await Promise.all([
        fetch(`${TA_API_BASE}/api/vault?type=vault&orgIds=${encodeURIComponent(orgIds)}&status=approved&limit=5`),
        fetch(`${TA_API_BASE}/api/vault?type=argument&orgIds=${encodeURIComponent(orgIds)}&status=approved&limit=5`),
        fetch(`${TA_API_BASE}/api/vault?type=belief&orgIds=${encodeURIComponent(orgIds)}&status=approved&limit=5`),
      ]);

      const [vaultData, argsData, beliefsData] = await Promise.all([
        vaultRes.ok ? vaultRes.json() : { entries: [] },
        argsRes.ok ? argsRes.json() : { entries: [] },
        beliefsRes.ok ? beliefsRes.json() : { entries: [] },
      ]);

      const vault = vaultData.entries || [];
      const args = argsData.entries || [];
      const beliefs = beliefsData.entries || [];

      if (vault.length === 0 && args.length === 0 && beliefs.length === 0) return;

      let html = `<div class="ta-context-vault-inner">`;

      // Standing Corrections
      if (vault.length > 0) {
        html += `<div class="ta-vault-section">`;
        html += `<div class="ta-vault-section-title">Standing Corrections</div>`;
        vault.forEach(entry => {
          html += `
            <div class="ta-vault-entry ta-vault-correction">
              <div class="ta-vault-assertion">${escapeHtml(entry.assertion)}</div>
              <div class="ta-vault-meta">${escapeHtml(entry.org_name)} · Survived ${entry.survival_count || 0} challenge${(entry.survival_count || 0) !== 1 ? "s" : ""}</div>
            </div>
          `;
        });
        html += `</div>`;
      }

      // Active Arguments
      if (args.length > 0) {
        html += `<div class="ta-vault-section">`;
        html += `<div class="ta-vault-section-title">Active Arguments</div>`;
        args.forEach(entry => {
          html += `
            <div class="ta-vault-entry ta-vault-argument">
              <div class="ta-vault-content">${escapeHtml(entry.content)}</div>
              <div class="ta-vault-meta">${escapeHtml(entry.org_name)} · Survived ${entry.survival_count || 0} challenge${(entry.survival_count || 0) !== 1 ? "s" : ""}</div>
            </div>
          `;
        });
        html += `</div>`;
      }

      // Foundational Beliefs
      if (beliefs.length > 0) {
        html += `<div class="ta-vault-section">`;
        html += `<div class="ta-vault-section-title">Foundational Beliefs</div>`;
        beliefs.forEach(entry => {
          html += `
            <div class="ta-vault-entry ta-vault-belief">
              <div class="ta-vault-content">${escapeHtml(entry.content)}</div>
              <div class="ta-vault-meta">${escapeHtml(entry.org_name)}</div>
            </div>
          `;
        });
        html += `</div>`;
      }

      html += `</div>`;
      vaultContainer.innerHTML = html;

    } catch (e) {
      // Vault fetch failed — not critical, just skip
      console.warn("[TrustAssembly] Could not fetch vault entries:", e.message);
    }
  }

  // API base URL for vault fetches (reuse from api-client.js)
  const TA_API_BASE = "https://trustassembly.org";

  // ── DOM-wide headline text replacement ──
  // Replaces a headline string everywhere it appears beyond just visible
  // heading elements: <title>, <meta> tags (og:title, twitter:title),
  // data-headline attributes, aria-labels, JSON-LD, etc.
  function replaceHeadlineAcrossDOM(original, replacement) {
    if (!original || !replacement) return;

    const normalizedOriginal = original.replace(/\s+/g, " ").trim().toLowerCase();

    function containsHeadline(text) {
      return text.replace(/\s+/g, " ").trim().toLowerCase().includes(normalizedOriginal);
    }

    // Build a whitespace-flexible regex for replacement
    function makeFlexRegex() {
      const escaped = original
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\s+/g, "\\s+");
      return new RegExp(escaped, "gi");
    }

    function replaceIn(text) {
      if (text.includes(original)) {
        return text.split(original).join(replacement);
      }
      return text.replace(makeFlexRegex(), replacement);
    }

    // 1. <title> tag
    const titleEl = document.querySelector("title");
    if (titleEl && titleEl.textContent && containsHeadline(titleEl.textContent)) {
      titleEl.textContent = replaceIn(titleEl.textContent);
    }

    // 2. Meta tags (og:title, twitter:title, etc.)
    const metaSelectors = [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]',
      'meta[property="title"]',
    ];
    metaSelectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (el && el.content && containsHeadline(el.content)) {
        el.content = replaceIn(el.content);
      }
    });

    // 3. data-headline, data-title, aria-label attributes on any element
    const attrNames = ["data-headline", "data-title", "aria-label", "title"];
    attrNames.forEach(attr => {
      document.querySelectorAll("[" + attr + "]").forEach(el => {
        // Skip our own injected elements
        if (el.closest("[class^='ta-inline'], [class^='ta-ext']")) return;
        const val = el.getAttribute(attr);
        if (val && containsHeadline(val)) {
          el.setAttribute(attr, replaceIn(val));
        }
      });
    });

    // 4. JSON-LD / Schema.org script blocks
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      if (script.textContent && containsHeadline(script.textContent)) {
        script.textContent = replaceIn(script.textContent);
      }
    });
  }

  // ── Apply Affirmations Inline on Headlines ──
  function applyInlineAffirmations(affirmations) {
    if (!affirmations || affirmations.length === 0) return;

    const headlineEls = findAllHeadlineElements();
    const articleBody = findArticleBody();

    affirmations.forEach(sub => {
      if (!sub.originalHeadline) return;
      let matched = false;

      // Phase 1: Match against headline elements
      headlineEls.forEach(el => {
        if (el.dataset.taAnnotated) {
          const annotationExists = el.nextElementSibling?.classList.contains("ta-inline-affirmation")
            || el.parentNode?.querySelector(".ta-inline-affirmation")
            || document.querySelector(".ta-inline-affirmation");
          if (annotationExists) return;
          delete el.dataset.taAnnotated;
          el.classList.remove("ta-inline-headline-affirmed");
        }
        if (!headlinesMatch(el.textContent, sub.originalHeadline)) return;

        matched = true;
        el.dataset.taAnnotated = "true";

        const wrapper = document.createElement("div");
        wrapper.className = "ta-inline-affirmation";
        wrapper.setAttribute("style",
          "display:block !important;visibility:visible !important;opacity:1 !important;" +
          "overflow:visible !important;max-height:none !important;height:auto !important;" +
          "position:relative !important;z-index:10000 !important;" +
          "margin:8px 0 16px !important;padding:10px 16px !important;" +
          "border-left:4px solid #1B5E3F !important;background:#F5FAF7 !important;" +
          "border-radius:0 4px 4px 0 !important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif !important;" +
          "width:auto !important;min-height:30px !important;float:none !important;clear:both !important;" +
          "clip:auto !important;clip-path:none !important;transform:none !important;"
        );

        const metaSpan = document.createElement("div");
        metaSpan.className = "ta-inline-meta";
        metaSpan.setAttribute("style",
          "display:block !important;font-size:11px !important;color:#7A7570 !important;" +
          "margin-bottom:4px !important;letter-spacing:0.02em !important;"
        );
        const org = sub.orgName || "Assembly";
        const profile = sub.profile?.displayName || "Citizen";
        const score = sub.trustScore != null ? sub.trustScore : "—";
        metaSpan.innerHTML = `✓ Verified by <strong style="color:#1B2A4A !important">${escapeHtml(org)}</strong> · ${escapeHtml(profile)} · Trust Score ${score}`;

        wrapper.appendChild(metaSpan);

        if (sub.reasoning) {
          const reasonSpan = document.createElement("div");
          reasonSpan.className = "ta-inline-reasoning";
          reasonSpan.setAttribute("style",
            "display:block !important;font-size:12px !important;color:#5A5650 !important;" +
            "line-height:1.5 !important;font-style:italic !important;"
          );
          const maxLen = 180;
          reasonSpan.textContent = sub.reasoning.length > maxLen
            ? sub.reasoning.slice(0, maxLen) + "…"
            : sub.reasoning;
          wrapper.appendChild(reasonSpan);
        }

        // Walk up to escape constrained layout containers
        let insertTarget = el;
        let insertParent = el.parentNode;
        for (let i = 0; i < 5 && insertParent && insertParent !== document.body; i++) {
          const style = window.getComputedStyle(insertParent);
          const isConstrained = style.overflow === "hidden" || style.overflow === "clip"
            || style.display === "flex" || style.display === "inline-flex"
            || style.display === "grid" || style.display === "inline-grid";
          if (isConstrained) {
            insertTarget = insertParent;
            insertParent = insertParent.parentNode;
          } else {
            break;
          }
        }

        insertParent.insertBefore(wrapper, insertTarget.nextSibling);
        el.classList.add("ta-inline-headline-affirmed");
      });

      // Phase 2: Text-node fallback for non-standard elements
      if (!matched) {
        const searchRoot = articleBody || document.body;
        const walker = document.createTreeWalker(searchRoot, NodeFilter.SHOW_TEXT, null, false);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent || node.textContent.trim().length < 10) continue;
          if (node.parentNode.closest && node.parentNode.closest("[class^='ta-inline'], [class^='ta-ext'], [id^='ta-']")) continue;
          if (headlinesMatch(node.textContent, sub.originalHeadline)) {
            const parent = node.parentElement;
            if (parent && !parent.dataset.taAnnotated) {
              parent.dataset.taAnnotated = "true";
              const wrapper = document.createElement("div");
              wrapper.className = "ta-inline-affirmation";
              wrapper.setAttribute("style",
                "display:block !important;visibility:visible !important;opacity:1 !important;" +
                "overflow:visible !important;max-height:none !important;height:auto !important;" +
                "position:relative !important;z-index:10000 !important;" +
                "margin:8px 0 16px !important;padding:10px 16px !important;" +
                "border-left:4px solid #1B5E3F !important;background:#F5FAF7 !important;" +
                "border-radius:0 4px 4px 0 !important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif !important;" +
                "width:auto !important;min-height:30px !important;float:none !important;clear:both !important;"
              );
              const metaSpan = document.createElement("div");
              metaSpan.className = "ta-inline-meta";
              metaSpan.setAttribute("style",
                "display:block !important;font-size:11px !important;color:#7A7570 !important;"
              );
              const org = sub.orgName || "Assembly";
              const profile = sub.profile?.displayName || "Citizen";
              const score = sub.trustScore != null ? sub.trustScore : "—";
              metaSpan.innerHTML = `✓ Verified by <strong style="color:#1B2A4A !important">${escapeHtml(org)}</strong> · ${escapeHtml(profile)} · Trust Score ${score}`;
              wrapper.appendChild(metaSpan);
              if (sub.reasoning) {
                const reasonSpan = document.createElement("div");
                reasonSpan.className = "ta-inline-reasoning";
                reasonSpan.setAttribute("style",
                  "display:block !important;font-size:12px !important;color:#5A5650 !important;" +
                  "line-height:1.5 !important;font-style:italic !important;"
                );
                reasonSpan.textContent = sub.reasoning.length > 180
                  ? sub.reasoning.slice(0, 180) + "…" : sub.reasoning;
                wrapper.appendChild(reasonSpan);
              }
              // Walk up to escape constrained containers
              let insertTarget = parent;
              let insertParent = parent.parentNode;
              for (let i = 0; i < 5 && insertParent && insertParent !== document.body; i++) {
                const style = window.getComputedStyle(insertParent);
                const isConstrained = style.overflow === "hidden" || style.overflow === "clip"
                  || style.display === "flex" || style.display === "inline-flex"
                  || style.display === "grid" || style.display === "inline-grid";
                if (isConstrained) {
                  insertTarget = insertParent;
                  insertParent = insertParent.parentNode;
                } else {
                  break;
                }
              }
              insertParent.insertBefore(wrapper, insertTarget.nextSibling);
              parent.classList.add("ta-inline-headline-affirmed");
            }
            break;
          }
        }
      }
    });
  }

  // ── Find elements on the page whose text matches a correction headline ──
  // Uses branching site-type detection to pick the best selectors first,
  // then falls back to a broad global sweep. This tree structure ensures
  // CNN, NYT, WaPo, Fox, BBC, WordPress, etc. all get targeted treatment
  // while unknown sites still get comprehensive coverage.
  function findAllHeadlineElements() {
    // Areas to never search inside
    const EXCLUDE_SELECTORS = [
      "nav", "footer", "header nav", "aside",
      "[role='navigation']", "[role='banner']", "[role='contentinfo']",
      ".sidebar", ".nav", ".footer", ".menu", ".breadcrumb", ".pagination",
      ".social-share", ".related-articles", ".comments", ".ad", ".advertisement",
      "script", "style", "noscript", "iframe", "svg",
      "[class^='ta-inline']", "[class^='ta-ext']", "[id^='ta-']", // our own injections
    ];

    const excludeSelector = EXCLUDE_SELECTORS.join(", ");

    function isValid(el) {
      if (!el || !el.textContent.trim()) return false;
      try { return !el.closest(excludeSelector); } catch (e) { return true; }
    }

    const found = new Set();
    const site = getSiteType();

    // ── Phase 1: Site-specific selectors (highest confidence) ──
    // The site-type detection tree gives us selectors ranked for this CMS.
    for (const selector of site.headlineSelectors) {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (isValid(el)) found.add(el);
        });
      } catch (e) { /* invalid selector, skip */ }
    }

    // ── Phase 2: CMS / framework attribute selectors ──
    // These catch headlines via semantic markup that many CMSes emit,
    // regardless of class naming conventions.
    const cmsSelectors = [
      '[data-editable="headlineText"]', '[data-editable="headline"]',
      '[data-testid="headline"]', '[data-testid="Heading"]',
      '[data-qa="headline"]', '[itemprop="headline"]',
      '[data-type="headline"]', '[data-component="headline"]',
      '[data-analytics-headline]', '[data-headline]',
      '[property="headline"]',
      'h1[data-editable]', 'h1[data-testid]', 'h1[data-qa]',
    ];
    for (const selector of cmsSelectors) {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (isValid(el) && !found.has(el)) found.add(el);
        });
      } catch (e) {}
    }

    // ── Phase 3: Class-name heuristics (medium confidence) ──
    // Walk elements that have "headline" in their class but aren't h-tags.
    // This catches <span class="headline__text">, <div class="pg-headline">, etc.
    if (found.size === 0) {
      const classSelectors = [
        '[class*="headline" i]', '[class*="article-title" i]',
        '[class*="story-title" i]', '[class*="post-title" i]',
        '[class*="entry-title" i]',
      ];
      for (const selector of classSelectors) {
        try {
          document.querySelectorAll(selector).forEach(el => {
            if (isValid(el) && !found.has(el)) found.add(el);
          });
        } catch (e) {}
      }
    }

    // ── Phase 4: Global heading sweep (lower confidence) ──
    // Catch everything that could be a headline via standard heading tags
    // and ARIA roles.
    const globalSelectors = [
      "h1", "h2", "h3",
      "[role='heading'][aria-level='1']",
      "[class*='heading']",
    ].join(", ");
    try {
      document.querySelectorAll(globalSelectors).forEach(el => {
        if (isValid(el) && !found.has(el)) found.add(el);
      });
    } catch (e) {}

    // ── Phase 5: Deep text-content fallback ──
    // If we still found nothing, try broad selectors including h4-h6
    // and any element marked as a title.
    if (found.size === 0) {
      try {
        document.querySelectorAll("h4, h5, h6, [class*='title']").forEach(el => {
          if (isValid(el) && !found.has(el)) found.add(el);
        });
      } catch (e) {}
    }

    return Array.from(found);
  }

  // ── Apply Inline Edits to Body Text ──
  function applyInlineEdits(corrections) {
    if (!corrections || corrections.length === 0) return;

    // Collect all approved inline edits across all corrections
    const edits = [];
    corrections.forEach(sub => {
      if (!sub.inlineEdits || sub.inlineEdits.length === 0) return;
      sub.inlineEdits.forEach(edit => {
        if (!edit.original || !edit.replacement) return;
        edits.push({
          original: edit.original,
          replacement: edit.replacement,
          reasoning: edit.reasoning,
          orgName: sub.orgName || "Assembly",
          profile: sub.profile?.displayName || "Citizen",
          trustScore: sub.trustScore,
        });
      });
    });

    if (edits.length === 0) return;

    // Limit search to article body to avoid modifying nav, headers, footers
    const articleRoot = findArticleBody();

    const walker = document.createTreeWalker(
      articleRoot, NodeFilter.SHOW_TEXT, null, false
    );

    const textNodes = [];
    while (walker.nextNode()) {
      // Skip nodes inside our own injected elements
      if (walker.currentNode.parentNode.closest &&
          walker.currentNode.parentNode.closest("[class^='ta-inline'], [class^='ta-ext']")) continue;
      textNodes.push(walker.currentNode);
    }

    edits.forEach(edit => {
      const originalText = edit.original;

      textNodes.forEach(textNode => {
        // Skip already-processed nodes
        if (!textNode.parentNode) return;

        const idx = textNode.nodeValue.indexOf(originalText);
        if (idx === -1) return;

        // Split the text node around the match
        const before = textNode.nodeValue.slice(0, idx);
        const after = textNode.nodeValue.slice(idx + originalText.length);

        // Create the annotated replacement
        const wrapper = document.createElement("span");
        wrapper.className = "ta-inline-body-edit";

        // Original text with strikethrough
        const origSpan = document.createElement("span");
        origSpan.className = "ta-inline-body-original";
        origSpan.textContent = originalText;

        // Replacement text
        const replSpan = document.createElement("span");
        replSpan.className = "ta-inline-body-replacement";
        replSpan.textContent = edit.replacement;

        // Tooltip with details
        const tooltip = document.createElement("span");
        tooltip.className = "ta-inline-body-tooltip";
        const score = edit.trustScore != null ? edit.trustScore : "—";
        let tooltipHtml = `<strong>⚖ ${escapeHtml(edit.orgName)}</strong> · ${escapeHtml(edit.profile)} · Trust Score ${score}`;
        if (edit.reasoning) {
          tooltipHtml += `<br><em>${escapeHtml(edit.reasoning)}</em>`;
        }
        tooltip.innerHTML = tooltipHtml;

        wrapper.appendChild(origSpan);
        wrapper.appendChild(replSpan);
        wrapper.appendChild(tooltip);

        // Rebuild the text around the annotation
        const container = document.createDocumentFragment();
        if (before) container.appendChild(document.createTextNode(before));
        container.appendChild(wrapper);
        if (after) container.appendChild(document.createTextNode(after));

        textNode.parentNode.replaceChild(container, textNode);
      });
    });
  }

  // ── Apply Translations Inline ──
  function applyTranslations(translations) {
    if (!translations || translations.length === 0) return;

    const walker = document.createTreeWalker(
      document.body, NodeFilter.SHOW_TEXT, null, false
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(textNode => {
      let text = textNode.nodeValue;
      let changed = false;

      translations.forEach(t => {
        if (!t.original || !t.translated) return;
        // Case-insensitive match
        const regex = new RegExp(`\\b${escapeRegex(t.original)}\\b`, "gi");
        if (regex.test(text)) {
          changed = true;
          const typeClass = `ta-ext-trans-${t.type || "clarity"}`;
          // We can't insert HTML into a text node directly,
          // so we'll mark it for replacement
          text = text.replace(regex, (match) =>
            `\u200B${match}\u200B` // zero-width space markers
          );
        }
      });

      if (changed) {
        // Replace text node with span containing annotated text
        const span = document.createElement("span");
        let html = textNode.nodeValue;

        translations.forEach(t => {
          if (!t.original || !t.translated) return;
          const regex = new RegExp(`\\b${escapeRegex(t.original)}\\b`, "gi");
          const typeColors = {
            clarity: COLORS.teal, propaganda: COLORS.orange,
            euphemism: COLORS.red, satirical: COLORS.purple
          };
          const color = typeColors[t.type] || COLORS.orange;
          html = html.replace(regex, (match) =>
            `<span class="ta-ext-translated" style="border-bottom:2px dotted ${color}" title="TA Translation (${t.type}): ${escapeHtml(t.translated)}">${match}<sup style="font-size:9px;color:${color};font-weight:700;cursor:help" title="${escapeHtml(t.translated)}">ᵀᴬ</sup></span>`
          );
        });

        if (html !== textNode.nodeValue) {
          span.innerHTML = html;
          textNode.parentNode.replaceChild(span, textNode);
        }
      }
    });
  }

  // ── Utilities ──
  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function formatStatus(status) {
    const labels = {
      approved: "Approved", consensus: "Consensus",
      cross_review: "Cross-Group Review", pending_review: "Under Review",
      rejected: "Rejected", upheld: "Dispute Upheld"
    };
    return labels[status] || status || "Approved";
  }

  // ── Listen for headline request from popup ──
  function listenForHeadlineRequest() {
    const runtime = (typeof chrome !== "undefined" && chrome.runtime) ? chrome.runtime
      : (typeof browser !== "undefined" && browser.runtime) ? browser.runtime : null;
    if (!runtime) return;

    runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "TA_GET_HEADLINE") {
        const headline = detectHeadline();
        sendResponse({ headline: headline || "" });
        return true; // keep channel open for async response
      }
    });
  }

  // ── MutationObserver for dynamic content (SPAs, feeds) ──
  // Watches for new DOM nodes and re-applies corrections, affirmations,
  // and translations to dynamically loaded content. This is critical for
  // sites like Twitter and Facebook where feed items load as you scroll.
  let taObserver = null;

  function startObserver(data) {
    if (taObserver) return; // already running

    // Debounce: batch mutations together so we don't re-scan on every
    // single node insertion (Twitter can add hundreds per scroll).
    let pending = false;

    taObserver = new MutationObserver((mutations) => {
      // Quick check: do any mutations contain meaningful added nodes?
      let hasNewContent = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            // Ignore our own injected elements
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = /** @type {Element} */ (node);
              const cls = el.className || "";
              if (typeof cls === "string" && (cls.startsWith("ta-inline") || cls.startsWith("ta-ext"))) continue;
            }
            hasNewContent = true;
            break;
          }
        }
        if (hasNewContent) break;
      }

      if (!hasNewContent || pending) return;
      pending = true;

      // Use requestIdleCallback (or setTimeout fallback) to batch work
      const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));
      schedule(() => {
        pending = false;
        reapplyToNewContent(data);
      });
    });

    taObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function reapplyToNewContent(data) {
    // Re-run corrections on any un-annotated headline elements
    if (data.corrections.length > 0) {
      applyInlineCorrections(data.corrections);
      applyInlineEdits(data.corrections);
    }
    if (data.affirmations.length > 0) {
      applyInlineAffirmations(data.affirmations);
    }
    if (settings.showTranslations && data.translations.length > 0) {
      applyTranslations(data.translations);
    }
  }

  // ── Detect headline from page ──
  // Uses the site-type branching tree to pick the best selectors,
  // then falls back through CMS attributes, og:title, and page title.
  function detectHeadline() {
    const site = getSiteType();

    // Phase 1: Site-specific selectors (most reliable for this CMS)
    for (const selector of site.headlineSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim().length > 5) {
          return el.textContent.trim();
        }
      } catch (e) {}
    }

    // Phase 2: CMS / framework attribute selectors
    const cmsSelectors = [
      '[data-editable="headlineText"]', '[data-editable="headline"]',
      '[data-testid="headline"]', '[data-testid="Heading"]',
      '[data-qa="headline"]', '[itemprop="headline"]',
    ];
    for (const selector of cmsSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim().length > 5) {
          return el.textContent.trim();
        }
      } catch (e) {}
    }

    // Phase 3: og:title meta tag (very common on news sites)
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.getAttribute("content")) {
      // Strip common suffixes like " | CNN", " - The New York Times"
      const raw = ogTitle.getAttribute("content").trim();
      const cleaned = raw.replace(/\s*[|\-–—]\s*[^|\-–—]+$/, "").trim();
      if (cleaned.length > 5) return cleaned;
      if (raw.length > 5) return raw;
    }

    // Phase 4: twitter:title
    const twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle && twTitle.getAttribute("content")?.trim().length > 5) {
      return twTitle.getAttribute("content").trim();
    }

    // Phase 5: Schema.org / JSON-LD headline
    try {
      const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of ldScripts) {
        const data = JSON.parse(script.textContent);
        const headline = data.headline || (Array.isArray(data) ? data[0]?.headline : null);
        if (headline && headline.trim().length > 5) return headline.trim();
      }
    } catch (e) {}

    // Phase 6: Fall back to first h1 on the page
    const h1 = document.querySelector("h1");
    if (h1 && h1.textContent.trim().length > 5) {
      return h1.textContent.trim();
    }

    // Last resort: page title
    return document.title || "";
  }

  // ── Start ──
  listenForHeadlineRequest();
  listenForSettingsChanges();
  listenForStorageChanges();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

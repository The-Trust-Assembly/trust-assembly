/**
 * Trust Assembly Extension — Site Compatibility Test Scripts
 *
 * HOW TO USE:
 * 1. Install the Trust Assembly extension (load unpacked from extensions/chrome/)
 * 2. Log in as admin in the extension popup
 * 3. Navigate to a test site URL
 * 4. Open Chrome DevTools (F12) → Console tab
 * 5. Paste the relevant test script and press Enter
 * 6. Review the report output and visual results on the page
 *
 * These scripts use chrome.runtime.sendMessage to communicate with the
 * content script's Design Mode handlers (TA_DESIGN_INJECT, TA_DESIGN_REPORT, etc.)
 *
 * For automated batch testing, use the Full Batch Test at the bottom.
 */

// ============================================================
// MOCK DATA — Used by all test scripts
// ============================================================
const TA_TEST_MOCK = {
  corrections: [{
    id: "test-c1",
    orgName: "The General Public",
    orgId: "org-test-1",
    originalHeadline: "", // Will be auto-filled from the page
    replacement: "TEST CORRECTION: This Headline Has Been Corrected by Trust Assembly",
    reasoning: "This is a test injection from the Extension Design Mode. The original headline was replaced to verify the extension renders correctly on this site.",
    author: "Test Author",
    status: "approved",
    trustScore: 72,
    profile: { displayName: "ExtensionTester" },
    evidence: [{ url: "https://trustassembly.org/test", explanation: "Test evidence" }],
    inlineEdits: [
      {
        original: "the", // Common word — will match on most pages
        replacement: "[TA-CORRECTED]",
        reasoning: "Test inline edit to verify body text replacement works",
      },
    ],
  }],
  affirmations: [{
    id: "test-a1",
    orgName: "Fact Checkers United",
    orgId: "org-test-2",
    originalHeadline: "", // Will be auto-filled
    reasoning: "Test affirmation — this headline has been verified.",
    status: "approved",
    trustScore: 88,
    profile: { displayName: "VerifyBot" },
  }],
  translations: [
    { id: "tt1", original: "said", translated: "claimed without evidence", type: "clarity", orgName: "The General Public" },
    { id: "tt2", original: "investment", translated: "budget reallocation", type: "propaganda", orgName: "The General Public" },
  ],
  meta: {},
};

// ============================================================
// HELPER: Send a message to the content script on the active tab
// ============================================================
async function taSend(msg) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { resolve({ error: "No active tab" }); return; }
      chrome.tabs.sendMessage(tabs[0].id, msg, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    });
  });
}

// ============================================================
// TEST 1: Quick Inject — Inject mock data and see what happens
// ============================================================
async function taTestInject() {
  console.log("🔶 [TA Test] Injecting mock data...");
  const result = await taSend({ type: "TA_DESIGN_INJECT", data: TA_TEST_MOCK });
  console.log("🔶 [TA Test] Inject result:", result);
  return result;
}

// ============================================================
// TEST 2: Quick Clear — Remove all injections
// ============================================================
async function taTestClear() {
  console.log("🔶 [TA Test] Clearing all injections...");
  const result = await taSend({ type: "TA_DESIGN_CLEAR" });
  console.log("🔶 [TA Test] Clear result:", result);
  return result;
}

// ============================================================
// TEST 3: Scan Headlines — Find all headline candidates
// ============================================================
async function taTestScan() {
  console.log("🔶 [TA Test] Scanning for headlines...");
  const result = await taSend({ type: "TA_DESIGN_SCAN_HEADLINES" });
  if (result && result.headlines) {
    console.log(`🔶 [TA Test] Found ${result.headlines.length} headline(s):`);
    result.headlines.forEach((h, i) => {
      console.log(`  [${i}] <${h.tag}> ${h.selector} — "${h.text.slice(0, 80)}${h.text.length > 80 ? "..." : ""}"`);
    });
  } else {
    console.warn("🔶 [TA Test] No headlines found or content script not responding");
  }
  return result;
}

// ============================================================
// TEST 4: Full Report — Generate debug report
// ============================================================
async function taTestReport() {
  console.log("🔶 [TA Test] Generating report...");
  const result = await taSend({ type: "TA_DESIGN_REPORT" });
  if (result && result.report) {
    console.log(result.report);
  } else {
    console.warn("🔶 [TA Test] Could not generate report");
  }
  return result;
}

// ============================================================
// TEST 5: Full Test — Inject + wait + report + score
// ============================================================
async function taTestFull() {
  const url = window.location?.href || "(unknown — run from popup context)";
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TA EXTENSION TEST — ${url}`);
  console.log(`${"=".repeat(60)}`);

  // Step 1: Clear previous
  await taSend({ type: "TA_DESIGN_CLEAR" });

  // Step 2: Scan headlines first
  console.log("\n--- Step 1: Headline Scan ---");
  const scan = await taSend({ type: "TA_DESIGN_SCAN_HEADLINES" });
  const headlineCount = scan?.headlines?.length || 0;
  console.log(`Headlines found: ${headlineCount}`);
  if (scan?.headlines) {
    scan.headlines.forEach((h, i) => {
      console.log(`  [${i}] <${h.tag}> ${h.selector} — "${h.text.slice(0, 60)}..."`);
    });
  }

  // Step 3: Inject mock data
  console.log("\n--- Step 2: Mock Data Injection ---");
  const inject = await taSend({ type: "TA_DESIGN_INJECT", data: TA_TEST_MOCK });
  console.log("Inject result:", inject?.ok ? "SUCCESS" : "FAILED", inject);

  // Step 4: Wait for rendering
  await new Promise(r => setTimeout(r, 2000));

  // Step 5: Generate report
  console.log("\n--- Step 3: Post-Injection Report ---");
  const report = await taSend({ type: "TA_DESIGN_REPORT" });

  if (report?.report) {
    // Parse key metrics from report
    const r = report.report;
    const siteType = r.match(/Detected type: (.+)/)?.[1] || "unknown";
    const headlinesInReport = r.match(/Headlines Found: (\d+)/)?.[1] || "0";
    const contextCard = r.includes("Context card: YES");
    const unapplied = r.includes("Unapplied box: YES");
    const badge = r.includes("Floating badge: YES");
    const corrected = r.match(/Corrected headlines: (\d+)/)?.[1] || "0";
    const affirmed = r.match(/Affirmed headlines: (\d+)/)?.[1] || "0";
    const bodyEdits = r.match(/Body edits: (\d+)/)?.[1] || "0";
    const translations = r.match(/Translations: (\d+)/)?.[1] || "0";

    // Score
    let score = 0;
    let maxScore = 5;
    const checks = [];

    if (parseInt(headlinesInReport) > 0) { score++; checks.push("✅ Headlines detected"); }
    else { checks.push("❌ No headlines detected"); }

    if (contextCard || unapplied) { score++; checks.push("✅ Context card or unapplied box rendered"); }
    else { checks.push("❌ No context card or unapplied box"); }

    if (badge) { score++; checks.push("✅ Floating badge visible"); }
    else { checks.push("❌ No floating badge"); }

    if (parseInt(corrected) > 0 || parseInt(affirmed) > 0) { score++; checks.push(`✅ Headline annotations applied (${corrected} corrected, ${affirmed} affirmed)`); }
    else { checks.push("❌ No headline annotations applied"); }

    if (parseInt(bodyEdits) > 0 || parseInt(translations) > 0) { score++; checks.push(`✅ Body modifications applied (${bodyEdits} edits, ${translations} translations)`); }
    else { checks.push("⚠️ No body edits or translations (may be expected on some sites)"); }

    console.log(`\n--- RESULTS ---`);
    console.log(`Site Type: ${siteType}`);
    console.log(`Score: ${score}/${maxScore}`);
    checks.forEach(c => console.log(`  ${c}`));

    return {
      url,
      siteType,
      score,
      maxScore,
      headlineCount: parseInt(headlinesInReport),
      contextCard,
      unapplied,
      badge,
      correctedHeadlines: parseInt(corrected),
      affirmedHeadlines: parseInt(affirmed),
      bodyEdits: parseInt(bodyEdits),
      translations: parseInt(translations),
      checks,
      fullReport: r,
    };
  } else {
    console.error("❌ Could not generate report — content script may not be loaded");
    return { url, error: "No report", score: 0, maxScore: 5 };
  }
}

// ============================================================
// TOP 100 SITES — Organized by category
// ============================================================
const TA_TEST_SITES = {
  // --- News (Primary target) ---
  news: [
    "https://www.cnn.com",
    "https://www.nytimes.com",
    "https://www.washingtonpost.com",
    "https://www.foxnews.com",
    "https://www.bbc.com/news",
    "https://www.reuters.com",
    "https://apnews.com",
    "https://www.npr.org",
    "https://www.msnbc.com",
    "https://www.nbcnews.com",
    "https://www.theguardian.com/us",
    "https://www.wsj.com",
    "https://www.bloomberg.com",
    "https://www.politico.com",
    "https://thehill.com",
    "https://www.axios.com",
    "https://www.usatoday.com",
    "https://www.newsweek.com",
    "https://www.aljazeera.com",
    "https://www.dailymail.co.uk",
    "https://nypost.com",
    "https://www.huffpost.com",
    "https://www.cbsnews.com",
    "https://abcnews.go.com",
    "https://www.pbs.org/newshour",
  ],
  // --- Vox Media / Tech News ---
  tech_media: [
    "https://www.theverge.com",
    "https://www.vox.com",
    "https://arstechnica.com",
    "https://www.wired.com",
    "https://techcrunch.com",
    "https://www.thedailybeast.com",
    "https://slate.com",
    "https://www.theatlantic.com",
    "https://www.salon.com",
    "https://theintercept.com",
  ],
  // --- Social Media ---
  social: [
    "https://x.com",
    "https://www.reddit.com",
    "https://www.facebook.com",
    "https://www.instagram.com",
    "https://www.tiktok.com",
    "https://www.linkedin.com",
    "https://www.threads.net",
  ],
  // --- Video / Audio ---
  video_audio: [
    "https://www.youtube.com",
    "https://open.spotify.com",
    "https://www.twitch.tv",
    "https://podcasts.apple.com",
  ],
  // --- Substack / Newsletter ---
  newsletters: [
    "https://substack.com",
    "https://www.slowboring.com",      // Substack
    "https://popularinformation.substack.com",
    "https://heathercoxrichardson.substack.com",
  ],
  // --- Blog / CMS platforms ---
  blogs: [
    "https://medium.com",
    "https://www.tumblr.com",
    "https://wordpress.com",
    "https://www.blogger.com",
  ],
  // --- E-commerce / Products ---
  products: [
    "https://www.amazon.com",
    "https://www.ebay.com",
    "https://www.walmart.com",
    "https://www.target.com",
    "https://www.etsy.com",
    "https://www.bestbuy.com",
  ],
  // --- International News ---
  international: [
    "https://www.spiegel.de/international",
    "https://www.lemonde.fr/en",
    "https://www.scmp.com",
    "https://www.japantimes.co.jp",
    "https://timesofindia.indiatimes.com",
    "https://www.rt.com",
    "https://www.france24.com/en",
  ],
  // --- Government / Institutional ---
  government: [
    "https://www.whitehouse.gov",
    "https://www.congress.gov",
    "https://www.who.int",
    "https://www.state.gov",
  ],
  // --- Wikipedia / Reference ---
  reference: [
    "https://en.wikipedia.org",
    "https://www.britannica.com",
    "https://www.snopes.com",
    "https://www.politifact.com",
    "https://www.factcheck.org",
  ],
  // --- Finance ---
  finance: [
    "https://finance.yahoo.com",
    "https://www.cnbc.com",
    "https://www.marketwatch.com",
    "https://www.fool.com",
    "https://www.investopedia.com",
  ],
  // --- Sports ---
  sports: [
    "https://www.espn.com",
    "https://www.nfl.com",
    "https://www.nba.com",
    "https://theathletic.com",
  ],
  // --- Health / Science ---
  health_science: [
    "https://www.webmd.com",
    "https://www.mayoclinic.org",
    "https://www.scientificamerican.com",
    "https://www.nature.com",
    "https://www.livescience.com",
  ],
};

// Flatten to a single list
const TA_ALL_TEST_URLS = Object.values(TA_TEST_SITES).flat();

// ============================================================
// BATCH TEST: Run against a list of URLs
// ============================================================
// This opens each URL in a new tab, waits for load, runs the test,
// collects the report, then moves to the next. Results are logged
// and stored in window.__taTestResults.
//
// Usage (from extension popup DevTools or background page):
//   taRunBatch()                    — test all 100 sites
//   taRunBatch(TA_TEST_SITES.news)  — test just news sites
//   taRunBatch(["https://cnn.com"]) — test a single site
// ============================================================
async function taRunBatch(urls) {
  urls = urls || TA_ALL_TEST_URLS;
  const results = [];

  console.log(`\n${"═".repeat(60)}`);
  console.log(`TA EXTENSION BATCH TEST — ${urls.length} sites`);
  console.log(`${"═".repeat(60)}\n`);

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`\n[${i + 1}/${urls.length}] Testing: ${url}`);

    try {
      // Open the URL in the current tab
      const tab = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.tabs.update(tabs[0].id, { url }, () => resolve(tabs[0]));
        });
      });

      // Wait for page to load (generous timeout for SPAs)
      await new Promise((resolve) => {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        // Safety timeout
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 15000);
      });

      // Extra wait for SPA hydration
      await new Promise(r => setTimeout(r, 3000));

      // Run the test
      const result = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: "TA_DESIGN_INJECT", data: TA_TEST_MOCK }, () => {
          // Wait for rendering
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { type: "TA_DESIGN_REPORT" }, (report) => {
              if (chrome.runtime.lastError || !report?.report) {
                resolve({ url, error: chrome.runtime.lastError?.message || "No report", score: 0, maxScore: 5 });
                return;
              }

              const r = report.report;
              const siteType = r.match(/Detected type: (.+)/)?.[1] || "unknown";
              const headlines = parseInt(r.match(/Headlines Found: (\d+)/)?.[1] || "0");
              const contextCard = r.includes("Context card: YES");
              const unapplied = r.includes("Unapplied box: YES");
              const badge = r.includes("Floating badge: YES");
              const corrected = parseInt(r.match(/Corrected headlines: (\d+)/)?.[1] || "0");
              const bodyEdits = parseInt(r.match(/Body edits: (\d+)/)?.[1] || "0");

              let score = 0;
              if (headlines > 0) score++;
              if (contextCard || unapplied) score++;
              if (badge) score++;
              if (corrected > 0) score++;
              if (bodyEdits > 0) score++;

              resolve({
                url, siteType, score, maxScore: 5,
                headlines, contextCard, unapplied, badge, corrected, bodyEdits,
              });
            });
          }, 2000);
        });
      });

      results.push(result);
      const icon = result.score >= 4 ? "✅" : result.score >= 2 ? "⚠️" : "❌";
      console.log(`  ${icon} Score: ${result.score}/${result.maxScore} | Type: ${result.siteType} | Headlines: ${result.headlines}`);

      // Clean up
      await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: "TA_DESIGN_CLEAR" }, resolve);
      });

    } catch (e) {
      console.error(`  ❌ Error testing ${url}:`, e.message);
      results.push({ url, error: e.message, score: 0, maxScore: 5 });
    }

    // Brief pause between sites
    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log("BATCH TEST SUMMARY");
  console.log(`${"═".repeat(60)}`);

  const passed = results.filter(r => r.score >= 4);
  const partial = results.filter(r => r.score >= 2 && r.score < 4);
  const failed = results.filter(r => r.score < 2);

  console.log(`Total: ${results.length} | ✅ Passed: ${passed.length} | ⚠️ Partial: ${partial.length} | ❌ Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed sites:");
    failed.forEach(r => console.log(`  ❌ ${r.url} — ${r.error || `Score ${r.score}/${r.maxScore}, Type: ${r.siteType}`}`));
  }
  if (partial.length > 0) {
    console.log("\nPartial sites:");
    partial.forEach(r => console.log(`  ⚠️ ${r.url} — Score ${r.score}/${r.maxScore}, Type: ${r.siteType}`));
  }

  // Store for export
  window.__taTestResults = results;
  console.log("\nResults stored in window.__taTestResults");
  console.log("Export as JSON: copy(JSON.stringify(window.__taTestResults, null, 2))");

  return results;
}

// ============================================================
// SINGLE-SITE TEST (for DevTools console on the page itself)
// Run this directly in the page's DevTools console.
// It talks to the content script already loaded on the page.
// ============================================================
async function taTestThisPage() {
  // Detect extension ID by looking for injected elements or trying messaging
  const ext = typeof chrome !== "undefined" && chrome.runtime;
  if (!ext) {
    console.error("Chrome extension APIs not available. Run this from the extension popup or background page.");
    return;
  }
  return await taTestFull();
}

// ============================================================
// QUICK REFERENCE — Copy-paste snippets for DevTools
// ============================================================
console.log(`
╔══════════════════════════════════════════════════════════════╗
║  TRUST ASSEMBLY — Extension Test Scripts Loaded             ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Run from the EXTENSION POPUP DevTools (inspect popup):      ║
║                                                              ║
║    taTestInject()    — Inject mock data into current page    ║
║    taTestClear()     — Remove all injections                 ║
║    taTestScan()      — Scan for headline elements            ║
║    taTestReport()    — Generate debug report                 ║
║    taTestFull()      — Full test with scoring                ║
║                                                              ║
║  Batch testing (from popup or background page):              ║
║                                                              ║
║    taRunBatch()                      — All ~100 sites        ║
║    taRunBatch(TA_TEST_SITES.news)    — 25 news sites         ║
║    taRunBatch(TA_TEST_SITES.social)  — Social media only     ║
║    taRunBatch(TA_TEST_SITES.products)— E-commerce only       ║
║    taRunBatch(["https://cnn.com"])   — Single site           ║
║                                                              ║
║  Available categories:                                       ║
║    news, tech_media, social, video_audio, newsletters,       ║
║    blogs, products, international, government, reference,    ║
║    finance, sports, health_science                           ║
║                                                              ║
║  Export results:                                             ║
║    copy(JSON.stringify(window.__taTestResults, null, 2))     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

// ============================================================
// TRUST ASSEMBLY - Content Script
// Scans the current page for headlines that match approved
// corrections and overlays the community-verified replacements.
// ============================================================

(function () {
  "use strict";

  const TA_CLASS = "ta-correction";
  const TA_PROCESSED = "data-ta-processed";

  // Demo corrections database. In production this would be fetched
  // from the Trust Assembly API / distributed ledger.
  // Users can also add corrections via the popup.
  let corrections = [];

  // Load corrections from extension storage
  async function loadCorrections() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["ta_corrections"], (result) => {
        corrections = result.ta_corrections || [];
        resolve(corrections);
      });
    });
  }

  // Save corrections to extension storage
  async function saveCorrections(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ ta_corrections: data }, resolve);
    });
  }

  // Normalize text for fuzzy matching
  function normalize(text) {
    return text
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }

  // Find matching correction for a text node
  function findMatch(text) {
    const norm = normalize(text);
    for (const c of corrections) {
      if (c.status !== "approved" && c.status !== "consensus") continue;
      const target = normalize(c.originalHeadline);
      // Exact match or contains match (for headlines embedded in longer text)
      if (norm === target || norm.includes(target)) {
        return c;
      }
    }
    return null;
  }

  // Check if current URL matches any correction
  function findUrlMatch() {
    const currentUrl = window.location.href.replace(/\/$/, "");
    return corrections.filter((c) => {
      if (c.status !== "approved" && c.status !== "consensus") return false;
      const corrUrl = c.url.replace(/\/$/, "");
      return currentUrl === corrUrl || currentUrl.includes(corrUrl);
    });
  }

  // Create the overlay element for a corrected headline
  function createOverlay(element, correction) {
    if (element.getAttribute(TA_PROCESSED)) return;
    element.setAttribute(TA_PROCESSED, "true");

    const originalText = element.textContent;

    // Build correction wrapper
    const wrapper = document.createElement("span");
    wrapper.className = TA_CLASS;

    // Strikethrough original
    const original = document.createElement("span");
    original.className = "ta-original";
    original.textContent = originalText;

    // Replacement text
    const replacement = document.createElement("span");
    replacement.className = "ta-replacement";
    replacement.textContent = correction.replacement;

    // Info badge
    const badge = document.createElement("span");
    badge.className = "ta-badge";
    badge.textContent = correction.status === "consensus" ? "⬥ CONSENSUS" : "✓ CORRECTED";
    badge.title = `Corrected by @${correction.submittedBy} (${correction.orgName})\n\nReasoning: ${correction.reasoning}`;

    // Detail tooltip on click
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showDetailPanel(correction, element);
    });

    wrapper.appendChild(replacement);
    wrapper.appendChild(original);
    wrapper.appendChild(badge);

    // Replace element content
    element.textContent = "";
    element.appendChild(wrapper);
  }

  // Show detail panel
  function showDetailPanel(correction, anchor) {
    // Remove existing panel
    const existing = document.getElementById("ta-detail-panel");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "ta-detail-panel";
    panel.innerHTML = `
      <div class="ta-panel-header">
        <span class="ta-panel-title">Trust Assembly Correction</span>
        <button class="ta-panel-close" id="ta-panel-close">&times;</button>
      </div>
      <div class="ta-panel-body">
        <div class="ta-panel-section">
          <div class="ta-panel-label">Original Headline</div>
          <div class="ta-panel-original">${escapeHtml(correction.originalHeadline)}</div>
        </div>
        <div class="ta-panel-section">
          <div class="ta-panel-label">Corrected Headline</div>
          <div class="ta-panel-corrected">${escapeHtml(correction.replacement)}</div>
        </div>
        <div class="ta-panel-section">
          <div class="ta-panel-label">Reasoning</div>
          <div class="ta-panel-text">${escapeHtml(correction.reasoning)}</div>
        </div>
        <div class="ta-panel-meta">
          <span>By @${escapeHtml(correction.submittedBy)}</span>
          <span>${escapeHtml(correction.orgName)}</span>
          <span class="ta-panel-status ta-panel-status-${correction.status}">${correction.status === "consensus" ? "⬥ Consensus" : "✓ Approved"}</span>
        </div>
        ${correction.jurors ? `<div class="ta-panel-jury">Jury: ${correction.jurors.map((j) => "@" + escapeHtml(j)).join(", ")}</div>` : ""}
        ${correction.evidence && correction.evidence.length > 0 ? `<div class="ta-panel-section"><div class="ta-panel-label">Evidence</div>${correction.evidence.map((e) => `<div style="font-size:12px;margin-top:4px;"><a href="${escapeHtml(e.url)}" target="_blank" style="color:#2C5F7C;word-break:break-all;">${escapeHtml(e.url)}</a>${e.explanation ? `<div style="color:#6B6560;font-size:11px;margin-top:2px;">${escapeHtml(e.explanation)}</div>` : ""}</div>`).join("")}</div>` : ""}
      </div>
    `;

    document.body.appendChild(panel);

    // Position near anchor
    const rect = anchor.getBoundingClientRect();
    panel.style.top = Math.min(rect.bottom + window.scrollY + 8, document.body.scrollHeight - panel.offsetHeight - 16) + "px";
    panel.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 16)) + "px";

    document.getElementById("ta-panel-close").addEventListener("click", () => panel.remove());

    // Close on outside click
    setTimeout(() => {
      document.addEventListener("click", function handler(e) {
        if (!panel.contains(e.target)) {
          panel.remove();
          document.removeEventListener("click", handler);
        }
      });
    }, 100);
  }

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text || "";
    return d.innerHTML;
  }

  // Scan the page for headlines to correct
  function scanPage() {
    if (corrections.length === 0) return;

    // Target common headline elements
    const selectors = [
      "h1", "h2", "h3",
      "[class*='headline']", "[class*='Headline']",
      "[class*='title']", "[class*='Title']",
      "[data-testid*='headline']",
      "article header *",
      ".story-body h1", ".article-header h1",
      ".post-title", ".entry-title",
    ];

    const elements = document.querySelectorAll(selectors.join(","));

    elements.forEach((el) => {
      if (el.getAttribute(TA_PROCESSED)) return;
      const text = el.textContent.trim();
      if (text.length < 10 || text.length > 500) return;

      const match = findMatch(text);
      if (match) {
        createOverlay(el, match);
      }
    });

    // Also check URL-specific corrections and apply to the first h1
    const urlMatches = findUrlMatch();
    if (urlMatches.length > 0) {
      const h1 = document.querySelector("h1:not([" + TA_PROCESSED + "])");
      if (h1) {
        createOverlay(h1, urlMatches[0]);
      }
    }
  }

  // Show page-level banner if corrections exist for this URL
  function showPageBanner() {
    const urlMatches = findUrlMatch();
    if (urlMatches.length === 0) return;

    const existing = document.getElementById("ta-page-banner");
    if (existing) return;

    const banner = document.createElement("div");
    banner.id = "ta-page-banner";
    banner.innerHTML = `
      <div class="ta-banner-inner">
        <span class="ta-banner-icon">⬥</span>
        <span class="ta-banner-text">
          <strong>Trust Assembly:</strong> ${urlMatches.length} correction${urlMatches.length > 1 ? "s" : ""} filed for this page
        </span>
        <button class="ta-banner-dismiss" id="ta-banner-dismiss">&times;</button>
      </div>
    `;

    document.body.prepend(banner);
    document.getElementById("ta-banner-dismiss").addEventListener("click", () => banner.remove());
  }

  // Notify badge count
  function updateBadge() {
    const urlMatches = findUrlMatch();
    chrome.runtime.sendMessage({
      type: "updateBadge",
      count: urlMatches.length,
    });
  }

  // Initialize
  async function init() {
    await loadCorrections();
    if (corrections.length > 0) {
      scanPage();
      showPageBanner();
      updateBadge();

      // Re-scan on DOM mutations (for SPAs and lazy-loaded content)
      const observer = new MutationObserver(() => {
        scanPage();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "correctionsUpdated") {
      loadCorrections().then(() => {
        scanPage();
        showPageBanner();
        updateBadge();
      });
      sendResponse({ ok: true });
    }
    if (msg.type === "getPageInfo") {
      // Grab current page headline for quick submission
      const h1 = document.querySelector("h1");
      sendResponse({
        url: window.location.href,
        headline: h1 ? h1.textContent.trim() : "",
        title: document.title,
      });
    }
    return true;
  });

  // Start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

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

  // ── Detect page URL and check for corrections ──
  async function init() {
    const url = window.location.href;
    if (!url.startsWith("http")) return;

    // Load user settings before doing anything
    await loadSettings();

    // Check cache first, then API
    let data = getCachedData(url);
    if (!data) {
      data = await TA.getForURL(url);
      setCachedData(url, data);
    }

    const total = data.corrections.length + data.affirmations.length + data.translations.length;

    if (total === 0) return;

    // Notify background script for badge count
    try {
      chrome.runtime.sendMessage({ type: "TA_COUNT", count: total, url });
    } catch (e) {
      // Firefox or Safari — try browser.runtime
      try { browser.runtime.sendMessage({ type: "TA_COUNT", count: total, url }); } catch (_) {}
    }

    // Apply translations inline (if enabled)
    if (settings.showTranslations && data.translations.length > 0) {
      applyTranslations(data.translations);
    }

    // Render the floating badge (if enabled)
    if (settings.showBadge) {
      renderBadge(data);
    }

    // Store data on window for later use by settings changes
    window.__trustAssemblyData = data;
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

  // ── Side Panel ──
  function togglePanel(data) {
    const existing = document.getElementById(PANEL_ID);
    if (existing) { existing.remove(); return; }

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

    // Corrections
    data.corrections.forEach(sub => {
      const profile = sub.profile || "Citizen";
      const score = sub.trustScore != null ? sub.trustScore : "—";
      html += `
        <div class="ta-ext-card ta-ext-card-correction">
          <div class="ta-ext-card-meta">
            <span class="ta-ext-profile-badge" style="border-color:${COLORS.red}; color:${COLORS.red}">
              ${profile} · ${score}
            </span>
            <span class="ta-ext-card-assembly">${sub.orgName || "Assembly"}</span>
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
    });

    // Affirmations
    data.affirmations.forEach(sub => {
      const profile = sub.profile || "Citizen";
      const score = sub.trustScore != null ? sub.trustScore : "—";
      html += `
        <div class="ta-ext-card ta-ext-card-affirmation">
          <div class="ta-ext-card-meta">
            <span class="ta-ext-profile-badge" style="border-color:${COLORS.green}; color:${COLORS.green}">
              ${profile} · ${score}
            </span>
            <span class="ta-ext-card-assembly">${sub.orgName || "Assembly"}</span>
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

  // ── Start ──
  listenForSettingsChanges();
  listenForStorageChanges();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

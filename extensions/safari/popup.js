/**
 * Trust Assembly Extension — Popup Script
 */

document.addEventListener("DOMContentLoaded", async () => {
  const content = document.getElementById("content");

  // Get current tab URL
  let url;
  try {
    // Chrome
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    url = tab?.url;
  } catch (e) {
    try {
      // Firefox
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      url = tab?.url;
    } catch (_) {}
  }

  if (!url || !url.startsWith("http")) {
    content.innerHTML = `<div class="empty"><div class="empty-icon">📄</div>Navigate to a web page to see corrections, affirmations, and translations.</div>`;
    return;
  }

  try {
    const data = await TA.getForURL(url);
    const total = data.corrections.length + data.affirmations.length + data.translations.length;

    if (total === 0) {
      content.innerHTML = `
        <div class="empty">
          <div class="empty-icon">✓</div>
          No corrections, affirmations, or translations found for this page.
          <br><br>
          <span style="font-size:10px; color:#B0A89C">This could mean the article hasn't been reviewed yet, or it passed review without issues.</span>
        </div>
      `;
      return;
    }

    // Status bar
    let html = `
      <div class="status">
        <span class="status-count">${total}</span>
        ${data.corrections.length} correction${data.corrections.length !== 1 ? "s" : ""} ·
        ${data.affirmations.length} affirmation${data.affirmations.length !== 1 ? "s" : ""} ·
        ${data.translations.length} translation${data.translations.length !== 1 ? "s" : ""}
      </div>
      <div class="corrections-list">
    `;

    // Corrections
    data.corrections.forEach(sub => {
      html += `
        <div class="correction-item type-correction">
          <div class="meta">🔴 Correction · ${sub.orgName || "Assembly"} · ${formatStatus(sub.status)}</div>
          <div class="headline-old">${escapeHtml(sub.originalHeadline)}</div>
          <div class="headline-new">${escapeHtml(sub.replacement)}</div>
        </div>
      `;
    });

    // Affirmations
    data.affirmations.forEach(sub => {
      html += `
        <div class="correction-item type-affirmation">
          <div class="meta">🟢 Affirmation · ${sub.orgName || "Assembly"} · ${formatStatus(sub.status)}</div>
          <div class="headline-affirmed">✓ ${escapeHtml(sub.originalHeadline)}</div>
        </div>
      `;
    });

    // Translations
    data.translations.forEach(t => {
      const types = { clarity: "Clarity", propaganda: "Anti-Propaganda", euphemism: "Euphemism", satirical: "Satirical" };
      html += `
        <div class="correction-item type-translation">
          <div class="meta">🔄 Translation · ${types[t.type] || t.type} · ${t.orgName || "Assembly"}</div>
          <div class="trans-pair">
            <span class="trans-orig">${escapeHtml(t.original)}</span>
            <span class="trans-arrow"> → </span>
            <span class="trans-result">${escapeHtml(t.translated)}</span>
          </div>
        </div>
      `;
    });

    html += "</div>";
    content.innerHTML = html;

  } catch (e) {
    content.innerHTML = `
      <div class="empty">
        <div class="empty-icon">⚠</div>
        Could not reach Trust Assembly API.
        <br><br>
        <span style="font-size:10px; color:#B0A89C">${escapeHtml(e.message)}</span>
      </div>
    `;
  }

  // Settings toggles
  const storage = chrome?.storage?.local || browser?.storage?.local;
  if (storage) {
    storage.get(["showTranslations", "showBadge"], (result) => {
      document.getElementById("toggle-translations").checked = result.showTranslations !== false;
      document.getElementById("toggle-badge").checked = result.showBadge !== false;
    });
    document.getElementById("toggle-translations").addEventListener("change", (e) => {
      storage.set({ showTranslations: e.target.checked });
      notifyContentScript({ showTranslations: e.target.checked });
    });
    document.getElementById("toggle-badge").addEventListener("change", (e) => {
      storage.set({ showBadge: e.target.checked });
      notifyContentScript({ showBadge: e.target.checked });
    });
  }
});

async function notifyContentScript(changedSettings) {
  try {
    const tabs = typeof chrome !== "undefined" && chrome.tabs
      ? await chrome.tabs.query({ active: true, currentWindow: true })
      : await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab && tab.id) {
      const message = { type: "TA_SETTINGS_CHANGED", ...changedSettings };
      try {
        chrome.tabs.sendMessage(tab.id, message);
      } catch (e) {
        try { browser.tabs.sendMessage(tab.id, message); } catch (_) {}
      }
    }
  } catch (e) {
    // Tab messaging not available — settings will apply via storage.onChanged
  }
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatStatus(status) {
  const labels = {
    approved: "Approved", consensus: "Consensus",
    cross_review: "Cross-Group", pending_review: "Under Review"
  };
  return labels[status] || status || "Approved";
}

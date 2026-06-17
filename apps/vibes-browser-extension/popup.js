// Trust Assembly - Popup Script (v5)

const DEMO_CORRECTIONS = [
  {
    id: "demo1",
    url: "https://example.com/article-1",
    originalHeadline: "BREAKING: New Study Shows Coffee May Be Linked to Everything",
    replacement: "Observational Study Finds Weak Correlation Between Coffee Consumption and Several Health Markers; No Causal Link Established",
    reasoning: "The original headline implies causation where only a weak observational correlation exists. The study itself notes significant confounders and explicitly states no causal claim can be made.",
    evidence: [{ url: "https://example.com/study-abstract", explanation: "Study abstract noting limitations" }],
    submittedBy: "factchecker42",
    orgName: "The General Public",
    status: "approved",
    jurors: ["reviewer1", "reviewer2", "reviewer3"],
    votes: {},
    crossGroupJurors: [],
    crossGroupVotes: {},
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "demo2",
    url: "https://example.com/article-2",
    originalHeadline: "Tech Giant's Massive Recall Affects Millions",
    replacement: "Tech Company Issues Over-the-Air Software Update Adjusting Display Font Size; No Safety Issue, No Physical Recall",
    reasoning: "A font size change in a software update is not a 'recall' in any meaningful sense. No vehicles were returned to dealerships. The word 'recall' is technically correct per regulatory definitions but deliberately misleading to readers.",
    evidence: [{ url: "https://example.com/nhtsa-filing", explanation: "NHTSA filing showing OTA update only" }],
    submittedBy: "clarity_now",
    orgName: "The General Public",
    status: "consensus",
    jurors: ["juror_a", "juror_b", "juror_c"],
    votes: {},
    crossGroupJurors: ["cross_1", "cross_2", "cross_3"],
    crossGroupVotes: {},
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

// State
let corrections = [];
let pageInfo = { url: "", headline: "" };

// Load data
async function init() {
  const result = await chrome.storage.local.get(["ta_corrections"]);
  corrections = result.ta_corrections || [];
  updateStats();
  renderCorrections();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      document.getElementById("page-url").textContent = tabs[0].url;
      chrome.tabs.sendMessage(tabs[0].id, { type: "getPageInfo" }, (response) => {
        if (chrome.runtime.lastError) {
          document.getElementById("page-headline").innerHTML =
            '<span class="page-no-headline">Content script not active on this page</span>';
          return;
        }
        if (response) {
          pageInfo = response;
          document.getElementById("page-url").textContent = response.url;
          if (response.headline) {
            document.getElementById("page-headline").textContent = response.headline;
            document.getElementById("orig-headline").value = response.headline;
          } else {
            document.getElementById("page-headline").innerHTML =
              '<span class="page-no-headline">No headline detected</span>';
          }
        }
      });
    }
  });
}

function updateStats() {
  const approved = corrections.filter((c) => c.status === "approved").length;
  const consensus = corrections.filter((c) => c.status === "consensus").length;
  document.getElementById("stat-approved").textContent = approved;
  document.getElementById("stat-consensus").textContent = consensus;
  document.getElementById("stat-total").textContent = corrections.length;
}

function renderCorrections() {
  const container = document.getElementById("corrections-container");
  if (corrections.length === 0) {
    container.innerHTML = '<div class="empty">No corrections stored. Submit one or load demos.</div>';
    return;
  }
  container.innerHTML = '<div class="corrections-list">' +
    corrections.map((c) => `
      <div class="correction-item">
        <div class="correction-orig">${escapeHtml(c.originalHeadline)}</div>
        <div class="correction-new">${escapeHtml(c.replacement)}</div>
        <div class="correction-meta">
          @${escapeHtml(c.submittedBy)} · ${escapeHtml(c.orgName)} ·
          <span class="correction-status ${c.status}">${c.status}</span>
          ${c.evidence && c.evidence.length > 0 ? ' · 📎 ' + c.evidence.length + ' source' + (c.evidence.length > 1 ? 's' : '') : ''}
        </div>
      </div>
    `).join("") +
    '</div>';
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text || "";
  return d.innerHTML;
}

function showMsg(type, text) {
  const area = document.getElementById("msg-area");
  area.innerHTML = `<div class="msg msg-${type}">${text}</div>`;
  setTimeout(() => { area.innerHTML = ""; }, 4000);
}

// Tab switching
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    document.getElementById("tab-submit").style.display = target === "submit" ? "block" : "none";
    document.getElementById("tab-corrections").style.display = target === "corrections" ? "block" : "none";
  });
});

// Submit correction
document.getElementById("submit-btn").addEventListener("click", async () => {
  const orig = document.getElementById("orig-headline").value.trim();
  const replacement = document.getElementById("new-headline").value.trim();
  const reasoning = document.getElementById("reasoning").value.trim();
  const author = document.getElementById("author").value.trim();
  const evidenceUrl = document.getElementById("evidence-url").value.trim();

  if (!orig || !replacement || !reasoning) {
    showMsg("error", "Headline, correction, and reasoning are required.");
    return;
  }

  const evidence = evidenceUrl ? [{ url: evidenceUrl, explanation: "" }] : [];

  const correction = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    url: pageInfo.url || document.getElementById("page-url").textContent,
    originalHeadline: orig,
    replacement: replacement,
    reasoning: reasoning,
    evidence: evidence,
    inlineEdits: [],
    submittedBy: author || "anonymous",
    orgName: "Local",
    status: "approved",
    jurors: [],
    votes: {},
    crossGroupJurors: [],
    crossGroupVotes: {},
    createdAt: new Date().toISOString(),
  };

  corrections.push(correction);
  await chrome.storage.local.set({ ta_corrections: corrections });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "correctionsUpdated" });
    }
  });

  updateStats();
  renderCorrections();
  showMsg("success", "Correction saved and applied to matching pages.");

  document.getElementById("new-headline").value = "";
  document.getElementById("reasoning").value = "";
  document.getElementById("evidence-url").value = "";
});

// Import demo corrections
document.getElementById("import-demo").addEventListener("click", async () => {
  const existingIds = new Set(corrections.map((c) => c.id));
  const newOnes = DEMO_CORRECTIONS.filter((d) => !existingIds.has(d.id));
  corrections = [...corrections, ...newOnes];
  await chrome.storage.local.set({ ta_corrections: corrections });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "correctionsUpdated" });
    }
  });

  updateStats();
  renderCorrections();
  showMsg("success", `Loaded ${newOnes.length} demo correction(s).`);
});

// Init
init();

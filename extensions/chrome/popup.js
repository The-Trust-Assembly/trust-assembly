/**
 * Trust Assembly Extension — Popup Script
 * Handles: corrections display, login, follow, submit, color-coding, conflict resolution
 */

let currentUrl = null;
let currentUser = null;
let userAssemblies = null; // { joined: [], followed: [] }

document.addEventListener("DOMContentLoaded", async () => {
  // Get current tab URL
  try {
    const [tab] = typeof chrome !== "undefined" && chrome.tabs
      ? await chrome.tabs.query({ active: true, currentWindow: true })
      : await browser.tabs.query({ active: true, currentWindow: true });
    currentUrl = tab?.url;
  } catch (e) {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      currentUrl = tab?.url;
    } catch (_) {}
  }

  // Check stored auth
  currentUser = await TA.getStoredUser();
  renderAuthHeader();

  // Set up tabs
  setupTabs();

  // Load corrections
  loadCorrections();

  // Settings toggles
  setupSettings();
});

// ── Auth header ──
function renderAuthHeader() {
  const el = document.getElementById("header-user");
  const nameEl = document.getElementById("header-username");
  if (currentUser) {
    nameEl.textContent = "@" + (currentUser.displayName || currentUser.username);
    el.style.display = "flex";
    document.getElementById("btn-signout").onclick = async () => {
      await TA.logout();
      currentUser = null;
      userAssemblies = null;
      renderAuthHeader();
      renderSubmitTab();
      renderAssembliesTab();
    };
  } else {
    el.style.display = "none";
  }
}

// ── Tab switching ──
function setupTabs() {
  const buttons = document.querySelectorAll(".tab-bar button");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("tab-corrections").style.display = tab === "corrections" ? "" : "none";
      document.getElementById("tab-submit").style.display = tab === "submit" ? "" : "none";
      document.getElementById("tab-assemblies").style.display = tab === "assemblies" ? "" : "none";
      if (tab === "submit") renderSubmitTab();
      if (tab === "assemblies") renderAssembliesTab();
    });
  });
}

// ── Corrections tab ──
async function loadCorrections() {
  const content = document.getElementById("content");

  if (!currentUrl || !currentUrl.startsWith("http")) {
    content.innerHTML = `<div class="empty"><div class="empty-icon">📄</div>Navigate to a web page to see corrections, affirmations, and translations.</div>`;
    return;
  }

  // Load user assemblies for badges (non-blocking)
  if (currentUser && !userAssemblies) {
    userAssemblies = await TA.getCachedAssemblies();
    if (!userAssemblies) {
      TA.getMyAssemblies().then(a => { userAssemblies = a; });
    }
  }

  try {
    const data = await TA.getForURL(currentUrl);
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

    // Apply conflict resolution to corrections
    const resolved = resolveConflicts(data.corrections);

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

    // Corrections (conflict-resolved)
    resolved.forEach(group => {
      // Winner: full display
      html += renderCorrectionItem(group.winner);
      // Others: collapsed
      if (group.others.length > 0) {
        const gid = "cg-" + Math.random().toString(36).slice(2, 8);
        html += `<div class="conflict-others" onclick="document.getElementById('${gid}').classList.toggle('conflict-hidden')">See ${group.others.length} other correction${group.others.length !== 1 ? "s" : ""} for this headline</div>`;
        html += `<div id="${gid}" class="conflict-hidden">`;
        group.others.forEach(sub => { html += renderCorrectionItem(sub); });
        html += `</div>`;
      }
    });

    // Affirmations
    data.affirmations.forEach(sub => {
      const statusClass = sub.status === "consensus" ? "status-consensus" : sub.status === "approved" ? "status-approved" : "";
      html += `
        <div class="correction-item type-affirmation ${statusClass}">
          <div class="meta">🟢 Affirmation · ${escapeHtml(sub.orgName || "Assembly")}${relBadge(sub.orgId)} · ${formatStatus(sub.status)}</div>
          <div class="headline-affirmed">✓ ${escapeHtml(sub.originalHeadline)}</div>
        </div>
      `;
    });

    // Translations
    data.translations.forEach(t => {
      const types = { clarity: "Clarity", propaganda: "Anti-Propaganda", euphemism: "Euphemism", satirical: "Satirical" };
      html += `
        <div class="correction-item type-translation">
          <div class="meta">🔄 Translation · ${types[t.type] || t.type} · ${escapeHtml(t.orgName || "Assembly")}${relBadge(t.orgId)}</div>
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
}

function renderCorrectionItem(sub) {
  const statusClass = sub.status === "consensus" ? "status-consensus" : sub.status === "approved" ? "status-approved" : "";
  return `
    <div class="correction-item type-correction ${statusClass}">
      <div class="meta">🔴 Correction · ${escapeHtml(sub.orgName || "Assembly")}${relBadge(sub.orgId)} · ${formatStatus(sub.status)}</div>
      <div class="headline-old">${escapeHtml(sub.originalHeadline)}</div>
      <div class="headline-new">${escapeHtml(sub.replacement)}</div>
    </div>
  `;
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
      if (sb !== sa) return sb - sa; // Higher trust score first
      return (a.orgName || "").localeCompare(b.orgName || ""); // Alphabetical tiebreak
    });
    return { winner: items[0], others: items.slice(1) };
  });
}

// ── Relationship badge ──
function relBadge(orgId) {
  if (!userAssemblies || !orgId) return "";
  if (userAssemblies.joined && userAssemblies.joined.some(o => o.id === orgId)) {
    return ' <span class="rel-badge joined">Joined</span>';
  }
  if (userAssemblies.followed && userAssemblies.followed.some(o => o.id === orgId)) {
    return ' <span class="rel-badge followed">Followed</span>';
  }
  return "";
}

// ── Submit tab ──
async function renderSubmitTab() {
  const gate = document.getElementById("submit-gate");
  if (!currentUser) {
    gate.innerHTML = `
      <div class="login-panel">
        <h3>Sign in to submit corrections</h3>
        <input type="text" id="login-user" placeholder="Username or email" autocomplete="username">
        <input type="password" id="login-pass" placeholder="Password" autocomplete="current-password">
        <button class="login-btn" id="btn-login">Sign In</button>
        <div id="login-error" class="login-error" style="display:none"></div>
        <div class="login-hint">Don't have an account? <a href="https://trustassembly.org/#register" target="_blank" style="color:#B8963E">Register on trustassembly.org</a></div>
      </div>
    `;
    document.getElementById("btn-login").addEventListener("click", doLogin);
    document.getElementById("login-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
    return;
  }

  // Logged in — show submit form
  const joinedOrgs = userAssemblies?.joined || [];
  if (joinedOrgs.length === 0) {
    gate.innerHTML = `
      <div class="submit-panel">
        <div class="empty">
          <div class="empty-icon">⚖</div>
          You must be a member of at least one assembly to submit corrections.
          <br><br>
          <a href="https://trustassembly.org/#orgs" target="_blank" style="color:#B8963E">Join an assembly on trustassembly.org</a>
        </div>
      </div>
    `;
    return;
  }

  let orgOptions = joinedOrgs.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`).join("");

  gate.innerHTML = `
    <div class="submit-panel">
      <h3>Submit a Correction</h3>
      <label>Assembly</label>
      <select id="sub-org">${orgOptions}</select>
      <label>Article URL</label>
      <input type="text" id="sub-url" value="${escapeHtml(currentUrl || "")}" readonly>
      <label>Original Headline</label>
      <input type="text" id="sub-headline" placeholder="Detecting headline…">
      <label>Corrected Headline</label>
      <input type="text" id="sub-replacement" placeholder="Your proposed correction">
      <label>Reasoning</label>
      <textarea id="sub-reasoning" placeholder="Why is this correction needed?"></textarea>
      <button class="submit-btn" id="btn-submit">Submit Correction</button>
      <div id="submit-msg" class="submit-msg" style="display:none"></div>
    </div>
  `;
  document.getElementById("btn-submit").addEventListener("click", doSubmit);

  // Auto-detect headline from current page
  try {
    const tabs = typeof chrome !== "undefined" && chrome.tabs
      ? await chrome.tabs.query({ active: true, currentWindow: true })
      : await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab && tab.id) {
      const sendMsg = (typeof chrome !== "undefined" && chrome.tabs)
        ? chrome.tabs.sendMessage.bind(chrome.tabs)
        : browser.tabs.sendMessage.bind(browser.tabs);
      sendMsg(tab.id, { type: "TA_GET_HEADLINE" }, (response) => {
        const headlineInput = document.getElementById("sub-headline");
        if (response && response.headline && headlineInput && !headlineInput.value) {
          headlineInput.value = response.headline;
          headlineInput.placeholder = "The original headline as published";
        } else if (headlineInput) {
          headlineInput.placeholder = "The original headline as published";
        }
      });
    }
  } catch (e) {
    const headlineInput = document.getElementById("sub-headline");
    if (headlineInput) headlineInput.placeholder = "The original headline as published";
  }
}

async function doLogin() {
  const username = document.getElementById("login-user").value.trim();
  const password = document.getElementById("login-pass").value;
  const errorEl = document.getElementById("login-error");
  if (!username || !password) {
    errorEl.textContent = "Username and password are required.";
    errorEl.style.display = "block";
    return;
  }
  errorEl.style.display = "none";
  const result = await TA.login(username, password);
  if (!result) {
    errorEl.textContent = "Invalid credentials. Please try again.";
    errorEl.style.display = "block";
    return;
  }
  currentUser = { username: result.username, displayName: result.displayName, id: result.id };
  userAssemblies = await TA.getMyAssemblies();
  renderAuthHeader();
  renderSubmitTab();
  // Reload corrections to show badges
  loadCorrections();
}

async function doSubmit() {
  const msgEl = document.getElementById("submit-msg");
  const orgId = document.getElementById("sub-org").value;
  const url = document.getElementById("sub-url").value;
  const originalHeadline = document.getElementById("sub-headline").value.trim();
  const replacement = document.getElementById("sub-replacement").value.trim();
  const reasoning = document.getElementById("sub-reasoning").value.trim();

  if (!originalHeadline || !replacement || !reasoning) {
    msgEl.className = "submit-msg error";
    msgEl.textContent = "All fields are required.";
    msgEl.style.display = "block";
    return;
  }

  msgEl.style.display = "none";
  const result = await TA.submitCorrection({
    submissionType: "correction",
    url,
    originalHeadline,
    replacement,
    reasoning,
    orgId,
  });

  if (result.error) {
    msgEl.className = "submit-msg error";
    msgEl.textContent = result.error;
    msgEl.style.display = "block";
  } else {
    msgEl.className = "submit-msg success";
    msgEl.textContent = "Correction submitted! It will appear after review.";
    msgEl.style.display = "block";
    document.getElementById("sub-headline").value = "";
    document.getElementById("sub-replacement").value = "";
    document.getElementById("sub-reasoning").value = "";
  }
}

// ── Assemblies tab ──
async function renderAssembliesTab() {
  const container = document.getElementById("assemblies-content");

  if (!currentUser) {
    container.innerHTML = `
      <div class="login-panel">
        <h3>Sign in to manage assemblies</h3>
        <input type="text" id="login-user-asm" placeholder="Username or email" autocomplete="username">
        <input type="password" id="login-pass-asm" placeholder="Password" autocomplete="current-password">
        <button class="login-btn" id="btn-login-asm">Sign In</button>
        <div id="login-error-asm" class="login-error" style="display:none"></div>
      </div>
    `;
    document.getElementById("btn-login-asm").addEventListener("click", async () => {
      const username = document.getElementById("login-user-asm").value.trim();
      const password = document.getElementById("login-pass-asm").value;
      const errorEl = document.getElementById("login-error-asm");
      if (!username || !password) { errorEl.textContent = "Username and password required."; errorEl.style.display = "block"; return; }
      const result = await TA.login(username, password);
      if (!result) { errorEl.textContent = "Invalid credentials."; errorEl.style.display = "block"; return; }
      currentUser = { username: result.username, displayName: result.displayName, id: result.id };
      userAssemblies = await TA.getMyAssemblies();
      renderAuthHeader();
      renderAssembliesTab();
    });
    return;
  }

  // Fetch fresh assemblies
  if (!userAssemblies) {
    userAssemblies = await TA.getMyAssemblies();
  }

  let html = '<div class="assemblies-panel">';

  // Joined assemblies
  html += '<h3>Joined Assemblies</h3>';
  if (userAssemblies.joined.length === 0) {
    html += '<div style="font-size:11px; color:#B0A89C; padding:8px 0;">No memberships. <a href="https://trustassembly.org/#orgs" target="_blank" style="color:#B8963E">Join on the web</a></div>';
  } else {
    userAssemblies.joined.forEach(org => {
      html += `
        <div class="assembly-row">
          <div><div class="name">${escapeHtml(org.name)}</div><div class="role">Member</div></div>
        </div>
      `;
    });
  }

  // Followed assemblies
  html += '<h3 style="margin-top:14px;">Followed Assemblies</h3>';
  if (userAssemblies.followed.length === 0) {
    html += '<div style="font-size:11px; color:#B0A89C; padding:8px 0;">Not following any assemblies yet.</div>';
  } else {
    userAssemblies.followed.forEach(org => {
      html += `
        <div class="assembly-row">
          <div><div class="name">${escapeHtml(org.name)}</div><div class="role">Following</div></div>
          <button class="following" data-unfollow="${escapeHtml(org.id)}">Unfollow</button>
        </div>
      `;
    });
  }

  html += '</div>';
  container.innerHTML = html;

  // Wire up unfollow buttons
  container.querySelectorAll("[data-unfollow]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await TA.unfollowOrg(btn.dataset.unfollow);
      userAssemblies = await TA.getMyAssemblies();
      renderAssembliesTab();
    });
  });
}

// ── Settings ──
function setupSettings() {
  const storage = (typeof chrome !== "undefined" && chrome.storage?.local)
    || (typeof browser !== "undefined" && browser.storage?.local);
  if (!storage) return;

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
  } catch (e) {}
}

// ── Utilities ──

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatStatus(status) {
  const labels = {
    approved: "✅ Approved", consensus: "🟣 Consensus",
    cross_review: "Cross-Group", pending_review: "Under Review",
    rejected: "Rejected", upheld: "Dispute Upheld"
  };
  return labels[status] || status || "Approved";
}

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

  // Show login gate if not authenticated
  if (!currentUser) {
    renderLoginGate();
  } else {
    // Load corrections
    loadCorrections();
  }

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

// ── Login gate (shown when not signed in) ──
function renderLoginGate() {
  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="login-panel">
      <h3>Sign in to Trust Assembly</h3>
      <p style="font-size:11px; color:#5A5650; line-height:1.5; margin-bottom:10px;">Sign in to see corrections from your assemblies, submit new corrections, and manage your memberships.</p>
      <input type="text" id="login-user-gate" placeholder="Username or email" autocomplete="username">
      <input type="password" id="login-pass-gate" placeholder="Password" autocomplete="current-password">
      <button class="login-btn" id="btn-login-gate">Sign In</button>
      <div id="login-error-gate" class="login-error" style="display:none"></div>
      <div class="login-hint">Don't have an account? <a href="https://trustassembly.org/#register" target="_blank" style="color:#B8963E">Register on trustassembly.org</a></div>
    </div>
  `;
  document.getElementById("btn-login-gate").addEventListener("click", doLoginGate);
  document.getElementById("login-pass-gate").addEventListener("keydown", (e) => { if (e.key === "Enter") doLoginGate(); });
}

async function doLoginGate() {
  const username = document.getElementById("login-user-gate").value.trim();
  const password = document.getElementById("login-pass-gate").value;
  const errorEl = document.getElementById("login-error-gate");
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
  loadCorrections();
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
      else clearPreviewMessage(); // Clear live preview when leaving submit tab
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

  // Load user assemblies for relationship badges
  if (currentUser && !userAssemblies) {
    userAssemblies = await TA.getCachedAssemblies();
    if (!userAssemblies) {
      userAssemblies = await TA.getMyAssemblies();
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
      <div class="headline-new">${escapeHtml(sub.replacement)}</div>
      <div class="headline-old">was: ${escapeHtml(sub.originalHeadline)}</div>
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
let submitType = "correction"; // "correction" or "affirmation"
let detectedAuthors = []; // auto-detected from page
let selectedAuthors = []; // user-selected author tags
let vaultSectionsOpen = {}; // track which vault sections are expanded

async function renderSubmitTab() {
  const gate = document.getElementById("submit-gate");
  if (!currentUser) {
    gate.innerHTML = `
      <div class="login-panel">
        <h3>Sign in to submit</h3>
        <p style="font-size:11px; color:#5A5650; line-height:1.5; margin-bottom:10px;">Sign in to submit corrections, affirmations, and vault artifacts for your assemblies.</p>
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
          You must be a member of at least one assembly to submit.
          <br><br>
          <a href="https://trustassembly.org/#orgs" target="_blank" style="color:#B8963E">Join an assembly on trustassembly.org</a>
        </div>
      </div>
    `;
    return;
  }

  const isAffirm = submitType === "affirmation";
  let orgOptions = joinedOrgs.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`).join("");

  // Author tags HTML
  let authorTagsHtml = selectedAuthors.map((a, i) =>
    `<span class="author-tag">${escapeHtml(a)}<span class="remove" data-author-idx="${i}">&times;</span></span>`
  ).join("");

  gate.innerHTML = `
    <div class="submit-panel">
      <h3>Submit to Trust Assembly</h3>

      <!-- Submission type toggle -->
      <div class="type-toggle">
        <button id="btn-type-correction" class="${!isAffirm ? 'active-correction' : ''}">
          <div>Correction</div>
          <div class="type-desc">Headline is misleading</div>
        </button>
        <button id="btn-type-affirmation" class="${isAffirm ? 'active-affirmation' : ''}">
          <div>Affirmation</div>
          <div class="type-desc">Headline is accurate</div>
        </button>
      </div>

      ${isAffirm ? '<div class="affirm-banner">You are affirming this headline is <strong>accurate</strong>. Provide your reasoning and evidence below.</div>' : ''}

      <label>Assembly</label>
      <select id="sub-org">${orgOptions}</select>

      <label>Article URL</label>
      <input type="text" id="sub-url" value="${escapeHtml(currentUrl || "")}" readonly>

      <label>Original Headline</label>
      <input type="text" id="sub-headline" placeholder="Detecting headline…">

      ${!isAffirm ? `
        <label>Corrected Headline</label>
        <input type="text" id="sub-replacement" placeholder="Your proposed correction">
      ` : ''}

      <label>Author(s) <span style="font-size:9px;color:#B0A89C;font-weight:400">— auto-detected from page</span></label>
      <div class="author-tags" id="author-tags">${authorTagsHtml}</div>
      ${detectedAuthors.length > 0 && selectedAuthors.length < 10 ? `
        <select id="author-select" style="margin-bottom:4px">
          <option value="">Add an author…</option>
          ${detectedAuthors.filter(a => !selectedAuthors.includes(a)).map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("")}
          <option value="__custom__">Enter manually…</option>
        </select>
      ` : selectedAuthors.length < 10 ? `
        <input type="text" id="author-manual" placeholder="Type author name and press Enter" style="margin-bottom:4px">
      ` : ''}
      <div class="author-hint">${selectedAuthors.length}/10 authors max</div>

      <label>Reasoning</label>
      <textarea id="sub-reasoning" placeholder="${isAffirm ? 'Why is this headline accurate?' : 'Why is this correction needed?'}"></textarea>

      <!-- Vault Artifacts (optional) -->
      <div class="vault-section">
        <div class="vault-section-title" id="vault-toggle">+ Vault Artifacts (optional)</div>
        <div id="vault-body" style="display:none">
          <div style="font-size:10px; color:#7A7570; margin-bottom:8px; line-height:1.4;">Optionally add entries to your assembly's vaults alongside this submission.</div>

          <!-- Standing Correction -->
          <div class="vault-type-row vault-color-correction">
            <div class="vault-type-header" data-vault="correction">
              <span class="vault-type-label">Standing Correction</span>
              <span class="vault-type-toggle">${vaultSectionsOpen.correction ? '−' : '+'}</span>
            </div>
            <div class="vault-type-body" style="display:${vaultSectionsOpen.correction ? 'block' : 'none'}" data-vault-body="correction">
              <div class="vault-type-desc">A reusable verified fact for your assembly's Fact Vault.</div>
              <input type="text" id="vault-sc-assertion" placeholder="Factual assertion (e.g. 'The recall was software-only, not physical')">
              <input type="text" id="vault-sc-evidence" placeholder="Supporting evidence or source URL">
            </div>
          </div>

          <!-- Argument -->
          <div class="vault-type-row vault-color-argument">
            <div class="vault-type-header" data-vault="argument">
              <span class="vault-type-label">Argument</span>
              <span class="vault-type-toggle">${vaultSectionsOpen.argument ? '−' : '+'}</span>
            </div>
            <div class="vault-type-body" style="display:${vaultSectionsOpen.argument ? 'block' : 'none'}" data-vault-body="argument">
              <div class="vault-type-desc">A fundamental argument for reuse across articles.</div>
              <textarea id="vault-arg-content" placeholder="The argument (e.g. 'Correlation does not imply causation — this study shows…')"></textarea>
            </div>
          </div>

          <!-- Belief -->
          <div class="vault-type-row vault-color-belief">
            <div class="vault-type-header" data-vault="belief">
              <span class="vault-type-label">Foundational Belief</span>
              <span class="vault-type-toggle">${vaultSectionsOpen.belief ? '−' : '+'}</span>
            </div>
            <div class="vault-type-body" style="display:${vaultSectionsOpen.belief ? 'block' : 'none'}" data-vault-body="belief">
              <div class="vault-type-desc">A core axiom or starting premise, not a claim of fact.</div>
              <textarea id="vault-belief-content" placeholder="The belief (e.g. 'Free speech includes speech we disagree with')"></textarea>
            </div>
          </div>

          <!-- Translation -->
          <div class="vault-type-row vault-color-translation">
            <div class="vault-type-header" data-vault="translation">
              <span class="vault-type-label">Translation</span>
              <span class="vault-type-toggle">${vaultSectionsOpen.translation ? '−' : '+'}</span>
            </div>
            <div class="vault-type-body" style="display:${vaultSectionsOpen.translation ? 'block' : 'none'}" data-vault-body="translation">
              <div class="vault-type-desc">A plain-language replacement for jargon, spin, or propaganda.</div>
              <input type="text" id="vault-trans-original" placeholder="Original term or phrase">
              <input type="text" id="vault-trans-translated" placeholder="Plain-language replacement">
              <select id="vault-trans-type">
                <option value="clarity">Clarity</option>
                <option value="propaganda">Anti-Propaganda</option>
                <option value="euphemism">Euphemism</option>
                <option value="satirical">Satirical</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <button class="submit-btn" id="btn-submit" style="margin-top:10px; background:${isAffirm ? '#1B5E3F' : '#C4573F'}">
        Submit ${isAffirm ? 'Affirmation' : 'Correction'}
      </button>
      <div id="submit-msg" class="submit-msg" style="display:none"></div>
    </div>
  `;

  // Wire up type toggle
  document.getElementById("btn-type-correction").addEventListener("click", () => {
    submitType = "correction";
    renderSubmitTab();
  });
  document.getElementById("btn-type-affirmation").addEventListener("click", () => {
    submitType = "affirmation";
    renderSubmitTab();
  });

  // Wire up vault section toggle
  document.getElementById("vault-toggle").addEventListener("click", () => {
    const body = document.getElementById("vault-body");
    const toggle = document.getElementById("vault-toggle");
    if (body.style.display === "none") {
      body.style.display = "block";
      toggle.textContent = "− Vault Artifacts (optional)";
    } else {
      body.style.display = "none";
      toggle.textContent = "+ Vault Artifacts (optional)";
    }
  });

  // Wire up individual vault type toggles
  document.querySelectorAll("[data-vault]").forEach(header => {
    header.addEventListener("click", () => {
      const key = header.dataset.vault;
      const body = document.querySelector(`[data-vault-body="${key}"]`);
      const icon = header.querySelector(".vault-type-toggle");
      if (body.style.display === "none") {
        body.style.display = "block";
        icon.textContent = "−";
        vaultSectionsOpen[key] = true;
      } else {
        body.style.display = "none";
        icon.textContent = "+";
        vaultSectionsOpen[key] = false;
      }
    });
  });

  // Wire up author removal
  document.querySelectorAll("[data-author-idx]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.authorIdx);
      selectedAuthors.splice(idx, 1);
      renderSubmitTab();
    });
  });

  // Wire up author selection
  const authorSelect = document.getElementById("author-select");
  if (authorSelect) {
    authorSelect.addEventListener("change", () => {
      const val = authorSelect.value;
      if (val === "__custom__") {
        // Replace select with manual input
        const parent = authorSelect.parentNode;
        const input = document.createElement("input");
        input.type = "text";
        input.id = "author-manual-inline";
        input.placeholder = "Type author name and press Enter";
        input.style.cssText = "display:block;width:100%;padding:6px 8px;margin-bottom:4px;border:1px solid #DCD8D0;border-radius:3px;font-size:11px;background:#fff;";
        parent.insertBefore(input, authorSelect);
        authorSelect.style.display = "none";
        input.focus();
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const name = input.value.trim();
            if (name && selectedAuthors.length < 10 && !selectedAuthors.includes(name)) {
              selectedAuthors.push(name);
              renderSubmitTab();
            }
          }
        });
      } else if (val && selectedAuthors.length < 10 && !selectedAuthors.includes(val)) {
        selectedAuthors.push(val);
        renderSubmitTab();
      }
    });
  }

  // Wire up manual author input
  const authorManual = document.getElementById("author-manual");
  if (authorManual) {
    authorManual.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const name = authorManual.value.trim();
        if (name && selectedAuthors.length < 10 && !selectedAuthors.includes(name)) {
          selectedAuthors.push(name);
          renderSubmitTab();
        }
      }
    });
  }

  // Wire up submit
  document.getElementById("btn-submit").addEventListener("click", doSubmit);

  // Wire up live preview — update headline on page as user types
  const replacementInput = document.getElementById("sub-replacement");
  if (replacementInput) {
    let previewTimer = null;
    replacementInput.addEventListener("input", () => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        sendPreviewMessage(replacementInput.value);
      }, 100); // debounce 100ms for smooth typing
    });
    // Clear preview when popup closes or field is cleared
    replacementInput.addEventListener("blur", () => {
      // Don't clear on blur — popup stays open
    });
  }

  // Auto-detect headline and authors from current page
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
      // Auto-detect authors
      sendMsg(tab.id, { type: "TA_GET_AUTHORS" }, (response) => {
        if (response && response.authors && response.authors.length > 0) {
          detectedAuthors = response.authors.slice(0, 10);
          // Auto-select detected authors if none selected yet
          if (selectedAuthors.length === 0) {
            selectedAuthors = [...detectedAuthors];
            renderSubmitTab();
          }
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
  const replacementEl = document.getElementById("sub-replacement");
  const replacement = replacementEl ? replacementEl.value.trim() : "";
  const reasoning = document.getElementById("sub-reasoning").value.trim();
  const isAffirm = submitType === "affirmation";

  if (!originalHeadline || !reasoning) {
    msgEl.className = "submit-msg error";
    msgEl.textContent = "Headline and reasoning are required.";
    msgEl.style.display = "block";
    return;
  }
  if (!isAffirm && !replacement) {
    msgEl.className = "submit-msg error";
    msgEl.textContent = "A corrected headline is required for corrections.";
    msgEl.style.display = "block";
    return;
  }

  msgEl.style.display = "none";

  // Submit the correction/affirmation
  const result = await TA.submitCorrection({
    submissionType: submitType,
    url,
    originalHeadline,
    replacement: isAffirm ? null : replacement,
    reasoning,
    author: selectedAuthors.length > 0 ? selectedAuthors.join(", ") : null,
    orgId,
  });

  if (result.error) {
    msgEl.className = "submit-msg error";
    msgEl.textContent = result.error;
    msgEl.style.display = "block";
    return;
  }

  // Link vault artifacts to the submission so they graduate through jury review
  const submissionId = result.id;
  const vaultPromises = [];

  // Standing Correction
  const scAssertion = document.getElementById("vault-sc-assertion");
  const scEvidence = document.getElementById("vault-sc-evidence");
  if (scAssertion && scAssertion.value.trim() && scEvidence && scEvidence.value.trim()) {
    vaultPromises.push(TA.submitVault({
      type: "vault",
      orgId,
      submissionId,
      assertion: scAssertion.value.trim(),
      evidence: scEvidence.value.trim(),
    }));
  }

  // Argument
  const argContent = document.getElementById("vault-arg-content");
  if (argContent && argContent.value.trim()) {
    vaultPromises.push(TA.submitVault({
      type: "argument",
      orgId,
      submissionId,
      content: argContent.value.trim(),
    }));
  }

  // Belief
  const beliefContent = document.getElementById("vault-belief-content");
  if (beliefContent && beliefContent.value.trim()) {
    vaultPromises.push(TA.submitVault({
      type: "belief",
      orgId,
      submissionId,
      content: beliefContent.value.trim(),
    }));
  }

  // Translation
  const transOrig = document.getElementById("vault-trans-original");
  const transTrans = document.getElementById("vault-trans-translated");
  const transType = document.getElementById("vault-trans-type");
  if (transOrig && transOrig.value.trim() && transTrans && transTrans.value.trim()) {
    vaultPromises.push(TA.submitVault({
      type: "translation",
      orgId,
      submissionId,
      original: transOrig.value.trim(),
      translated: transTrans.value.trim(),
      translationType: transType ? transType.value : "clarity",
    }));
  }

  // Fire vault submissions in parallel (don't block on them)
  if (vaultPromises.length > 0) {
    Promise.all(vaultPromises).catch(e => {
      console.warn("[Trust Assembly] Vault submission error:", e.message);
    });
  }

  msgEl.className = "submit-msg success";
  msgEl.textContent = isAffirm
    ? "Affirmation submitted! It will appear after review."
    : "Correction submitted! It will appear after review.";
  if (vaultPromises.length > 0) {
    msgEl.textContent += ` ${vaultPromises.length} vault artifact(s) linked — they'll be reviewed with your submission.`;
  }
  msgEl.style.display = "block";

  // Clear form and preview
  document.getElementById("sub-headline").value = "";
  if (replacementEl) replacementEl.value = "";
  document.getElementById("sub-reasoning").value = "";
  selectedAuthors = [];
  vaultSectionsOpen = {};
  clearPreviewMessage();
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

// ── Live Preview ──
// Sends the current replacement text to the content script for real-time
// headline preview on the page. Called on every keystroke (debounced).
async function sendPreviewMessage(text) {
  try {
    const tabs = typeof chrome !== "undefined" && chrome.tabs
      ? await chrome.tabs.query({ active: true, currentWindow: true })
      : await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.id) return;
    const headlineInput = document.getElementById("sub-headline");
    const originalHeadline = headlineInput ? headlineInput.value.trim() : "";
    const sendMsg = (typeof chrome !== "undefined" && chrome.tabs)
      ? chrome.tabs.sendMessage.bind(chrome.tabs)
      : browser.tabs.sendMessage.bind(browser.tabs);
    sendMsg(tab.id, {
      type: "TA_PREVIEW_HEADLINE",
      text: text,
      originalHeadline: originalHeadline,
      isAffirm: submitType === "affirmation"
    }, () => {
      // Ignore errors (tab might not have content script)
      if (typeof chrome !== "undefined" && chrome.runtime?.lastError) {}
    });
  } catch (e) {
    // Content script may not be loaded on this page
  }
}

// Clear preview when submitting or switching tabs
async function clearPreviewMessage() {
  try {
    const tabs = typeof chrome !== "undefined" && chrome.tabs
      ? await chrome.tabs.query({ active: true, currentWindow: true })
      : await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.id) return;
    const sendMsg = (typeof chrome !== "undefined" && chrome.tabs)
      ? chrome.tabs.sendMessage.bind(chrome.tabs)
      : browser.tabs.sendMessage.bind(browser.tabs);
    sendMsg(tab.id, { type: "TA_CLEAR_PREVIEW" }, () => {
      if (typeof chrome !== "undefined" && chrome.runtime?.lastError) {}
    });
  } catch (e) {}
}

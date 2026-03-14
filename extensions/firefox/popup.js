/**
 * Trust Assembly Extension — Popup Script
 * Handles: corrections display, login, follow, submit, color-coding, conflict resolution,
 * state persistence, floating window, body corrections, multi-vault, multi-assembly
 */

let currentUrl = null;
let currentUser = null;
let userAssemblies = null; // { joined: [], followed: [] }

// ── Form state persistence ──
const FORM_STATE_KEY = "ta-form-draft";
let formState = {
  submitType: "correction",
  headline: "",
  replacement: "",
  reasoning: "",
  selectedAuthors: [],
  selectedOrgIds: [],
  inlineEdits: [],
  vaultItems: { correction: [], argument: [], belief: [], translation: [] },
  vaultSectionsOpen: {},
  vaultBodyOpen: false,
  inlineEditsOpen: false,
};

async function saveFormState() {
  try {
    await storageSet({ [FORM_STATE_KEY]: JSON.stringify(formState) });
  } catch (e) {}
}

async function loadFormState() {
  try {
    const result = await storageGet([FORM_STATE_KEY]);
    if (result[FORM_STATE_KEY]) {
      const saved = JSON.parse(result[FORM_STATE_KEY]);
      formState = { ...formState, ...saved };
    }
  } catch (e) {}
}

async function clearFormState() {
  formState = {
    submitType: "correction",
    headline: "",
    replacement: "",
    reasoning: "",
    selectedAuthors: [],
    selectedOrgIds: [],
    inlineEdits: [],
    vaultItems: { correction: [], argument: [], belief: [], translation: [] },
    vaultSectionsOpen: {},
    vaultBodyOpen: false,
    inlineEditsOpen: false,
  };
  try { await storageSet({ [FORM_STATE_KEY]: "" }); } catch (e) {}
}

// Debounced save on input changes
let saveTimer = null;
function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveFormState, 300);
}

// Capture current form field values into formState
function captureFormFields() {
  const headline = document.getElementById("sub-headline");
  const replacement = document.getElementById("sub-replacement");
  const reasoning = document.getElementById("sub-reasoning");
  if (headline) formState.headline = headline.value;
  if (replacement) formState.replacement = replacement.value;
  if (reasoning) formState.reasoning = reasoning.value;

  // Capture selected org checkboxes
  const checkboxes = document.querySelectorAll(".org-checkbox:checked");
  if (checkboxes.length > 0) {
    formState.selectedOrgIds = Array.from(checkboxes).map(cb => cb.value);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Load saved form state first
  await loadFormState();

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

  // Wire up detach button
  const detachBtn = document.getElementById("btn-detach");
  if (detachBtn) {
    detachBtn.addEventListener("click", detachToWindow);
  }
});

// ── Detach to floating window ──
async function detachToWindow() {
  // Save current form state before detaching
  captureFormFields();
  await saveFormState();

  const popupUrl = typeof chrome !== "undefined" && chrome.runtime
    ? chrome.runtime.getURL("popup.html")
    : browser.runtime.getURL("popup.html");

  const createWindow = typeof chrome !== "undefined" && chrome.windows
    ? chrome.windows.create.bind(chrome.windows)
    : browser.windows.create.bind(browser.windows);

  createWindow({
    url: popupUrl + "?detached=1",
    type: "popup",
    width: 420,
    height: 700,
    top: 100,
    left: Math.max(0, screen.width - 460),
  });

  // Close the popup
  window.close();
}

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
      html += renderCorrectionItem(group.winner);
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
      <div class="headline-new">${escapeHtml(sub.replacement)}<div class="headline-original-tooltip"><div class="tooltip-label">Original Headline</div>${escapeHtml(sub.originalHeadline)}</div></div>
    </div>
  `;
}

// ── Conflict resolution ──
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
let detectedAuthors = []; // auto-detected from page

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

  const isAffirm = formState.submitType === "affirmation";

  // Multi-assembly checkboxes
  const orgCheckboxesHtml = joinedOrgs.map(o => {
    const checked = formState.selectedOrgIds.length > 0
      ? formState.selectedOrgIds.includes(o.id) ? "checked" : ""
      : joinedOrgs.length === 1 ? "checked" : "";
    return `<label class="org-checkbox-label"><input type="checkbox" class="org-checkbox" value="${escapeHtml(o.id)}" ${checked}> ${escapeHtml(o.name)}</label>`;
  }).join("");

  // Author tags HTML
  let authorTagsHtml = formState.selectedAuthors.map((a, i) =>
    `<span class="author-tag">${escapeHtml(a)}<span class="remove" data-author-idx="${i}">&times;</span></span>`
  ).join("");

  // Inline edits (body corrections) HTML
  let inlineEditsHtml = formState.inlineEdits.map((edit, i) => `
    <div class="inline-edit-entry" data-edit-idx="${i}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:10px;font-weight:600;color:#1B2A4A">Body Edit #${i + 1}</span>
        <span class="remove-edit" data-edit-remove="${i}" style="cursor:pointer;color:#C4573F;font-size:12px">&times; Remove</span>
      </div>
      <input type="text" class="edit-original" data-edit-field="original" data-edit-idx="${i}" placeholder="Original text from article" value="${escapeHtml(edit.original || "")}">
      <input type="text" class="edit-replacement" data-edit-field="replacement" data-edit-idx="${i}" placeholder="Corrected text" value="${escapeHtml(edit.replacement || "")}">
      <input type="text" class="edit-reasoning" data-edit-field="reasoning" data-edit-idx="${i}" placeholder="Why this change? (optional)" value="${escapeHtml(edit.reasoning || "")}">
    </div>
  `).join("");

  // Build vault items HTML for each type supporting multiples
  function buildVaultItemsHtml(type, items, config) {
    let html = items.map((item, i) => {
      let fieldsHtml = "";
      config.fields.forEach(f => {
        if (f.type === "textarea") {
          fieldsHtml += `<textarea class="vault-item-field" data-vault-type="${type}" data-vault-idx="${i}" data-vault-field="${f.key}" placeholder="${f.placeholder}">${escapeHtml(item[f.key] || "")}</textarea>`;
        } else if (f.type === "select") {
          const opts = f.options.map(o => `<option value="${o.value}" ${item[f.key] === o.value ? "selected" : ""}>${o.label}</option>`).join("");
          fieldsHtml += `<select class="vault-item-field" data-vault-type="${type}" data-vault-idx="${i}" data-vault-field="${f.key}">${opts}</select>`;
        } else {
          fieldsHtml += `<input type="text" class="vault-item-field" data-vault-type="${type}" data-vault-idx="${i}" data-vault-field="${f.key}" placeholder="${f.placeholder}" value="${escapeHtml(item[f.key] || "")}">`;
        }
      });
      return `
        <div class="vault-multi-entry" style="margin-bottom:6px;padding:6px;background:#FDFBF5;border:1px solid #EBE8E2;border-radius:3px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:9px;color:#7A7570">#${i + 1}</span>
            <span class="remove-vault-item" data-vault-type="${type}" data-vault-remove="${i}" style="cursor:pointer;color:#C4573F;font-size:11px">&times;</span>
          </div>
          ${fieldsHtml}
        </div>
      `;
    }).join("");
    html += `<button class="add-vault-item-btn" data-vault-add="${type}" style="font-size:10px;color:#B8963E;background:none;border:1px dashed #DCD8D0;padding:4px 8px;border-radius:3px;cursor:pointer;width:100%;margin-top:4px">+ Add another ${config.label}</button>`;
    return html;
  }

  const vaultConfigs = {
    correction: {
      label: "standing correction",
      fields: [
        { key: "assertion", type: "text", placeholder: "Factual assertion (e.g. 'The recall was software-only')" },
        { key: "evidence", type: "text", placeholder: "Supporting evidence or source URL" },
      ]
    },
    argument: {
      label: "argument",
      fields: [
        { key: "content", type: "textarea", placeholder: "The argument (e.g. 'Correlation does not imply causation…')" },
      ]
    },
    belief: {
      label: "belief",
      fields: [
        { key: "content", type: "textarea", placeholder: "The belief (e.g. 'Free speech includes speech we disagree with')" },
      ]
    },
    translation: {
      label: "translation",
      fields: [
        { key: "original", type: "text", placeholder: "Original term or phrase" },
        { key: "translated", type: "text", placeholder: "Plain-language replacement" },
        { key: "translationType", type: "select", options: [
          { value: "clarity", label: "Clarity" },
          { value: "propaganda", label: "Anti-Propaganda" },
          { value: "euphemism", label: "Euphemism" },
          { value: "satirical", label: "Satirical" },
        ]},
      ]
    },
  };

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

      ${isAffirm ? '<div class="affirm-banner">You are affirming this headline is <strong>accurate</strong>. The original headline will be wrapped in green to signal accuracy. No replacement needed.</div>' : ''}

      <label>Submit to Assembly(s) ${joinedOrgs.length > 1 ? '<span style="font-size:9px;color:#B0A89C;font-weight:400">— select one or more</span>' : ''}</label>
      <div class="org-checkboxes" id="org-checkboxes">${orgCheckboxesHtml}</div>

      <label>Article URL</label>
      <input type="text" id="sub-url" value="${escapeHtml(currentUrl || "")}" readonly>

      <label>Original Headline</label>
      <input type="text" id="sub-headline" placeholder="Detecting headline…" value="${escapeHtml(formState.headline || "")}">

      ${!isAffirm ? `
        <label>Corrected Headline</label>
        <input type="text" id="sub-replacement" placeholder="Your proposed correction" value="${escapeHtml(formState.replacement || "")}">
      ` : ''}

      <label>Author(s) <span style="font-size:9px;color:#B0A89C;font-weight:400">— auto-detected from page</span></label>
      <div class="author-tags" id="author-tags">${authorTagsHtml}</div>
      ${detectedAuthors.length > 0 && formState.selectedAuthors.length < 10 ? `
        <select id="author-select" style="margin-bottom:4px">
          <option value="">Add an author…</option>
          ${detectedAuthors.filter(a => !formState.selectedAuthors.includes(a)).map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("")}
          <option value="__custom__">Enter manually…</option>
        </select>
      ` : formState.selectedAuthors.length < 10 ? `
        <input type="text" id="author-manual" placeholder="Type author name and press Enter" style="margin-bottom:4px">
      ` : ''}
      <div class="author-hint">${formState.selectedAuthors.length}/10 authors max</div>

      <label>Reasoning</label>
      <textarea id="sub-reasoning" placeholder="${isAffirm ? 'Why is this headline accurate?' : 'Why is this correction needed?'}">${escapeHtml(formState.reasoning || "")}</textarea>

      <!-- Body Corrections (inline edits) -->
      <div class="vault-section">
        <div class="vault-section-title" id="inline-edits-toggle">${formState.inlineEditsOpen ? '−' : '+'} Body Corrections (optional)</div>
        <div id="inline-edits-body" style="display:${formState.inlineEditsOpen ? 'block' : 'none'}">
          <div style="font-size:10px; color:#7A7570; margin-bottom:8px; line-height:1.4;">Correct specific text within the article body. Select the original text and provide the corrected version.</div>
          <div id="inline-edits-list">${inlineEditsHtml}</div>
          ${formState.inlineEdits.length === 0 ? `<button id="add-first-edit" class="add-vault-item-btn" style="font-size:10px;color:#B8963E;background:none;border:1px dashed #DCD8D0;padding:4px 8px;border-radius:3px;cursor:pointer;width:100%">+ Add a body correction</button>` : ''}
        </div>
      </div>

      <!-- Vault Artifacts (optional) -->
      <div class="vault-section">
        <div class="vault-section-title" id="vault-toggle">${formState.vaultBodyOpen ? '−' : '+'} Vault Artifacts (optional)</div>
        <div id="vault-body" style="display:${formState.vaultBodyOpen ? 'block' : 'none'}">
          <div style="font-size:10px; color:#7A7570; margin-bottom:8px; line-height:1.4;">Optionally add entries to your assembly's vaults alongside this submission. You can add multiple of each type.</div>

          <!-- Standing Correction -->
          <div class="vault-type-row vault-color-correction">
            <div class="vault-type-header" data-vault="correction">
              <span class="vault-type-label">Standing Corrections</span>
              <span class="vault-type-toggle">${formState.vaultSectionsOpen.correction ? '−' : '+'}</span>
            </div>
            <div class="vault-type-body" style="display:${formState.vaultSectionsOpen.correction ? 'block' : 'none'}" data-vault-body="correction">
              <div class="vault-type-desc">Reusable verified facts for your assembly's Fact Vault.</div>
              ${buildVaultItemsHtml("correction", formState.vaultItems.correction, vaultConfigs.correction)}
            </div>
          </div>

          <!-- Argument -->
          <div class="vault-type-row vault-color-argument">
            <div class="vault-type-header" data-vault="argument">
              <span class="vault-type-label">Arguments</span>
              <span class="vault-type-toggle">${formState.vaultSectionsOpen.argument ? '−' : '+'}</span>
            </div>
            <div class="vault-type-body" style="display:${formState.vaultSectionsOpen.argument ? 'block' : 'none'}" data-vault-body="argument">
              <div class="vault-type-desc">Fundamental arguments for reuse across articles.</div>
              ${buildVaultItemsHtml("argument", formState.vaultItems.argument, vaultConfigs.argument)}
            </div>
          </div>

          <!-- Belief -->
          <div class="vault-type-row vault-color-belief">
            <div class="vault-type-header" data-vault="belief">
              <span class="vault-type-label">Foundational Beliefs</span>
              <span class="vault-type-toggle">${formState.vaultSectionsOpen.belief ? '−' : '+'}</span>
            </div>
            <div class="vault-type-body" style="display:${formState.vaultSectionsOpen.belief ? 'block' : 'none'}" data-vault-body="belief">
              <div class="vault-type-desc">Core axioms or starting premises, not claims of fact.</div>
              ${buildVaultItemsHtml("belief", formState.vaultItems.belief, vaultConfigs.belief)}
            </div>
          </div>

          <!-- Translation -->
          <div class="vault-type-row vault-color-translation">
            <div class="vault-type-header" data-vault="translation">
              <span class="vault-type-label">Translations</span>
              <span class="vault-type-toggle">${formState.vaultSectionsOpen.translation ? '−' : '+'}</span>
            </div>
            <div class="vault-type-body" style="display:${formState.vaultSectionsOpen.translation ? 'block' : 'none'}" data-vault-body="translation">
              <div class="vault-type-desc">Plain-language replacements for jargon, spin, or propaganda.</div>
              ${buildVaultItemsHtml("translation", formState.vaultItems.translation, vaultConfigs.translation)}
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

  // ── Wire up event listeners ──

  // Type toggle (save on change, but don't re-render to avoid losing unsaved field values)
  document.getElementById("btn-type-correction").addEventListener("click", () => {
    captureFormFields();
    formState.submitType = "correction";
    debouncedSave();
    renderSubmitTab();
  });
  document.getElementById("btn-type-affirmation").addEventListener("click", () => {
    captureFormFields();
    formState.submitType = "affirmation";
    debouncedSave();
    renderSubmitTab();
  });

  // Form field persistence on input
  ["sub-headline", "sub-replacement", "sub-reasoning"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => {
        if (id === "sub-headline") formState.headline = el.value;
        else if (id === "sub-replacement") formState.replacement = el.value;
        else if (id === "sub-reasoning") formState.reasoning = el.value;
        debouncedSave();
      });
    }
  });

  // Org checkbox persistence
  document.querySelectorAll(".org-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      formState.selectedOrgIds = Array.from(document.querySelectorAll(".org-checkbox:checked")).map(c => c.value);
      debouncedSave();
    });
  });

  // Inline edits toggle
  document.getElementById("inline-edits-toggle").addEventListener("click", () => {
    const body = document.getElementById("inline-edits-body");
    formState.inlineEditsOpen = body.style.display === "none";
    body.style.display = formState.inlineEditsOpen ? "block" : "none";
    document.getElementById("inline-edits-toggle").textContent = (formState.inlineEditsOpen ? "− " : "+ ") + "Body Corrections (optional)";
    debouncedSave();
  });

  // Add first inline edit
  const addFirstEdit = document.getElementById("add-first-edit");
  if (addFirstEdit) {
    addFirstEdit.addEventListener("click", () => {
      formState.inlineEdits.push({ original: "", replacement: "", reasoning: "" });
      debouncedSave();
      renderSubmitTab();
    });
  }

  // Inline edit field changes
  document.querySelectorAll(".edit-original, .edit-replacement, .edit-reasoning").forEach(el => {
    el.addEventListener("input", () => {
      const idx = parseInt(el.dataset.editIdx);
      const field = el.dataset.editField;
      if (formState.inlineEdits[idx]) {
        formState.inlineEdits[idx][field] = el.value;
        debouncedSave();
      }
    });
  });

  // Remove inline edit
  document.querySelectorAll("[data-edit-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.editRemove);
      formState.inlineEdits.splice(idx, 1);
      debouncedSave();
      renderSubmitTab();
    });
  });

  // Vault body toggle
  document.getElementById("vault-toggle").addEventListener("click", () => {
    const body = document.getElementById("vault-body");
    formState.vaultBodyOpen = body.style.display === "none";
    body.style.display = formState.vaultBodyOpen ? "block" : "none";
    document.getElementById("vault-toggle").textContent = (formState.vaultBodyOpen ? "− " : "+ ") + "Vault Artifacts (optional)";
    debouncedSave();
  });

  // Individual vault type toggles
  document.querySelectorAll("[data-vault]").forEach(header => {
    header.addEventListener("click", () => {
      const key = header.dataset.vault;
      const body = document.querySelector(`[data-vault-body="${key}"]`);
      const icon = header.querySelector(".vault-type-toggle");
      formState.vaultSectionsOpen[key] = body.style.display === "none";
      body.style.display = formState.vaultSectionsOpen[key] ? "block" : "none";
      icon.textContent = formState.vaultSectionsOpen[key] ? "−" : "+";
      debouncedSave();
    });
  });

  // Vault item field changes
  document.querySelectorAll(".vault-item-field").forEach(el => {
    el.addEventListener("input", () => {
      const type = el.dataset.vaultType;
      const idx = parseInt(el.dataset.vaultIdx);
      const field = el.dataset.vaultField;
      if (formState.vaultItems[type] && formState.vaultItems[type][idx]) {
        formState.vaultItems[type][idx][field] = el.value;
        debouncedSave();
      }
    });
    // Also capture select changes
    el.addEventListener("change", () => {
      const type = el.dataset.vaultType;
      const idx = parseInt(el.dataset.vaultIdx);
      const field = el.dataset.vaultField;
      if (formState.vaultItems[type] && formState.vaultItems[type][idx]) {
        formState.vaultItems[type][idx][field] = el.value;
        debouncedSave();
      }
    });
  });

  // Add vault item buttons
  document.querySelectorAll("[data-vault-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      captureFormFields();
      const type = btn.dataset.vaultAdd;
      const defaults = { correction: { assertion: "", evidence: "" }, argument: { content: "" }, belief: { content: "" }, translation: { original: "", translated: "", translationType: "clarity" } };
      formState.vaultItems[type].push({ ...(defaults[type] || {}) });
      debouncedSave();
      renderSubmitTab();
    });
  });

  // Remove vault item buttons
  document.querySelectorAll("[data-vault-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      captureFormFields();
      const type = btn.dataset.vaultType;
      const idx = parseInt(btn.dataset.vaultRemove);
      formState.vaultItems[type].splice(idx, 1);
      debouncedSave();
      renderSubmitTab();
    });
  });

  // Author removal
  document.querySelectorAll("[data-author-idx]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.authorIdx);
      formState.selectedAuthors.splice(idx, 1);
      debouncedSave();
      renderSubmitTab();
    });
  });

  // Author selection
  const authorSelect = document.getElementById("author-select");
  if (authorSelect) {
    authorSelect.addEventListener("change", () => {
      const val = authorSelect.value;
      if (val === "__custom__") {
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
            if (name && formState.selectedAuthors.length < 10 && !formState.selectedAuthors.includes(name)) {
              formState.selectedAuthors.push(name);
              debouncedSave();
              renderSubmitTab();
            }
          }
        });
      } else if (val && formState.selectedAuthors.length < 10 && !formState.selectedAuthors.includes(val)) {
        formState.selectedAuthors.push(val);
        debouncedSave();
        renderSubmitTab();
      }
    });
  }

  // Manual author input
  const authorManual = document.getElementById("author-manual");
  if (authorManual) {
    authorManual.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const name = authorManual.value.trim();
        if (name && formState.selectedAuthors.length < 10 && !formState.selectedAuthors.includes(name)) {
          formState.selectedAuthors.push(name);
          debouncedSave();
          renderSubmitTab();
        }
      }
    });
  }

  // Submit button
  document.getElementById("btn-submit").addEventListener("click", doSubmit);

  // Live preview for replacement headline
  const replacementInput = document.getElementById("sub-replacement");
  if (replacementInput) {
    let previewTimer = null;
    replacementInput.addEventListener("input", () => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        sendPreviewMessage(replacementInput.value);
      }, 100);
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
          formState.headline = response.headline;
          headlineInput.placeholder = "The original headline as published";
          debouncedSave();
        } else if (headlineInput) {
          headlineInput.placeholder = "The original headline as published";
        }
      });
      sendMsg(tab.id, { type: "TA_GET_AUTHORS" }, (response) => {
        if (response && response.authors && response.authors.length > 0) {
          detectedAuthors = response.authors.slice(0, 10);
          if (formState.selectedAuthors.length === 0) {
            formState.selectedAuthors = [...detectedAuthors];
            debouncedSave();
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
  loadCorrections();
}

async function doSubmit() {
  const msgEl = document.getElementById("submit-msg");
  const url = document.getElementById("sub-url").value;
  const originalHeadline = document.getElementById("sub-headline").value.trim();
  const replacementEl = document.getElementById("sub-replacement");
  const replacement = replacementEl ? replacementEl.value.trim() : "";
  const reasoning = document.getElementById("sub-reasoning").value.trim();
  const isAffirm = formState.submitType === "affirmation";

  // Get selected assemblies
  const selectedOrgs = Array.from(document.querySelectorAll(".org-checkbox:checked")).map(c => c.value);

  if (selectedOrgs.length === 0) {
    msgEl.className = "submit-msg error";
    msgEl.textContent = "Select at least one assembly.";
    msgEl.style.display = "block";
    return;
  }
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

  // Disable submit button and show loading
  const btnSubmit = document.getElementById("btn-submit");
  btnSubmit.disabled = true;
  btnSubmit.textContent = "Submitting…";
  msgEl.style.display = "none";

  // Collect inline edits
  const inlineEdits = formState.inlineEdits
    .filter(e => e.original && e.replacement)
    .map(e => ({ original: e.original, replacement: e.replacement, reasoning: e.reasoning || null }));

  // Submit the correction/affirmation (multi-assembly via orgIds)
  const result = await TA.submitCorrection({
    submissionType: formState.submitType,
    url,
    originalHeadline,
    replacement: isAffirm ? null : replacement,
    reasoning,
    author: formState.selectedAuthors.length > 0 ? formState.selectedAuthors.join(", ") : null,
    orgIds: selectedOrgs,
    inlineEdits: inlineEdits.length > 0 ? inlineEdits : undefined,
  });

  if (result.error) {
    msgEl.className = "submit-msg error";
    msgEl.textContent = result.error;
    msgEl.style.display = "block";
    btnSubmit.disabled = false;
    btnSubmit.textContent = isAffirm ? "Submit Affirmation" : "Submit Correction";
    return;
  }

  // Get submission ID(s) for vault linking
  const submissionIds = result.submissions
    ? result.submissions.map(s => s.id)
    : result.id ? [result.id] : [];

  // Submit vault artifacts — link to all submissions, submit to all selected orgs
  const vaultPromises = [];

  for (const item of formState.vaultItems.correction) {
    if (item.assertion && item.evidence) {
      for (const subId of submissionIds) {
        vaultPromises.push(TA.submitVault({
          type: "vault",
          orgIds: selectedOrgs,
          submissionId: subId,
          assertion: item.assertion.trim(),
          evidence: item.evidence.trim(),
        }));
      }
    }
  }

  for (const item of formState.vaultItems.argument) {
    if (item.content) {
      for (const subId of submissionIds) {
        vaultPromises.push(TA.submitVault({
          type: "argument",
          orgIds: selectedOrgs,
          submissionId: subId,
          content: item.content.trim(),
        }));
      }
    }
  }

  for (const item of formState.vaultItems.belief) {
    if (item.content) {
      for (const subId of submissionIds) {
        vaultPromises.push(TA.submitVault({
          type: "belief",
          orgIds: selectedOrgs,
          submissionId: subId,
          content: item.content.trim(),
        }));
      }
    }
  }

  for (const item of formState.vaultItems.translation) {
    if (item.original && item.translated) {
      for (const subId of submissionIds) {
        vaultPromises.push(TA.submitVault({
          type: "translation",
          orgIds: selectedOrgs,
          submissionId: subId,
          original: item.original.trim(),
          translated: item.translated.trim(),
          translationType: item.translationType || "clarity",
        }));
      }
    }
  }

  if (vaultPromises.length > 0) {
    Promise.all(vaultPromises).catch(e => {
      console.warn("[Trust Assembly] Vault submission error:", e.message);
    });
  }

  const orgCount = selectedOrgs.length;
  msgEl.className = "submit-msg success";
  msgEl.textContent = isAffirm
    ? `Affirmation submitted to ${orgCount} assembly${orgCount > 1 ? "s" : ""}! It will appear after review.`
    : `Correction submitted to ${orgCount} assembly${orgCount > 1 ? "s" : ""}! It will appear after review.`;
  if (inlineEdits.length > 0) {
    msgEl.textContent += ` ${inlineEdits.length} body correction(s) included.`;
  }
  if (vaultPromises.length > 0) {
    msgEl.textContent += ` ${vaultPromises.length} vault artifact(s) linked.`;
  }
  msgEl.style.display = "block";

  btnSubmit.disabled = false;
  btnSubmit.textContent = isAffirm ? "Submit Affirmation" : "Submit Correction";

  // Clear form state and preview
  await clearFormState();
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

  if (!userAssemblies) {
    userAssemblies = await TA.getMyAssemblies();
  }

  let html = '<div class="assemblies-panel">';

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
      isAffirm: formState.submitType === "affirmation"
    }, () => {
      if (typeof chrome !== "undefined" && chrome.runtime?.lastError) {}
    });
  } catch (e) {}
}

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

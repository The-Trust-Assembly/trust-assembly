/**
 * Trust Assembly Extension — API Client
 * Shared across Chrome, Firefox, and Safari extensions.
 *
 * Configure API_BASE before deployment.
 * In development, this points to localhost.
 * In production, this points to your Trust Assembly API server.
 */

const API_BASE = "https://trustassembly.org";
const TOKEN_KEY = "ta-auth-token";
const USER_KEY = "ta-auth-user";
const OWN_PENDING_KEY = "ta-own-pending-submissions-v1";
const OWN_PENDING_TTL = 30 * 24 * 60 * 60 * 1000;

// ── Storage helpers (cross-browser) ──
function getStorage() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) return chrome.storage.local;
  if (typeof browser !== "undefined" && browser.storage && browser.storage.local) return browser.storage.local;
  return null;
}

function storageGet(keys) {
  return new Promise((resolve) => {
    const s = getStorage();
    if (!s) { resolve({}); return; }
    s.get(keys, resolve);
  });
}

function storageSet(obj) {
  return new Promise((resolve) => {
    const s = getStorage();
    if (!s) { resolve(); return; }
    s.set(obj, resolve);
  });
}

function storageRemove(keys) {
  return new Promise((resolve) => {
    const s = getStorage();
    if (!s) { resolve(); return; }
    s.remove(keys, resolve);
  });
}

const TA = {
  // ── Auth helpers ──

  async _getToken() {
    const result = await storageGet([TOKEN_KEY]);
    return result[TOKEN_KEY] || null;
  },

  async _authHeaders() {
    const token = await this._getToken();
    if (!token) return {};
    return { "Authorization": "Bearer " + token };
  },

  async _authedFetch(url, opts = {}) {
    const headers = { ...opts.headers, ...(await this._authHeaders()) };
    const res = await fetch(url, { ...opts, headers });
    // Auto-clear expired tokens
    if (res.status === 401) {
      await storageRemove([TOKEN_KEY, USER_KEY, "ta-assemblies", OWN_PENDING_KEY]);
    }
    return res;
  },

  /**
   * Log in and store token. Returns user data or null on failure.
   */
  async login(username, password) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.token) {
        const previous = await this.getStoredUser();
        if (previous?.id && previous.id !== data.id) {
          await storageRemove([OWN_PENDING_KEY]);
        }
        await storageSet({
          [TOKEN_KEY]: data.token,
          [USER_KEY]: JSON.stringify({ username: data.username, displayName: data.displayName, id: data.id }),
        });
      }
      return data;
    } catch (e) {
      console.warn("[Trust Assembly] Login failed:", e.message);
      return null;
    }
  },

  /**
   * Clear stored auth.
   */
  async logout() {
    await storageRemove([TOKEN_KEY, USER_KEY, "ta-assemblies", OWN_PENDING_KEY]);
  },

  /**
   * Get stored user (from local storage, no network call).
   */
  async getStoredUser() {
    const result = await storageGet([USER_KEY]);
    try { return result[USER_KEY] ? JSON.parse(result[USER_KEY]) : null; } catch { return null; }
  },

  /**
   * Verify session is still valid (network call).
   */
  async getMe() {
    try {
      const res = await this._authedFetch(`${API_BASE}/api/auth/me`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  // ── Assemblies ──

  /**
   * Get user's joined + followed assemblies.
   */
  async getMyAssemblies() {
    try {
      const res = await this._authedFetch(`${API_BASE}/api/users/me/assemblies`);
      if (!res.ok) {
        return {
          joined: [],
          followed: [],
          error: res.status === 401
            ? "Your session has expired. Sign out and sign in again."
            : "Could not verify your assembly memberships.",
        };
      }
      const data = await res.json();
      const normalized = {
        joined: Array.isArray(data.joined) ? data.joined : [],
        followed: Array.isArray(data.followed) ? data.followed : [],
      };
      // Cache locally for badge rendering
      await storageSet({ "ta-assemblies": JSON.stringify(normalized) });
      return normalized;
    } catch (e) {
      return {
        joined: [],
        followed: [],
        error: "Could not reach Trust Assembly to verify your memberships.",
      };
    }
  },

  /**
   * Get cached assemblies (no network call).
   */
  async getCachedAssemblies() {
    const result = await storageGet(["ta-assemblies"]);
    try { return result["ta-assemblies"] ? JSON.parse(result["ta-assemblies"]) : null; } catch { return null; }
  },

  /**
   * Follow an assembly.
   */
  async followOrg(id) {
    try {
      const res = await this._authedFetch(`${API_BASE}/api/orgs/${encodeURIComponent(id)}/follow`, {
        method: "POST",
      });
      if (!res.ok) return null;
      const data = await res.json();
      await storageRemove(["ta-assemblies"]);
      return data;
    } catch (e) {
      return null;
    }
  },

  /**
   * Unfollow an assembly.
   */
  async unfollowOrg(id) {
    try {
      const res = await this._authedFetch(`${API_BASE}/api/orgs/${encodeURIComponent(id)}/follow`, {
        method: "DELETE",
      });
      if (!res.ok) return null;
      const data = await res.json();
      await storageRemove(["ta-assemblies"]);
      return data;
    } catch (e) {
      return null;
    }
  },

  // ── Submissions ──

  /**
   * Submit a correction or affirmation from the extension.
   * Supports orgId (single) or orgIds (array) for multi-assembly submission.
   */
  async submitCorrection(data) {
    try {
      const res = await this._authedFetch(`${API_BASE}/api/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { error: errBody.error || `Submission failed (${res.status})` };
      }
      return await res.json();
    } catch (e) {
      return { error: e.message };
    }
  },

  /** Cache a successful submission locally for its author's pending preview. */
  async cacheOwnSubmissionPreviews(payload, result, assemblies, user) {
    const created = Array.isArray(result?.submissions)
      ? result.submissions
      : result?.id ? [result] : [];
    if (created.length === 0 || !payload?.url) return;

    const orgIds = Array.isArray(payload.orgIds) && payload.orgIds.length > 0
      ? payload.orgIds
      : payload.orgId ? [payload.orgId] : [];
    const orgList = [...(assemblies?.joined || []), ...(assemblies?.followed || [])];
    const now = Date.now();
    const stored = await storageGet([OWN_PENDING_KEY]);
    let entries = [];
    try {
      entries = JSON.parse(stored[OWN_PENDING_KEY] || "[]");
      if (!Array.isArray(entries)) entries = [];
    } catch (_) { entries = []; }

    entries = entries.filter(entry => (
      entry && typeof entry.id === "string" && now - Number(entry.cachedAt || 0) < OWN_PENDING_TTL
    ));
    const newIds = new Set(created.map(item => item.id));
    entries = entries.filter(entry => !newIds.has(entry.id));

    created.forEach((item, index) => {
      const status = item.status || "pending_review";
      if (["approved", "consensus", "rejected", "consensus_rejected"].includes(status)) return;
      const orgId = orgIds[index] || orgIds[0] || "";
      const org = orgList.find(candidate => candidate.id === orgId);
      entries.push({
        id: item.id,
        url: payload.url,
        submissionType: payload.submissionType,
        originalHeadline: payload.originalHeadline,
        replacement: payload.replacement || "",
        reasoning: payload.reasoning,
        author: payload.author || "",
        evidence: Array.isArray(payload.evidence) ? payload.evidence : [],
        inlineEdits: Array.isArray(payload.inlineEdits) ? payload.inlineEdits : [],
        submittedBy: user?.username || "You",
        orgId,
        orgName: org?.name || "Your Assembly",
        status,
        trustScore: null,
        profile: { displayName: user?.displayName || user?.username || "You" },
        isOwnSubmission: true,
        cachedAt: now,
      });
    });

    await storageSet({ [OWN_PENDING_KEY]: JSON.stringify(entries.slice(-100)) });
  },

  /**
   * Submit a vault artifact (standing correction, argument, belief, or translation).
   * Supports orgId (single) or orgIds (array) for multi-assembly submission.
   */
  async submitVault(data) {
    try {
      const res = await this._authedFetch(`${API_BASE}/api/vault`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { error: errBody.error || `Vault submission failed (${res.status})` };
      }
      return await res.json();
    } catch (e) {
      return { error: e.message };
    }
  },

  // ── Existing endpoints ──

  /**
   * Fetch all corrections, affirmations, and translations for a URL.
   * Returns: { corrections: [], affirmations: [], translations: [], meta: {} }
   */
  async getForURL(url) {
    try {
      const encoded = encodeURIComponent(url);
      const res = await fetch(`${API_BASE}/api/corrections?url=${encoded}`);
      if (!res.ok) return { corrections: [], affirmations: [], translations: [], meta: {} };
      const data = await res.json();
      // Normalize: older API versions may return flat array
      if (Array.isArray(data)) {
        return {
          corrections: data.filter(s => s.submissionType !== "affirmation"),
          affirmations: data.filter(s => s.submissionType === "affirmation"),
          translations: [],
          meta: {}
        };
      }
      return {
        corrections: data.corrections || [],
        affirmations: data.affirmations || [],
        translations: data.translations || [],
        meta: data.meta || {}
      };
    } catch (e) {
      console.warn("[Trust Assembly] API unreachable:", e.message);
      return { corrections: [], affirmations: [], translations: [], meta: {} };
    }
  },

  /**
   * Fetch Trust Score and profile for a citizen.
   */
  async getProfile(username) {
    try {
      const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(username)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  /**
   * Fetch Assembly details.
   */
  async getAssembly(id) {
    try {
      const res = await fetch(`${API_BASE}/api/orgs/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  /**
   * Fetch active translations for an Assembly.
   * These are applied inline by the content script.
   */
  async getTranslations(orgId) {
    try {
      const query = new URLSearchParams({
        type: "translation",
        orgId,
        status: "approved",
        limit: "100",
      });
      const res = await fetch(`${API_BASE}/api/vault?${query.toString()}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.entries || []).map(entry => ({
        ...entry,
        original: entry.original_text,
        translated: entry.translated_text,
        type: entry.translation_type,
        orgName: entry.org_name,
      }));
    } catch (e) {
      return [];
    }
  },

  /**
   * Fetch pending notifications for the current user.
   * Returns: { totalPending, jury, applications, updates }
   */
  async getNotifications() {
    try {
      const res = await this._authedFetch(`${API_BASE}/api/users/me/notifications`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  // ── Drafts ──

  /**
   * List user's saved submission drafts.
   */
  async getDrafts() {
    try {
      const res = await this._authedFetch(`${API_BASE}/api/drafts`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.drafts || [];
    } catch (e) {
      return [];
    }
  },

  /**
   * Save or update a draft (upserts by URL).
   */
  async saveDraft(url, title, draftData) {
    try {
      const res = await this._authedFetch(`${API_BASE}/api/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, title, draftData }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { error: errBody.error || "Failed to save draft" };
      }
      return await res.json();
    } catch (e) {
      return { error: e.message };
    }
  },

  /**
   * Get a single draft by ID (with full draftData).
   */
  async getDraft(id) {
    try {
      const res = await this._authedFetch(`${API_BASE}/api/drafts/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.draft || null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Get draft by URL (for auto-load when visiting a page).
   */
  async getDraftByUrl(url) {
    try {
      const res = await this._authedFetch(`${API_BASE}/api/drafts/by-url?url=${encodeURIComponent(url)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.draft || null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Delete a saved draft.
   */
  async deleteDraft(id) {
    try {
      const res = await this._authedFetch(`${API_BASE}/api/drafts/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }
};

// For environments that support module exports
if (typeof module !== "undefined") module.exports = TA;

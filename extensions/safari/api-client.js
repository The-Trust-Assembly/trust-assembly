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
    return fetch(url, { ...opts, headers });
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
    await storageRemove([TOKEN_KEY, USER_KEY, "ta-assemblies"]);
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
      if (!res.ok) return { joined: [], followed: [] };
      const data = await res.json();
      // Cache locally for badge rendering
      await storageSet({ "ta-assemblies": JSON.stringify(data) });
      return data;
    } catch (e) {
      return { joined: [], followed: [] };
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
      return await res.json();
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
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  // ── Submissions ──

  /**
   * Submit a correction or affirmation from the extension.
   */
  async submitCorrection(data) {
    try {
      const res = await this._authedFetch(`${API_BASE}/api/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { error: err.error || "Submission failed" };
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
      const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(username)}/profile`);
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
      const res = await fetch(`${API_BASE}/api/assemblies/${encodeURIComponent(id)}`);
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
      const res = await fetch(`${API_BASE}/api/translations/${encodeURIComponent(orgId)}`);
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      return [];
    }
  }
};

// For environments that support module exports
if (typeof module !== "undefined") module.exports = TA;

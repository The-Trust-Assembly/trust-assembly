/**
 * Trust Assembly Extension — API Client
 * Shared across Chrome, Firefox, and Safari extensions.
 *
 * Configure API_BASE before deployment.
 * In development, this points to localhost.
 * In production, this points to your Trust Assembly API server.
 */

const API_BASE = "https://trustassembly.org";

const TA = {
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

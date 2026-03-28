import { SK } from "./constants";

const WILD_WEST_THRESHOLD = 100;

// Fetch helper. Bulk data endpoints now set short-TTL Cache-Control headers,
// so we no longer need cache-busting timestamps or no-store directives.
function noCacheFetch(url, opts) {
  return fetch(url, opts);
}

// checkSignupRate is a no-op — rate limiting is handled server-side.
export async function checkSignupRate(ipHash) {
  return null;
}

// --- Storage (relational API-backed) ---
// sG dispatches reads to relational API endpoints.
// Data is returned in the same format the SPA expects (objects keyed by ID).
export async function sG(k) {
  let url;
  switch (k) {
    case SK.SUBS:    url = "/api/data/submissions"; break;
    case SK.ORGS:    url = "/api/data/orgs"; break;
    case SK.USERS:   url = "/api/data/users"; break;
    case SK.AUDIT:   url = "/api/data/audit"; break;
    case SK.DISPUTES: url = "/api/data/disputes"; break;
    case SK.STORIES:  url = "/api/data/stories"; break;
    case SK.VAULT:   url = "/api/vault?type=vault&status=approved&limit=1000"; break;
    case SK.ARGS:    url = "/api/vault?type=argument&limit=1000"; break;
    case SK.BELIEFS: url = "/api/vault?type=belief&limit=1000"; break;
    case SK.TRANSLATIONS: url = "/api/vault?type=translation&limit=1000"; break;
    case SK.APPS: {
      // Applications are stored per-org; fetch all via orgs the user knows about
      const res = await noCacheFetch("/api/orgs?limit=1000");
      if (!res.ok) return {};
      const data = await res.json();
      const allApps = {};
      for (const org of (data.organizations || data.data || [])) {
        try {
          const appRes = await noCacheFetch(`/api/orgs/${org.id}/applications`);
          if (appRes.ok) {
            const appData = await appRes.json();
            for (const app of (appData.applications || appData.data || [])) {
              allApps[app.id] = {
                id: app.id, orgId: org.id, orgName: org.name,
                userId: app.username || app.user_id,
                reason: app.reason, link: app.link,
                mode: app.mode, sponsorsNeeded: app.sponsors_needed || 0,
                sponsors: app.sponsors || [],
                founderApproved: app.founder_approved,
                status: app.status, createdAt: app.created_at,
              };
            }
          }
        } catch {}
      }
      return allApps;
    }
    case SK.GP: {
      // Find General Public org ID from the orgs data
      const res = await noCacheFetch("/api/data/orgs");
      if (!res.ok) return null;
      const orgs = await res.json();
      for (const [id, o] of Object.entries(orgs)) {
        if (o && o.isGeneralPublic) return id;
      }
      return null;
    }
    default: {
      // Handle non-SK keys: ta-di-requests, ta-concessions, rate-limit keys
      if (k === "ta-di-requests" || k.startsWith("ta-di-")) {
        const res = await noCacheFetch("/api/di-requests");
        if (!res.ok) return {};
        const data = await res.json();
        const map = {};
        for (const r of (data.requests || [])) {
          const key = r.di_username || r.diUsername || r.id;
          map[key] = {
            diUsername: r.di_username || r.diUsername,
            partnerUsername: r.partner_username || r.partnerUsername,
            status: r.status,
            createdAt: r.created_at || r.createdAt,
          };
        }
        return map;
      }
      if (k === "ta-concessions" || k.startsWith("ta-con")) {
        const res = await noCacheFetch("/api/concessions?limit=1000");
        if (!res.ok) return {};
        const data = await res.json();
        const map = {};
        for (const c of (data.concessions || [])) {
          map[c.id] = c;
        }
        return map;
      }
      // For vault-type list endpoints, convert array to keyed object
      if (url === undefined) {
        // Rate limit keys and other misc — return null (these are transient)
        return null;
      }
    }
  }

  const res = await noCacheFetch(url);
  if (!res.ok) {
    console.error(`[sG] Storage read failed for ${k}: ${res.status} ${res.statusText}`);
    try { const errBody = await res.text(); console.error(`[sG] Response body:`, errBody.slice(0, 500)); } catch {}
    return k === SK.AUDIT ? [] : {};
  }
  const data = await res.json();

  // Vault/args/beliefs/translations endpoints return { entries: [...] } — convert to keyed object
  if (data.entries && Array.isArray(data.entries)) {
    const map = {};
    for (const entry of data.entries) {
      map[entry.id] = {
        id: entry.id,
        orgId: entry.org_id,
        orgName: entry.org_name,
        submittedBy: entry.submitted_by_username,
        status: entry.status,
        survivalCount: entry.survival_count || 0,
        approvedAt: entry.approved_at,
        createdAt: entry.created_at,
        // vault-specific
        assertion: entry.assertion,
        evidence: entry.evidence,
        // argument/belief-specific
        content: entry.content,
        // translation-specific
        originalText: entry.original_text,
        translatedText: entry.translated_text,
        translationType: entry.translation_type,
      };
    }
    return map;
  }

  return data;
}

// sS is a no-op — all writes go through dedicated POST/PATCH endpoints.
export async function sS(k, v) {
  console.warn(`[NO-OP] sS called for key "${k}" — writes should use dedicated API endpoints`);
  return true;
}

// createNotification is a no-op — notifications are created server-side as side effects.
export async function createNotification(username, type, data) {
}

export async function ensureGeneralPublic() {
  // Find General Public org from relational API
  const gpId = await sG(SK.GP);
  if (gpId) return gpId;
  // GP should already exist in the database — server creates it during registration
  console.warn("General Public org not found in relational data");
  return null;
}

export async function getGPId() {
  return ensureGeneralPublic();
}

export async function isWildWestMode() {
  const users = (await sG(SK.USERS)) || {};
  return Object.keys(users).length < WILD_WEST_THRESHOLD;
}

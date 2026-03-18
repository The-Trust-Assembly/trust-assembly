// ============================================================
// API Client — replaces window.storage calls with real backend
// All requests are automatically tracked by the action tracker.
// ============================================================

import { trackAction } from "../../spa/lib/action-tracker";

async function request(path, opts = {}) {
  const { method = "GET", body, params } = opts;
  let url = path;
  if (params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") sp.set(k, v);
    }
    const qs = sp.toString();
    if (qs) url += "?" + qs;
  }
  const fetchOpts = { method, headers: {} };
  if (body) {
    fetchOpts.headers["Content-Type"] = "application/json";
    fetchOpts.body = JSON.stringify(body);
  }
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  let res;
  try {
    res = await fetch(url, fetchOpts);
  } catch (networkErr) {
    const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - start);
    trackAction("api", `${method} ${path}`, {
      ok: false,
      durationMs,
      error: networkErr.message || "Network error",
      extra: { bodyKeys: body ? Object.keys(body) : null },
    });
    throw networkErr;
  }
  const data = await res.json();
  const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - start);
  if (!res.ok) {
    trackAction("api", `${method} ${path}`, {
      ok: false,
      durationMs,
      error: data.error || `HTTP ${res.status}`,
      extra: { status: res.status, bodyKeys: body ? Object.keys(body) : null },
    });
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  trackAction("api", `${method} ${path}`, {
    ok: true,
    durationMs,
    extra: { status: res.status },
  });
  return data;
}

// ---- Auth ----
export async function apiRegister(form) {
  return request("/api/auth/register", {
    method: "POST",
    body: {
      username: form.username,
      displayName: form.username.trim().replace(/\s+/g, " "),
      realName: form.realName?.trim() || null,
      email: form.email,
      password: form.password,
      gender: (form.isDI || form.gender === "di") ? "di" : form.gender,
      age: (form.isDI || form.gender === "di") ? "N/A" : (form.age || "Undisclosed"),
      country: form.country || null,
      state: form.region || null,
      politicalAffiliation: form.politicalAffiliation || null,
      bio: form.bio || null,
      isDI: form.isDI || form.gender === "di",
      diPartner: form.diPartner || null,
    },
  });
}

export async function apiLogin(username, password) {
  return request("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export async function apiLogout() {
  return request("/api/auth/logout", { method: "POST" });
}

export async function apiGetMe() {
  return request("/api/auth/me");
}

// ---- Users ----
export async function apiGetUser(username) {
  return request(`/api/users/${encodeURIComponent(username)}`);
}

export async function apiUpdateUser(username, updates) {
  return request(`/api/users/${encodeURIComponent(username)}`, {
    method: "PATCH",
    body: updates,
  });
}

export async function apiGetUserHistory(username) {
  return request(`/api/users/${encodeURIComponent(username)}/history`);
}

export async function apiGetUserRatings(username) {
  return request(`/api/users/${encodeURIComponent(username)}/ratings`);
}

// ---- Organizations ----
export async function apiListOrgs(params) {
  return request("/api/orgs", { params });
}

export async function apiCreateOrg(name, description, charter) {
  return request("/api/orgs", {
    method: "POST",
    body: { name, description, charter },
  });
}

export async function apiGetOrg(id) {
  return request(`/api/orgs/${id}`);
}

export async function apiGetOrgMembers(id, params) {
  return request(`/api/orgs/${id}/members`, { params });
}

export async function apiJoinOrg(id, reason) {
  return request(`/api/orgs/${id}/join`, {
    method: "POST",
    body: { reason },
  });
}

export async function apiLeaveOrg(id) {
  return request(`/api/orgs/${id}/leave`, { method: "POST" });
}

export async function apiListApplications(orgId) {
  return request(`/api/orgs/${orgId}/applications`);
}

export async function apiApplyToOrg(orgId, reason, link) {
  return request(`/api/orgs/${orgId}/applications`, {
    method: "POST",
    body: { reason, link },
  });
}

export async function apiHandleApplication(orgId, appId, action) {
  return request(`/api/orgs/${orgId}/applications/${appId}`, {
    method: "PATCH",
    body: { action },
  });
}

// ---- Submissions ----
export async function apiListSubmissions(params) {
  return request("/api/submissions", { params });
}

export async function apiCreateSubmission(data) {
  return request("/api/submissions", { method: "POST", body: data });
}

export async function apiGetSubmission(id) {
  return request(`/api/submissions/${id}`);
}

export async function apiVoteSubmission(id, vote) {
  return request(`/api/submissions/${id}/vote`, {
    method: "POST",
    body: vote,
  });
}

// ---- Disputes ----
export async function apiListDisputes(params) {
  return request("/api/disputes", { params });
}

export async function apiCreateDispute(data) {
  return request("/api/disputes", { method: "POST", body: data });
}

export async function apiGetDispute(id) {
  return request(`/api/disputes/${id}`);
}

export async function apiVoteDispute(id, vote) {
  return request(`/api/disputes/${id}/vote`, {
    method: "POST",
    body: vote,
  });
}

// ---- Concessions ----
export async function apiListConcessions(params) {
  return request("/api/concessions", { params });
}

export async function apiCreateConcession(data) {
  return request("/api/concessions", { method: "POST", body: data });
}

export async function apiVoteConcession(id, vote) {
  return request(`/api/concessions/${id}/vote`, {
    method: "POST",
    body: vote,
  });
}

// ---- Vault (Standing Corrections, Arguments, Beliefs, Translations) ----
export async function apiListVault(params) {
  return request("/api/vault", { params });
}

export async function apiCreateVaultEntry(data) {
  return request("/api/vault", { method: "POST", body: data });
}

export async function apiGetVaultEntry(id, type) {
  return request(`/api/vault/${id}`, { params: { type } });
}

// ---- Audit ----
export async function apiListAudit(params) {
  return request("/api/audit", { params });
}

// ---- DI Requests ----
export async function apiListDIRequests() {
  return request("/api/di-requests");
}

export async function apiCreateDIRequest(partnerUsername) {
  return request("/api/di-requests", {
    method: "POST",
    body: { partnerUsername },
  });
}

export async function apiHandleDIRequest(id, action) {
  return request(`/api/di-requests/${id}`, {
    method: "PATCH",
    body: { action },
  });
}

// ---- Jury ----
export async function apiGetMyJuryAssignments() {
  return request("/api/jury");
}

export async function apiAcceptJury(id) {
  return request(`/api/jury/${id}/accept`, { method: "POST" });
}

// ---- Diagnostic ----
export async function apiGetDiagnosticReport(hours = 24) {
  return request("/api/diagnostic", { params: { hours: String(hours) } });
}

export async function apiFlushClientLog(entries) {
  return request("/api/diagnostic/client-log", {
    method: "POST",
    body: { entries },
  });
}

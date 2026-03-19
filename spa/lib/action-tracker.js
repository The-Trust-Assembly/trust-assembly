// ============================================================
// Action Tracker — client-side telemetry for every button click,
// API call, and screen transition. Stores a rolling log in memory
// and can flush to the diagnostic endpoint.
// ============================================================

const MAX_LOG_SIZE = 500;

// Rolling in-memory log
const actionLog = [];

/**
 * Record a user action (button click, form submit, navigation, etc.)
 * @param {string} category  - "button" | "api" | "nav" | "error" | "lifecycle"
 * @param {string} action    - what happened: "click:submit_correction", "api:POST /api/submissions"
 * @param {object} [detail]  - arbitrary context (screen, component, params, error message)
 */
export function trackAction(category, action, detail = {}) {
  const entry = {
    ts: new Date().toISOString(),
    category,
    action,
    screen: detail.screen || null,
    component: detail.component || null,
    ok: detail.ok !== undefined ? detail.ok : true,
    durationMs: detail.durationMs || null,
    error: detail.error || null,
    extra: detail.extra || null,
  };
  actionLog.push(entry);
  if (actionLog.length > MAX_LOG_SIZE) actionLog.shift();

  // Also log to console in dev for immediate debugging
  if (process.env.NODE_ENV !== "production") {
    const icon = entry.ok ? "\u2705" : "\u274C";
    const dur = entry.durationMs ? ` (${entry.durationMs}ms)` : "";
    console.log(`[action] ${icon} ${category}:${action}${dur}`, entry.error ? `| ${entry.error}` : "", detail.extra || "");
  }
}

/**
 * Get the current action log (most recent first).
 */
export function getActionLog() {
  return [...actionLog].reverse();
}

/**
 * Clear the action log.
 */
export function clearActionLog() {
  actionLog.length = 0;
}

/**
 * Flush the log to the diagnostic endpoint for server-side storage.
 * Returns the server response or null on failure.
 */
export async function flushLog() {
  if (actionLog.length === 0) return null;
  try {
    const res = await fetch("/api/diagnostic/client-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: getActionLog() }),
    });
    if (res.ok) {
      clearActionLog();
      return await res.json();
    }
  } catch (e) {
    console.error("[action-tracker] flush failed:", e);
  }
  return null;
}

// ─── Error boundary helper ───
// Capture unhandled errors and promise rejections automatically

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    trackAction("error", "unhandled_error", {
      ok: false,
      error: `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
      extra: { stack: event.error?.stack?.split("\n").slice(0, 5).join("\n") },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const msg = event.reason instanceof Error
      ? event.reason.message
      : String(event.reason);
    trackAction("error", "unhandled_promise_rejection", {
      ok: false,
      error: msg,
      extra: { stack: event.reason?.stack?.split("\n").slice(0, 5).join("\n") },
    });
  });
}

// ─── Tracked fetch wrapper ───
// Drop-in replacement for the api-client's `request()` function
// that automatically logs every API call with timing and error info.

/**
 * Make an API request and automatically track it.
 * Same signature as the api-client `request()` function.
 */
export async function trackedRequest(path, opts = {}, trackingContext = {}) {
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

  const start = performance.now();
  let res, data;
  try {
    res = await fetch(url, fetchOpts);
    data = await res.json();
    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      trackAction("api", `${method} ${path}`, {
        ok: false,
        durationMs,
        error: data.error || `HTTP ${res.status}`,
        component: trackingContext.component,
        screen: trackingContext.screen,
        extra: { status: res.status, body: body ? Object.keys(body) : null },
      });
      throw new Error(data.error || `Request failed: ${res.status}`);
    }

    trackAction("api", `${method} ${path}`, {
      ok: true,
      durationMs,
      component: trackingContext.component,
      screen: trackingContext.screen,
      extra: { status: res.status },
    });

    return data;
  } catch (e) {
    if (!res) {
      // Network error — fetch itself failed
      const durationMs = Math.round(performance.now() - start);
      trackAction("api", `${method} ${path}`, {
        ok: false,
        durationMs,
        error: e.message || "Network error",
        component: trackingContext.component,
        screen: trackingContext.screen,
      });
    }
    throw e;
  }
}

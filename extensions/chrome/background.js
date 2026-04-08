/**
 * Trust Assembly Extension — Background Script
 * Handles badge count updates, cross-tab communication, and notification polling.
 */

// Listen for count updates from content scripts
const runtime = typeof chrome !== "undefined" ? chrome.runtime : browser.runtime;
const action = typeof chrome !== "undefined" ? chrome.action : browser.browserAction;
const tabs = typeof chrome !== "undefined" && chrome.tabs ? chrome.tabs : (typeof browser !== "undefined" ? browser.tabs : null);
const notifications = typeof chrome !== "undefined" && chrome.notifications ? chrome.notifications : (typeof browser !== "undefined" && browser.notifications ? browser.notifications : null);

// ── Storage helpers (mirror from api-client.js for background context) ──
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

const API_BASE = "https://trustassembly.org";
const TOKEN_KEY = "ta-auth-token";
const NOTIFICATION_POLL_INTERVAL = 60000; // 60 seconds
const NOTIF_SEEN_KEY = "ta-notif-seen";

let pollTimer = null;

// ── Fetch notifications from API ──
async function fetchNotifications() {
  const result = await storageGet([TOKEN_KEY]);
  const token = result[TOKEN_KEY];
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/api/users/me/notifications`, {
      headers: { "Authorization": "Bearer " + token },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// ── Push notification for pending items ──
async function checkAndNotify() {
  const data = await fetchNotifications();
  if (!data || data.totalPending === 0) {
    // Clear global badge when nothing pending
    if (action) {
      try { action.setBadgeText({ text: "" }); } catch (e) {}
    }
    return;
  }

  // Set global badge with pending count
  if (action) {
    try {
      action.setBadgeText({ text: String(data.totalPending) });
      action.setBadgeBackgroundColor({ color: "#D4850A" });
    } catch (e) {}
  }

  // Build notification details
  const seenResult = await storageGet([NOTIF_SEEN_KEY]);
  const seenIds = seenResult[NOTIF_SEEN_KEY] ? JSON.parse(seenResult[NOTIF_SEEN_KEY]) : {};

  // Check for new membership applications (assembly approvals)
  if (data.applications && data.applications.count > 0) {
    const newApps = data.applications.items.filter(app => !seenIds["app-" + app.id]);
    if (newApps.length > 0 && notifications) {
      const title = newApps.length === 1
        ? `New membership application`
        : `${newApps.length} new membership applications`;
      const message = newApps.length === 1
        ? `${newApps[0].display_name || newApps[0].username} applied to join ${newApps[0].org_name}`
        : newApps.map(a => `${a.display_name || a.username} → ${a.org_name}`).join("\n");

      try {
        notifications.create("ta-applications-" + Date.now(), {
          type: "basic",
          iconUrl: "icon128.png",
          title: title,
          message: message,
        });
      } catch (e) {}

      // Mark as seen
      newApps.forEach(a => { seenIds["app-" + a.id] = true; });
    }
  }

  // Check for new jury assignments
  if (data.jury && data.jury.count > 0) {
    const newJury = data.jury.items.filter(j => !seenIds["jury-" + j.id]);
    if (newJury.length > 0 && notifications) {
      const title = newJury.length === 1
        ? `Jury review needed`
        : `${newJury.length} submissions awaiting your review`;
      const message = newJury.length === 1
        ? `"${newJury[0].headline}" in ${newJury[0].org_name}`
        : newJury.map(j => `"${j.headline}" in ${j.org_name}`).join("\n");

      try {
        notifications.create("ta-jury-" + Date.now(), {
          type: "basic",
          iconUrl: "icon128.png",
          title: title,
          message: message,
        });
      } catch (e) {}

      newJury.forEach(j => { seenIds["jury-" + j.id] = true; });
    }
  }

  // Check for submission status updates
  if (data.updates && data.updates.count > 0) {
    const newUpdates = data.updates.items.filter(u => !seenIds["update-" + u.id]);
    if (newUpdates.length > 0 && notifications) {
      const title = newUpdates.length === 1
        ? `Submission ${newUpdates[0].status === "approved" || newUpdates[0].status === "consensus" ? "approved" : "rejected"}`
        : `${newUpdates.length} submission updates`;
      const message = newUpdates.length === 1
        ? `"${newUpdates[0].original_headline}" in ${newUpdates[0].org_name}`
        : newUpdates.map(u => `"${u.original_headline}" — ${u.status}`).join("\n");

      try {
        notifications.create("ta-updates-" + Date.now(), {
          type: "basic",
          iconUrl: "icon128.png",
          title: title,
          message: message,
        });
      } catch (e) {}

      newUpdates.forEach(u => { seenIds["update-" + u.id] = true; });
    }
  }

  await storageSet({ [NOTIF_SEEN_KEY]: JSON.stringify(seenIds) });

  // Also relay notification data to all active tabs so content scripts can display inline
  if (tabs) {
    tabs.query({}, (allTabs) => {
      if (!allTabs) return;
      allTabs.forEach(tab => {
        if (tab.id) {
          try {
            tabs.sendMessage(tab.id, {
              type: "TA_NOTIFICATIONS",
              data: data,
            });
          } catch (e) {
            // Tab may not have content script loaded
          }
        }
      });
    });
  }
}

// ── Polling lifecycle ──
function startPolling() {
  if (pollTimer) return;
  checkAndNotify(); // immediate first check
  pollTimer = setInterval(checkAndNotify, NOTIFICATION_POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Start polling on install/startup
runtime.onInstalled && runtime.onInstalled.addListener(() => { startPolling(); });
runtime.onStartup && runtime.onStartup.addListener(() => { startPolling(); });

// Also start immediately (for already-running extensions)
startPolling();

// ── Message handling ──
runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TA_COUNT" && sender.tab) {
    const count = message.count;
    const signalType = message.signalType || "neutral";

    // Update toolbar icon based on page signal type
    if (action && action.setIcon) {
      let iconSuffix = "";
      if (signalType === "corrected") iconSuffix = "-corrected";
      else if (signalType === "affirmed") iconSuffix = "-affirmed";
      else if (signalType === "pending") iconSuffix = "-pending";

      try {
        action.setIcon({
          path: {
            "16": "icon16" + iconSuffix + ".png",
            "48": "icon48" + iconSuffix + ".png",
            "128": "icon128" + iconSuffix + ".png"
          },
          tabId: sender.tab.id
        });
      } catch (e) {}
    }

    // Per-tab correction count badge
    const badgeColors = {
      corrected: "#C4573F",
      affirmed: "#1B5E3F",
      mixed: "#B8963E",
      neutral: "#B8963E"
    };

    if (count > 0 && action) {
      action.setBadgeText({ text: String(count), tabId: sender.tab.id });
      action.setBadgeBackgroundColor({ color: badgeColors[signalType] || "#B8963E", tabId: sender.tab.id });
    } else if (action) {
      action.setBadgeText({ text: "", tabId: sender.tab.id });
    }
  }

  // Proxy fetch requests from content scripts (CORS bypass)
  if (message.type === "TA_FETCH") {
    fetch(message.url)
      .then(res => res.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // keep message channel open for async response
  }

  // Relay settings changes from popup to content scripts in all tabs
  if (message.type === "TA_SETTINGS_CHANGED") {
    if (tabs) {
      tabs.query({}, (allTabs) => {
        if (!allTabs) return;
        allTabs.forEach(tab => {
          if (tab.id) {
            try {
              tabs.sendMessage(tab.id, message);
            } catch (e) {
              // Tab may not have content script loaded — ignore
            }
          }
        });
      });
    }
  }

  // Force an immediate notification check (e.g., after login)
  if (message.type === "TA_CHECK_NOTIFICATIONS") {
    checkAndNotify();
  }

  // User logged in — start polling; logged out — stop
  if (message.type === "TA_AUTH_CHANGED") {
    if (message.loggedIn) {
      startPolling();
    } else {
      stopPolling();
      if (action) {
        try { action.setBadgeText({ text: "" }); } catch (e) {}
      }
    }
  }
});

// Clear per-tab badge when navigating away
if (tabs) {
  try {
    tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === "loading" && action) {
        action.setBadgeText({ text: "", tabId });
      }
    });
  } catch (e) {}
}

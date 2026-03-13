/**
 * Trust Assembly Extension — Background Script
 * Handles badge count updates and cross-tab communication.
 */

// Listen for count updates from content scripts
const runtime = typeof chrome !== "undefined" ? chrome.runtime : browser.runtime;
const action = typeof chrome !== "undefined" ? chrome.action : browser.browserAction;

runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TA_COUNT" && sender.tab) {
    const count = message.count;
    if (count > 0 && action) {
      action.setBadgeText({ text: String(count), tabId: sender.tab.id });
      action.setBadgeBackgroundColor({ color: "#B8963E", tabId: sender.tab.id });
    } else if (action) {
      action.setBadgeText({ text: "", tabId: sender.tab.id });
    }
  }

  // Proxy fetch requests from content scripts.
  // Content scripts run in the page's origin (e.g. cnn.com), so cross-origin
  // fetches to trustassembly.org may be blocked by CORS. The background
  // service worker runs in the extension's origin and is not subject to CORS.
  if (message.type === "TA_FETCH") {
    fetch(message.url)
      .then(res => res.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // keep message channel open for async response
  }

  // Relay settings changes from popup to content scripts in all tabs
  if (message.type === "TA_SETTINGS_CHANGED") {
    const tabs = typeof chrome !== "undefined" && chrome.tabs ? chrome.tabs : browser.tabs;
    tabs.query({}, (allTabs) => {
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
});

// Clear badge when navigating away
if (typeof chrome !== "undefined" && chrome.tabs) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading" && action) {
      action.setBadgeText({ text: "", tabId });
    }
  });
}

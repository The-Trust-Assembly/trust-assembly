/**
 * Trust Assembly Extension — Background Script
 * Handles badge count updates and cross-tab communication.
 */

// Listen for count updates from content scripts
const runtime = typeof chrome !== "undefined" ? chrome.runtime : browser.runtime;
const action = typeof chrome !== "undefined" ? chrome.action : browser.browserAction;

runtime.onMessage.addListener((message, sender) => {
  if (message.type === "TA_COUNT" && sender.tab) {
    const count = message.count;
    if (count > 0 && action) {
      action.setBadgeText({ text: String(count), tabId: sender.tab.id });
      action.setBadgeBackgroundColor({ color: "#B8963E", tabId: sender.tab.id });
    } else if (action) {
      action.setBadgeText({ text: "", tabId: sender.tab.id });
    }
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

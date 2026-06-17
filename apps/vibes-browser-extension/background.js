// Trust Assembly - Background Service Worker

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "updateBadge") {
    const count = msg.count || 0;
    chrome.action.setBadgeText({
      text: count > 0 ? String(count) : "",
      tabId: sender.tab?.id,
    });
    chrome.action.setBadgeBackgroundColor({
      color: "#C41E3A",
      tabId: sender.tab?.id,
    });
  }
});

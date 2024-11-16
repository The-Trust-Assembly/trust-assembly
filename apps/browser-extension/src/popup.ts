import { TrustAssemblyMessage } from './utils/messagePassing';

const transformButton = document.getElementById('toggle-transform');
transformButton?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: TrustAssemblyMessage.TOGGLE_MODIFICATION,
    });
  }
});

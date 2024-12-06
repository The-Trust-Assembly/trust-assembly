import { getTransformations } from './api/backendApi';
import { MessagePayload } from './models/MessagePayload';
import { TransformedArticle } from './models/TransformedArticle';
import { TrustAssemblyMessage } from './utils/messagePassing';

let currentUrl: string | undefined = undefined;
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const urlString = tabs[0].url;
  if (!urlString) {
    return;
  }

  const url = new URL(urlString);
  currentUrl = url.origin + url.pathname;
});

let selectedHeadline: string | undefined;

const retrieveButton = document.getElementById('retrieve-transform');
retrieveButton?.addEventListener('click', async () => {
  if (!currentUrl) {
    console.warn('No current URL found');
    return;
  }

  const data = await getHeadlineData(currentUrl);
  if (data) {
    retrieveButton!.style.display = 'none';
    setupCreatorSelector(data);
  }
});

const toggleButton = document.getElementById('toggle-transform');
toggleButton?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (tab?.id) {
    chrome.tabs.sendMessage<MessagePayload>(tab.id, {
      action: TrustAssemblyMessage.TOGGLE_MODIFICATION,
      headline: selectedHeadline,
    });
  }
});

const STORED_DATA = 'storedHeadlineData';

async function getHeadlineData(
  url: string,
): Promise<TransformedArticle[] | undefined> {
  const storedData = sessionStorage.getItem(STORED_DATA);
  if (storedData) {
    return JSON.parse(storedData) as TransformedArticle[];
  }

  const data = await getTransformations(url);
  if (data) {
    sessionStorage.setItem(STORED_DATA, JSON.stringify(data));
  }
  return data;
}

function setupCreatorSelector(data: TransformedArticle[]) {
  document.getElementById('select-container')!.style.display = 'block';

  const select = document.getElementById(
    'transform-select',
  ) as HTMLSelectElement;
  select.innerHTML = '';
  data.forEach((article, index) => {
    const option = document.createElement('option');
    option.value = article.headline;
    option.textContent = article.creator;
    if (index === 0) {
      option.selected = true;
      selectedHeadline = article.headline;
    }
    select.appendChild(option);
  });

  select.addEventListener('change', (event) => {
    selectedHeadline = (event.target as HTMLSelectElement).value;
  });
}

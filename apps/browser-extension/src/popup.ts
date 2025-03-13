import { getTransformation } from './api/backendApi';
import { MessagePayload } from './models/MessagePayload';
import { TransformedArticle } from './models/TransformedArticle';
import { TrustAssemblyMessage } from './utils/messagePassing';

// state
let currentUrl: string | undefined = undefined;
let selectedHeadline: string | undefined;

// popup elements
const retrieveButton = document.getElementById('retrieve-transform');
const toggleButton = document.getElementById('toggle-transform');
const selectElement = document.getElementById(
  'transform-select',
) as HTMLSelectElement;

// set current url
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const urlString = tabs[0].url;
  if (!urlString) {
    return;
  }

  const url = new URL(urlString);
  currentUrl = url.origin + url.pathname;
});

// event listeners
selectElement.addEventListener('change', (event) => {
  selectedHeadline = (event.target as HTMLSelectElement).value;
});

retrieveButton?.addEventListener('click', async () => {
  if (!currentUrl) {
    console.warn('No current URL found');
    return;
  }

  const data = await getHeadlineData(currentUrl, selectElement.value);
  if (data) {
    retrieveButton!.style.display = 'none';
  }
});

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
  author: string,
): Promise<TransformedArticle | undefined> {
  const storedData = retrieveStoredResult(author);
  if (storedData) {
    return storedData;
  }

  const data = await getTransformation(url, author);
  if (data) {
    storeResult(author, data);
  }
  return data;
}

function retrieveStoredResult(author: string): TransformedArticle | undefined {
  const storedData = sessionStorage.getItem(keyFn(author));

  if (!storedData) {
    return undefined;
  }

  return JSON.parse(storedData) as TransformedArticle;
}

function storeResult(author: string, data: TransformedArticle): void {
  sessionStorage.setItem(keyFn(author), JSON.stringify(data));
}

function keyFn(author: string): string {
  return `${STORED_DATA}:${author}`;
}

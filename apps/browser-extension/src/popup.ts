import { getTransformation } from './api/backendApi';
import { MessagePayload } from './models/MessagePayload';
import { TransformedArticle } from './models/TransformedArticle';
import { TrustAssemblyMessage } from './utils/messagePassing';

// state
let currentUrl: string | undefined = undefined;
let selectedAuthor: string | undefined;
let selectedHeadline: string | undefined;

type ButtonDisplayState = 'none' | 'retrive' | 'toggle';

// popup elements
const retrieveButton = document.getElementById('retrieve-transform');
const toggleButton = document.getElementById('toggle-transform');
const selectElement = document.getElementById(
  'transform-select',
) as HTMLSelectElement;

// elements for new-headline navigation
const replaceHeadlineButton = document.getElementById('replace-headline');

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
  const previousAuthor = selectedAuthor;
  selectedAuthor = (event.target as HTMLSelectElement).value;
  if (selectedAuthor) {
    if (selectedAuthor !== previousAuthor) {
      setButtonDisplayState('retrive');
    } else {
      setButtonDisplayState('toggle');
    }
  } else {
    setButtonDisplayState('none');
  }
});

retrieveButton?.addEventListener('click', async () => {
  if (!currentUrl) {
    console.warn('No current URL found');
    return;
  }

  const data = await getHeadlineData(currentUrl, selectElement.value);
  if (data) {
    setButtonDisplayState('toggle');
    selectedHeadline = data.transformedHeadline;
    await setModifiedHeadline();
  }
});

toggleButton?.addEventListener('click', async () => {
  await toggleHeadline();
});

// new-headline: open separate page
replaceHeadlineButton?.addEventListener('click', () => {
  window.location.href = 'new_headline.html';
});

const STORED_DATA = 'storedHeadlineData';

async function getHeadlineData(
  url: string,
  author: string,
): Promise<TransformedArticle | undefined> {
  const storedData = await retrieveStoredResult(author);
  if (storedData) {
    return storedData;
  }

  const data = await getTransformation(url, author);
  if (data) {
    await storeResult(author, data);
  }
  return data;
}

async function retrieveStoredResult(
  author: string,
): Promise<TransformedArticle | undefined> {
  const key = keyFn(author);
  const storedData = (await chrome.storage.session.get(key))[key];

  if (!storedData) {
    return undefined;
  }

  return JSON.parse(storedData) as TransformedArticle;
}

function storeResult(author: string, data: TransformedArticle): Promise<void> {
  return chrome.storage.session.set({
    [keyFn(author)]: JSON.stringify(data),
  });
}

function keyFn(author: string): string {
  return `${STORED_DATA}:${currentUrl}:${author}`;
}

async function setModifiedHeadline(): Promise<void> {
  await sendHeadlineMessage(TrustAssemblyMessage.SET_MODIFIED_HEADLINE);
}

async function toggleHeadline(): Promise<void> {
  sendHeadlineMessage(TrustAssemblyMessage.TOGGLE_MODIFICATION);
}

async function sendHeadlineMessage(event: TrustAssemblyMessage): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (tab?.id) {
    chrome.tabs.sendMessage<MessagePayload>(tab.id, {
      action: event,
      headline: selectedHeadline,
    });
  }
}

function setButtonDisplayState(state: ButtonDisplayState): void {
  switch (state) {
    case 'none':
      retrieveButton!.style.display = 'none';
      toggleButton!.style.display = 'none';
      break;
    case 'retrive':
      retrieveButton!.style.display = 'block';
      toggleButton!.style.display = 'none';
      break;
    case 'toggle':
      retrieveButton!.style.display = 'none';
      toggleButton!.style.display = 'block';
      break;
  }
}

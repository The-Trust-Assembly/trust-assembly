import { MessagePayload } from './models/MessagePayload';
import ArticleStateManager from './utils/ArticleStateManager';
import { TrustAssemblyMessage } from './utils/messagePassing';

console.log('Trust Assembly Headline Transformer content script loaded.');

function findHeadlineElement() {
  const selectors = [
    'h1.main-headline',
    'h1.article-title',
    'h1.headline',
    'h1.detailHeadline',
    'h1[class*="headline"]', // Catch-all selector for any class containing the text "headline"
  ];
  console.log(
    `Searching for headline element using these selectors: ${selectors.join(', ')}`,
  );

  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      console.log('Found headline element:', element);

      return element;
    }
  }

  console.log('Headline element not found on this page.');
}

const stateManager = new ArticleStateManager();
let modifiedHeadline: string | undefined;

(async function () {
  const elementToModify = findHeadlineElement();
  if (!elementToModify) return;

  await stateManager.setElement(elementToModify);

  elementToModify.addEventListener('click', () =>
    stateManager.toggleModification(modifiedHeadline),
  );

  chrome.runtime.onMessage.addListener(
    async (message: MessagePayload): Promise<boolean | undefined> => {
      console.log('Got message:', message);

      if (message.action === TrustAssemblyMessage.TOGGLE_MODIFICATION) {
        modifiedHeadline = message.headline;
        stateManager.toggleModification(modifiedHeadline);
        return false;
      }
      if (message.action === TrustAssemblyMessage.SET_MODIFIED_HEADLINE) {
        modifiedHeadline = message.headline;
        stateManager.setModifiedHeadline(modifiedHeadline);
        return false;
      }
    },
  );
})();

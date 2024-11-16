import { dummyGetTransformation } from './api/dummyApi';
import { Article } from './models/Article';
import { MessagePayload } from './models/MessagePayload';
import { TransformedArticle } from './models/TransformedArticle';
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

const requestTransformedHeadline = async (
  article: Article,
): Promise<TransformedArticle> => {
  // just use the dummy API for now
  return await dummyGetTransformation(article);

  // TODO: uncomment this code below so that we actually communite with the backend
  // rather than just returning the original text uppercase. Right now @melvillian
  // commented this out to make the PR easier to work with; the plan is to
  // add backend communication to the extension and then uncomment this code.

  // const response = await chrome.runtime.sendMessage<
  //   MessagePayload,
  //   TransformedArticle | undefined
  // >({
  //   action: TrustAssemblyMessage.FETCH_TRANSFORMED_HEADLINE,
  //   article,
  // });
  // console.log('chrome.runtime.sendMessage');
  // console.log(`response: ${response}`);
  // if (chrome.runtime.lastError) {
  //   console.error(chrome.runtime.lastError);
  //   throw new Error(chrome.runtime.lastError.message);
  // } else if (response && response.transformedText) {
  //   console.log('resolve(response);');
  //   return response;
  // } else {
  //   throw new Error('No transformed text received');
  // }
};

const stateManager = new ArticleStateManager(requestTransformedHeadline);

(async function () {
  const elementToModify = findHeadlineElement();
  if (!elementToModify) return;

  await stateManager.setElement(elementToModify);

  elementToModify.addEventListener('click', () =>
    stateManager.toggleModification(),
  );

  chrome.runtime.onMessage.addListener(
    async (message: MessagePayload): Promise<boolean | undefined> => {
      console.log('Got message:', message);

      if (message.action === TrustAssemblyMessage.TOGGLE_MODIFICATION) {
        stateManager.toggleModification();
        return false;
      }
    },
  );

  stateManager.toggleModification();
})();

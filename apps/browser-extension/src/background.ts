import { TrustAssemblyMessage } from './utils/messagePassing';
import { getTransformation } from './api/backendApi';
import { MessagePayload } from './models/MessagePayload';

console.log(
  'Trust Assembly Headline Transformer background service worker loaded.',
);

/**
 * Listens for messages sent to the background service worker and handles the
 * 'FETCH_TRANSFORMED_HEADLINE' action by making a request to the backend to
 * transform the provided headline text.
 *
 * @param message - An object containing the TrustAssemblyMessage and the original text to be transformed.
 * @param _sender - Unused parameter representing the sender of the message.
 * @param sendResponse - A function to send the transformed text back to the caller.
 * @returns True to indicate that the response will be sent asynchronously.
 */
chrome.runtime.onMessage.addListener(
  async (
    message: MessagePayload,
    _sender,
    sendResponse,
  ): Promise<boolean | undefined> => {
    if (message.action === TrustAssemblyMessage.FETCH_TRANSFORMED_HEADLINE) {
      console.log('inside of chrome.runtime.onMessage.addListener');

      // Make the API request to your backend
      try {
        const transformedArticle = await getTransformation(message.article);
        sendResponse(transformedArticle);
      } catch (error) {
        console.error('Error fetching transformed headline:', error);
        sendResponse({ transformedText: null });
      }

      // Return true to indicate that sendResponse will be called asynchronously
      return true;
    }
  },
);

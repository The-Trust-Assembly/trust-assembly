import { MessagePayload } from './models/MessagePayload';
import { TrustAssemblyMessage } from './utils/messagePassing';
import HeadlineReplacer from './utils/HeadlineReplacer';

console.log('Trust Assembly Headline Transformer content script loaded.');

/**
 * Extracts the primary headline from the page using multiple strategies,
 * ordered from most specific/reliable to least.
 */
function extractOriginalHeadline(): string | null {
  // Strategy 1: Common headline heading elements (most visible to user)
  const headlineSelectors = [
    'h1[class*="headline"]',
    'h1[class*="title"]',
    'h1[data-editable="headlineText"]',
    'h1#maincontent',
    'article h1',
    '[role="main"] h1',
    'h1',
  ];

  for (const selector of headlineSelectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      const text = el.textContent?.trim();
      if (text && text.length > 10) {
        console.log(`[TrustAssembly] Found headline via selector "${selector}": "${text}"`);
        return text;
      }
    }
  }

  // Strategy 2: Open Graph / Twitter meta tags
  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
  if (ogTitle?.content) {
    // Strip common suffixes like " | CNN", " - The New York Times"
    const cleaned = ogTitle.content.replace(/\s*[|\-–—]\s*[^|\-–—]+$/, '').trim();
    if (cleaned.length > 10) {
      console.log(`[TrustAssembly] Found headline via og:title: "${cleaned}"`);
      return cleaned;
    }
  }

  // Strategy 3: <title> tag (last resort)
  const titleTag = document.querySelector('title');
  if (titleTag?.textContent) {
    const cleaned = titleTag.textContent.replace(/\s*[|\-–—]\s*[^|\-–—]+$/, '').trim();
    if (cleaned.length > 10) {
      console.log(`[TrustAssembly] Found headline via <title>: "${cleaned}"`);
      return cleaned;
    }
  }

  console.log('[TrustAssembly] Could not extract headline from this page.');
  return null;
}

// --- Main ---

const originalHeadline = extractOriginalHeadline();

if (originalHeadline) {
  const replacer = new HeadlineReplacer(originalHeadline);

  chrome.runtime.onMessage.addListener(
    (message: MessagePayload): undefined => {
      console.log('[TrustAssembly] Got message:', message);

      if (message.action === TrustAssemblyMessage.TOGGLE_MODIFICATION) {
        replacer.toggle(message.headline);
      }
      if (message.action === TrustAssemblyMessage.SET_MODIFIED_HEADLINE) {
        replacer.setModified(message.headline);
      }
    },
  );
} else {
  console.log('[TrustAssembly] No headline found — content script idle.');
}

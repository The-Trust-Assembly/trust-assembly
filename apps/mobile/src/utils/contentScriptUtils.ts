/** Canonical extension overlay wrapped with the mobile WebView adapter. */
import { CONTENT_SCRIPT } from '../generated/trustOverlay.generated';

export { CONTENT_SCRIPT };

export function getContentScript(): string {
  return CONTENT_SCRIPT;
}

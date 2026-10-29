/** Canonical extension overlay wrapped with the mobile WebView adapter. */
import { CONTENT_SCRIPT } from '../generated/trustOverlay.generated';
import { TA_API_BASE } from './constants';

export { CONTENT_SCRIPT };

export function getContentScript(): string {
  // The checked-in generated overlay remains production-safe. Expo development
  // builds can point both native requests and the injected shared overlay at a
  // local API without regenerating or modifying committed artifacts.
  return TA_API_BASE === 'https://trustassembly.org'
    ? CONTENT_SCRIPT
    : CONTENT_SCRIPT.replaceAll('https://trustassembly.org', TA_API_BASE);
}

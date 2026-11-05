import { correctionCacheKey, normalizeBrowserUrl } from './urlUtils';

export type TrustedWebViewMessage =
  | { type: 'TA_FETCH'; requestId: string; url: string; method?: string; body?: string }
  | { type: 'TA_FETCH_CORRECTIONS'; requestId?: string; url?: string }
  | { type: 'TA_COUNT' | 'TA_CORRECTIONS_PROCESSED'; count: number }
  | { type: 'TA_READY' }
  | { type: 'TA_BADGE_CLICK' }
  | { type: 'TA_PAGE_METADATA'; url: string; title: string; authors: string[]; contentType: string };

const CONTENT_TYPES = new Set(['article', 'video', 'shortform', 'audio', 'product']);

/**
 * Parse and sanitize a message from an untrusted article WebView.
 *
 * Messages are accepted only from the current top-level document. This keeps
 * ads/iframes and a document that was replaced during navigation from driving
 * native state or receiving Trust Assembly responses.
 */
export function parseTrustedWebViewMessage(
  rawData: string,
  senderUrl: string,
  topLevelUrl: string,
): TrustedWebViewMessage | null {
  const normalizedSender = normalizeBrowserUrl(senderUrl);
  const normalizedTopLevel = normalizeBrowserUrl(topLevelUrl);
  if (
    !normalizedSender ||
    !normalizedTopLevel ||
    correctionCacheKey(normalizedSender) !== correctionCacheKey(normalizedTopLevel)
  ) return null;

  let value: unknown;
  try {
    value = JSON.parse(rawData);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string, unknown>;

  switch (message.type) {
    case 'TA_FETCH':
      if (
        typeof message.requestId !== 'string' ||
        message.requestId.length === 0 ||
        message.requestId.length > 128 ||
        typeof message.url !== 'string'
      ) return null;
      return {
        type: 'TA_FETCH',
        requestId: message.requestId,
        url: message.url,
        ...(typeof message.method === 'string' ? { method: message.method } : {}),
        ...(typeof message.body === 'string' ? { body: message.body } : {}),
      };

    case 'TA_FETCH_CORRECTIONS':
      return {
        type: 'TA_FETCH_CORRECTIONS',
        ...(typeof message.requestId === 'string' && message.requestId.length <= 128
          ? { requestId: message.requestId }
          : {}),
        ...(typeof message.url === 'string' ? { url: message.url } : {}),
      };

    case 'TA_COUNT':
    case 'TA_CORRECTIONS_PROCESSED':
      if (typeof message.count !== 'number' || !Number.isFinite(message.count)) return null;
      return { type: message.type, count: Math.max(0, Math.floor(message.count)) };

    case 'TA_READY':
      return { type: 'TA_READY' };

    case 'TA_BADGE_CLICK':
      return { type: 'TA_BADGE_CLICK' };

    case 'TA_PAGE_METADATA': {
      const metadataUrl = typeof message.url === 'string' ? normalizeBrowserUrl(message.url) : null;
      if (!metadataUrl || correctionCacheKey(metadataUrl) !== correctionCacheKey(normalizedTopLevel)) return null;
      return {
        type: 'TA_PAGE_METADATA',
        url: metadataUrl,
        title: typeof message.title === 'string' ? message.title.trim().slice(0, 1000) : '',
        authors: Array.isArray(message.authors)
          ? message.authors
            .filter((author): author is string => typeof author === 'string')
            .map(author => author.trim())
            .filter(Boolean)
            .slice(0, 10)
          : [],
        contentType: typeof message.contentType === 'string' && CONTENT_TYPES.has(message.contentType)
          ? message.contentType
          : 'article',
      };
    }

    default:
      // Article pages are untrusted, so unknown/state-changing commands fail closed.
      return null;
  }
}

import { TA_API_BASE } from './constants';

export const DEFAULT_BROWSER_URL = TA_API_BASE;

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'ref',
  'source',
];

/** Convert address-bar or shared text into a safe HTTP(S) URL. */
export function normalizeBrowserUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password || !parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Match the server's correction URL normalization for cache keys. */
export function correctionCacheKey(input: string): string {
  try {
    const parsed = new URL(input);
    parsed.hostname = parsed.hostname.replace(/^www\./, '');
    parsed.hash = '';
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    TRACKING_PARAMS.forEach((name) => parsed.searchParams.delete(name));
    return parsed.toString();
  } catch {
    return input;
  }
}

/**
 * Accept direct HTTP(S) links, Trust Assembly deep links, and common share text.
 * Examples:
 *   trustassembly://open?url=https%3A%2F%2Fexample.com%2Fstory
 *   https://trustassembly.org/mobile/open?url=https%3A%2F%2Fexample.com%2Fstory
 *   "Worth reading: https://example.com/story"
 */
export function extractSharedUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'trustassembly:') {
      return normalizeBrowserUrl(parsed.searchParams.get('url') || '');
    }
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.replace(/^www\./, '') === 'trustassembly.org' &&
      (parsed.pathname === '/mobile/open' || parsed.pathname === '/open') &&
      parsed.searchParams.has('url')
    ) {
      return normalizeBrowserUrl(parsed.searchParams.get('url') || '');
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return normalizeBrowserUrl(trimmed);
    }
  } catch {
    // Share payloads often include prose around the URL; scan below.
  }

  const match = trimmed.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  return normalizeBrowserUrl(match[0].replace(/[),.;!?]+$/, ''));
}

/** Extract the article URL from canonical extension TA_FETCH messages. */
export function correctionUrlFromBridge(messageUrl: string): string | null {
  const direct = normalizeBrowserUrl(messageUrl);
  if (!direct) return null;

  try {
    const parsed = new URL(direct);
    const apiOrigin = new URL(TA_API_BASE).origin;
    if (parsed.origin === apiOrigin && parsed.pathname === '/api/corrections') {
      return normalizeBrowserUrl(parsed.searchParams.get('url') || '');
    }
  } catch {
    return null;
  }

  return direct;
}

export type OverlayFetchRequest =
  | { kind: 'corrections'; path: string; articleUrl: string }
  | { kind: 'vault'; path: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Allowlist and rebuild public requests coming from the untrusted page.
 * Supplied correction URLs are ignored; the native top-level page wins.
 */
export function buildOverlayFetchRequest(
  requestedUrl: string,
  currentTopLevelUrl: string,
): OverlayFetchRequest | null {
  const current = normalizeBrowserUrl(currentTopLevelUrl);
  if (!current) return null;

  let requested: URL;
  try {
    requested = new URL(requestedUrl);
  } catch {
    return null;
  }

  const apiBase = new URL(TA_API_BASE);
  if (requested.protocol !== 'https:' || requested.origin !== apiBase.origin) return null;

  if (requested.pathname === '/api/corrections') {
    return {
      kind: 'corrections',
      articleUrl: current,
      path: `/api/corrections?url=${encodeURIComponent(current)}`,
    };
  }

  if (requested.pathname !== '/api/vault') return null;

  const type = requested.searchParams.get('type') || 'vault';
  if (!['vault', 'argument', 'belief', 'translation'].includes(type)) return null;

  const rawOrgIds = requested.searchParams.get('orgIds') || requested.searchParams.get('orgId') || '';
  const orgIds = rawOrgIds.split(',').map((id) => id.trim()).filter(Boolean);
  if (orgIds.length === 0 || orgIds.length > 25 || orgIds.some((id) => !UUID_RE.test(id))) return null;

  const requestedStatus = requested.searchParams.get('status');
  if (requestedStatus && requestedStatus !== 'approved') return null;

  const parsedLimit = Number.parseInt(requested.searchParams.get('limit') || '5', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 20) : 5;
  const params = new URLSearchParams({
    type,
    orgIds: orgIds.join(','),
    status: 'approved',
    limit: String(limit),
  });
  if (type !== 'translation') params.set('url', current);

  return { kind: 'vault', path: `/api/vault?${params.toString()}` };
}

export function getDomain(input: string): string {
  try {
    return new URL(input).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

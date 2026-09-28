/**
 * Trust Assembly Mobile App — Site Detection
 * Ported from extensions/chrome/content.js detectSiteType() and getSiteDomain()
 */

import { SITE_CONFIGS } from './constants';
import type { SiteConfig, SiteType } from './constants';

/**
 * Get the domain of the current page (without www prefix).
 * If a URL is provided, parse it; otherwise use window.location.
 */
export function getSiteDomain(url?: string): string {
  try {
    const loc = url ? new URL(url) : window.location;
    return loc.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Detect site type based on hostname and DOM markers.
 * Ported from content.js detectSiteType().
 */
export function detectSiteType(url: string): SiteType {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'generic';
  }

  // ── Social / Platform Detection ──

  if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    return 'twitter';
  }
  if (hostname.includes('tiktok.com')) {
    return 'tiktok';
  }
  if (hostname.includes('linkedin.com')) {
    return 'linkedin';
  }
  if (hostname.includes('facebook.com') || hostname.includes('fb.com')) {
    return 'facebook';
  }
  if (hostname.includes('reddit.com')) {
    return 'reddit';
  }
  if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
    return 'youtube';
  }
  if (hostname.includes('substack.com')) {
    return 'substack';
  }
  if (hostname.includes('medium.com') || hostname.includes('substack.com')) {
    return 'medium';
  }
  if (hostname.includes('quora.com')) {
    return 'quora';
  }
  if (hostname.includes('wikipedia.org')) {
    return 'wikipedia';
  }

  // ── News Site Detection ──

  if (hostname.includes('cnn.com')) {
    return 'cnn';
  }
  if (hostname.includes('bbc.co')) {
    return 'bbc';
  }
  if (hostname.includes('nytimes.com')) {
    return 'nytimes';
  }
  if (hostname.includes('washingtonpost.com')) {
    return 'washingtonpost';
  }
  if (hostname.includes('wsj.com')) {
    return 'wsj';
  }

  return 'generic';
}

/**
 * Get the site config for a given URL.
 */
export function getSiteConfig(url: string): SiteConfig {
  const type = detectSiteType(url);
  return SITE_CONFIGS[type];
}

/**
 * Check if a URL is a page we can process (http/https).
 */
export function isValidArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Get the origin + pathname (without query/hash) for correction lookups.
 * This matches how the browser extension uses the URL.
 */
export function getArticleUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}

/**
 * Trust Assembly Mobile App — Constants
 * Ported from extensions/chrome/content.js and extensions/chrome/api-client.js
 */

// ── Backend API ──

export const TA_API_BASE = 'https://trustassembly.org';
export const TOKEN_KEY = 'ta-auth-token';
export const USER_KEY = 'ta-auth-user';
export const ASSEMBLIES_KEY = 'ta-assemblies';
export const MUTED_KEY = 'ta-muted-sites';
export const SETTINGS_KEY = 'ta-settings';
export const CACHED_CORRECTIONS_KEY = 'ta-cached-corrections';
export const FORM_STATE_KEY = 'ta-form-draft';

// ── Cache ──

export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
export const POLL_INTERVAL = 30 * 1000; // 30 seconds (was 30s in content.js)
export const NOTIFICATION_POLL_INTERVAL = 60 * 1000; // 60 seconds (background)

// ── UI Colors (from content.js COLORS constant) ──

export const COLORS = {
  navy: '#1B2A4A',
  linen: '#F0EDE6',
  vellum: '#FDFBF5',
  gold: '#B8963E',
  green: '#1B5E3F',
  red: '#C4573F',
  teal: '#2A6B6B',
  orange: '#D4850A',
  purple: '#5B2D8E',
} as const;

// ── Badge Colors (from background.js) ──

export const BADGE_COLORS = {
  corrected: COLORS.red,
  affirmed: COLORS.green,
  mixed: COLORS.gold,
  neutral: COLORS.gold,
} as const;

// ── Site Types (from content.js detectSiteType) ──

export type SiteType =
  | 'twitter'
  | 'tiktok'
  | 'linkedin'
  | 'facebook'
  | 'reddit'
  | 'youtube'
  | 'substack'
  | 'cnn'
  | 'bbc'
  | 'nytimes'
  | 'washingtonpost'
  | 'wsj'
  | 'medium'
  | 'quora'
  | 'wikipedia'
  | 'generic';

export interface SiteConfig {
  type: SiteType;
  headlineSelectors: string[];
  bodySelectors?: string[];
  feedItemSelector?: string;
  feedHeadlineSelector?: string;
  feedBodySelector?: string;
  usesSPA: boolean;
}

export const SITE_CONFIGS: Record<SiteType, SiteConfig> = {
  generic: {
    type: 'generic',
    headlineSelectors: [
      'h1',
      '[class*="title"] h1',
      '[class*="headline"] h1',
      '[data-testid="headline"]',
      '.entry-title',
      '.post-title',
      '.article-title',
      '#article-header h1',
      'header h1',
    ],
    bodySelectors: [
      '.article-body',
      '.post-content',
      '.entry-content',
      '.story-body',
      '#article-body',
      '.article__body',
    ],
    usesSPA: false,
  },
  twitter: {
    type: 'twitter',
    headlineSelectors: ['[data-testid="tweetText"]'],
    feedItemSelector: 'article[data-testid="tweet"]',
    usesSPA: true,
  },
  tiktok: {
    type: 'tiktok',
    headlineSelectors: ['[data-testid="video-desc"]'],
    feedItemSelector: 'div[data-testid="video-card-container"]',
    usesSPA: true,
  },
  linkedin: {
    type: 'linkedin',
    headlineSelectors: ['.feed-shared-update__headline', 'h2.feed-identity-title'],
    feedItemSelector: '.feed-shared-update',
    usesSPA: true,
  },
  facebook: {
    type: 'facebook',
    headlineSelectors: ['[data-testid="post-message"]', '.userContent'],
    feedItemSelector: '[role="article"]',
    usesSPA: true,
  },
  reddit: {
    type: 'reddit',
    headlineSelectors: ['.title', '[data-testid="post-container"] .title', 'a[data-testid="outbound-link"]'],
    feedItemSelector: '[data-testid="post-container"]',
    usesSPA: true,
  },
  youtube: {
    type: 'youtube',
    headlineSelectors: ['h1 yt-formatted-string', '#info-contents h1'],
    bodySelectors: ['#meta-contents'],
    usesSPA: true,
  },
  substack: {
    type: 'substack',
    headlineSelectors: ['.post-title', 'h1.post-title', '.newsletter-title'],
    bodySelectors: ['.post-body', '.newsletter-content'],
    usesSPA: false,
  },
  cnn: {
    type: 'cnn',
    headlineSelectors: ['.zone__container-header-title', '.cdh-article-title', 'h1', '.container__headline-text'],
    bodySelectors: ['.article__content', '.zn-body'],
    usesSPA: false,
  },
  bbc: {
    type: 'bbc',
    headlineSelectors: ['h1#main-heading', '.ssrcss-15xko80', 'h1[class*="heading"]'],
    bodySelectors: ['.ssrcss-1fqj7ul', '.story-body'],
    usesSPA: false,
  },
  nytimes: {
    type: 'nytimes',
    headlineSelectors: ['h1[data-testid="headline"]', '.css-1xmb60x', 'h1'],
    bodySelectors: ['.metered-content', '.article-body'],
    usesSPA: false,
  },
  washingtonpost: {
    type: 'washingtonpost',
    headlineSelectors: ['.headline', 'h1[data-allowsocial="true"]', '.font-family-display'],
    bodySelectors: ['.article-body', '.ws-body'],
    usesSPA: false,
  },
  wsj: {
    type: 'wsj',
    headlineSelectors: ['.ws-headline', 'h1', '.article-headline'],
    bodySelectors: ['.ws-article-body'],
    usesSPA: false,
  },
  medium: {
    type: 'medium',
    headlineSelectors: ['h1[data-testid="story-title"]', '.pw-post-title'],
    bodySelectors: ['.pw-post-body'],
    usesSPA: true,
  },
  quora: {
    type: 'quora',
    headlineSelectors: ['.question_text', '.question_h1'],
    bodySelectors: ['.AnswerPage'],
    usesSPA: true,
  },
  wikipedia: {
    type: 'wikipedia',
    headlineSelectors: ['h1.firstHeading', '#firstHeading'],
    bodySelectors: ['#bodyContent', '.mw-parser-output'],
    usesSPA: false,
  },
};

// ── Translation Types ──

export const TRANSLATION_TYPE_LABELS: Record<string, string> = {
  clarity: 'Clarity',
  'anti-propaganda': 'Anti-Propaganda',
  euphemism: 'Euphemism',
  satirical: 'Satirical',
};

// ── Default Settings ──

export const DEFAULT_SETTINGS = {
  showBadge: true,
  showTranslations: true,
} as const;

// ── Status Formatting ──

export const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  consensus: 'Consensus',
  pending: 'Pending',
  rejected: 'Rejected',
};

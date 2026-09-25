/**
 * Trust Assembly Mobile App — Type Definitions
 * Ported from the browser extension's api-client.js and content.js data models
 */

// ── User / Auth ──

export interface TAUser {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  display_name?: string;
  profile?: UserProfile | string;
  trustScore?: number;
}

export interface UserProfile {
  displayName?: string;
  gender?: string | null;
  age?: number | null;
  country?: string | null;
  state?: string | null;
  politicalAffiliation?: string | null;
  currentStreak?: number;
}

export interface TAUserSummary {
  username: string;
  displayName?: string;
  id: string;
}

export interface AuthToken {
  token: string;
  user: TAUserSummary;
}

// ── API Response: GET /api/corrections?url=xxx ──

export interface Translation {
  id: string;
  original: string;
  translated: string;
  type: 'clarity' | 'anti-propaganda' | 'euphemism' | 'satirical';
  orgName: string;
  orgId?: string;
  status: 'approved' | 'pending' | 'consensus';
  evidence?: string;
}

export interface Correction {
  id: string;
  submissionType: 'correction' | 'affirmation' | 'translation';
  originalHeadline: string;
  replacement: string;
  author: string;
  reasoning: string;
  evidence: Array<{ url: string; explanation: string }>;
  submittedBy: string;
  orgName: string;
  orgId?: string;
  status: 'approved' | 'pending' | 'consensus' | 'rejected';
  trustScore: number | null;
  profile: UserProfile;
  inlineEdits?: Array<{ original: string; replacement: string; reasoning?: string | null }>;
  type?: 'correction' | 'affirmation' | 'translation';
}

export interface Affirmation {
  id: string;
  submissionType: 'affirmation';
  originalHeadline: string;
  replacement: string;
  author: string;
  reasoning: string;
  evidence: Array<{ url: string; explanation: string }>;
  submittedBy: string;
  orgName: string;
  orgId?: string;
  status: 'approved' | 'pending' | 'consensus';
  trustScore: number | null;
  profile: UserProfile;
  inlineEdits?: Array<{ original: string; replacement: string; reasoning?: string | null }>;
}

export interface CorrectionsResponse {
  corrections: Correction[];
  affirmations: Affirmation[];
  translations: Translation[];
  meta: {
    totalReviews: number;
    highestConsensus: boolean;
  };
}

// ── API Response: GET /api/users/me/notifications ──

export interface NotificationApplication {
  id: string;
  display_name?: string;
  username: string;
  org_name: string;
  status: string;
}

export interface NotificationData {
  totalPending: number;
  applications?: { count: number; items: NotificationApplication[] };
  jury?: { count: number; items: Array<{ id: string; title: string; orgName: string }> };
  updates?: { count: number; items: Array<{ id: string; title: string; type: string }> };
}

// ── Assembly ──

export interface Assembly {
  id: string;
  name: string;
  slug?: string;
  description: string;
  memberCount?: number;
  isMember: boolean;
  isFollowing: boolean;
  trustScore?: number;
  profile?: string;
}

export interface AssemblyResponse {
  joined: Assembly[];
  followed: Assembly[];
}

export interface SubmissionDraft<T = unknown> {
  id: string;
  url: string;
  title: string;
  draftData?: T;
  updatedAt?: string;
  createdAt?: string;
}

export interface SubmissionResultItem {
  id: string;
}

export interface SubmissionResult {
  id?: string;
  submissions?: SubmissionResultItem[];
  count?: number;
  error?: string;
}

export interface VaultSubmissionResult {
  id?: string;
  entries?: Array<{ id: string }>;
  count?: number;
  error?: string;
}

// ── Vault ──

export type VaultType = 'correction' | 'argument' | 'belief' | 'translation';

export interface VaultEntry {
  id: string;
  type: VaultType;
  title: string;
  content: string;
  orgName: string;
  status: 'approved' | 'pending' | 'consensus';
  evidence?: Array<{ url: string; explanation: string }>;
}

export interface VaultResponse {
  items: VaultEntry[];
  total: number;
}

// ── App Storage ──

export interface TASettings {
  showBadge: boolean;
  showTranslations: boolean;
}

export interface SiteMuteMap {
  [domain: string]: boolean;
}

export interface CachedCorrections {
  [url: string]: {
    data: CorrectionsResponse;
    timestamp: number;
  };
}

// ── Native → WebView Message Types ──

export type WebViewMessage =
  | { type: 'TA_FETCH_RESULT'; requestId: string; response: { ok: boolean; data?: unknown; error?: string } }
  | { type: 'TA_SETTINGS_CHANGED'; settings: Partial<TASettings> }
  | { type: 'TA_SITE_MUTE_CHANGED'; domain: string; muted: boolean }
  | { type: 'TA_TOGGLE_PANEL' }
  | { type: 'TA_TOGGLE_TRANSLATIONS' }
  | { type: 'TA_DESIGN_INJECT'; data: CorrectionsResponse }
  | { type: 'TA_DESIGN_CLEAR' }
  | { type: 'TA_DESIGN_SCAN_HEADLINES' }
  | { type: 'TA_DESIGN_HIGHLIGHT'; index: number }
  | { type: 'TA_DESIGN_REPORT' }
  | { type: 'TA_DESIGN_CLEAR_REPORT' };

// ── WebView → Native Message Types ──

export type NativeMessage =
  | { type: 'TA_FETCH'; requestId: string; url: string }
  | { type: 'TA_COUNT'; count: number; url: string; signalType?: string }
  | { type: 'TA_DESIGN_SCAN_RESULT'; headlines: Array<{ text: string; selector: string; index: number }> }
  | { type: 'TA_DESIGN_REPORT_READY'; report: string }
  | { type: 'TA_HEADLINE_FOUND'; headline: string };

// ── Design Tab Mock Data ──

export interface DesignCorrection {
  id: string;
  submissionType: 'correction' | 'affirmation' | 'translation';
  originalHeadline: string;
  replacement: string;
  reasoning: string;
  orgName: string;
  status: string;
  trustScore: number;
  profile: { displayName: string };
}

// ── Translation Types (for inline rendering) ──

export const TRANSLATION_COLORS: Record<string, string> = {
  clarity: '#2A6B6B',        // teal
  'anti-propaganda': '#D4850A', // orange
  euphemism: '#C4573F',      // red
  satirical: '#5B2D8E',      // purple
};

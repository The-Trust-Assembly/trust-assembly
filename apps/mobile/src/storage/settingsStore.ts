/**
 * Trust Assembly Mobile App — Settings Store
 * Ported from extensions/chrome/popup.js settings + extensions/chrome/content.js mute logic
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SETTINGS_KEY, MUTED_KEY, CACHED_CORRECTIONS_KEY, CACHE_TTL, DEFAULT_SETTINGS } from '../utils/constants';
import type { TASettings, SiteMuteMap, CachedCorrections } from '../types/trustAssembly';
import type { CorrectionsResponse } from '../types/trustAssembly';
import { correctionCacheKey } from '../utils/urlUtils';

// ── Settings ──

export async function getSettings(): Promise<TASettings> {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!stored) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(stored);
    return {
      showBadge: parsed.showBadge !== undefined ? parsed.showBadge : true,
      showTranslations: parsed.showTranslations !== undefined ? parsed.showTranslations : true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: TASettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('[Trust Assembly] Failed to save settings:', e);
  }
}

export async function toggleSetting(key: 'showBadge' | 'showTranslations'): Promise<TASettings> {
  const settings = await getSettings();
  settings[key] = !settings[key];
  await saveSettings(settings);
  return settings;
}

// ── Site Mute ──

export async function isSiteMuted(domain: string): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(MUTED_KEY);
    if (!stored) return false;
    const muted: SiteMuteMap = JSON.parse(stored);
    return !!muted[domain];
  } catch {
    return false;
  }
}

export async function setSiteMuted(domain: string, muted: boolean): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(MUTED_KEY);
    const sites: SiteMuteMap = stored ? JSON.parse(stored) : {};
    if (muted) {
      sites[domain] = true;
    } else {
      delete sites[domain];
    }
    await AsyncStorage.setItem(MUTED_KEY, JSON.stringify(sites));
  } catch (e) {
    console.warn('[Trust Assembly] Failed to update mute state:', e);
  }
}

export async function getMutedSites(): Promise<SiteMuteMap> {
  try {
    const stored = await AsyncStorage.getItem(MUTED_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as SiteMuteMap;
  } catch {
    return {};
  }
}

// ── Cached Corrections ──

export async function getCachedCorrections(url: string): Promise<CorrectionsResponse | null> {
  try {
    const stored = await AsyncStorage.getItem(CACHED_CORRECTIONS_KEY);
    if (!stored) return null;
    const cache: CachedCorrections = JSON.parse(stored);
    const key = correctionCacheKey(url);
    const entry = cache[key];
    if (!entry) return null;
    // Check TTL
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      // Expired — remove it
      delete cache[key];
      await AsyncStorage.setItem(CACHED_CORRECTIONS_KEY, JSON.stringify(cache));
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export async function cacheCorrections(url: string, data: CorrectionsResponse): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(CACHED_CORRECTIONS_KEY);
    const cache: CachedCorrections = stored ? JSON.parse(stored) : {};
    cache[correctionCacheKey(url)] = { data, timestamp: Date.now() };
    // Prune old entries (keep max 50)
    const keys = Object.keys(cache);
    if (keys.length > 50) {
      const sorted = keys.sort(
        (a, b) => cache[a].timestamp - cache[b].timestamp,
      );
      for (let i = 0; i < keys.length - 50; i++) {
        delete cache[sorted[i]];
      }
    }
    await AsyncStorage.setItem(CACHED_CORRECTIONS_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('[Trust Assembly] Failed to cache corrections:', e);
  }
}

export async function clearCachedCorrections(): Promise<void> {
  await AsyncStorage.removeItem(CACHED_CORRECTIONS_KEY);
}

// ── Form State (port from popup.js) ──

export const FORM_STATE_KEY = 'ta-form-draft';

export interface FormState {
  url?: string;
  contentType?: string;
  submitType: 'correction' | 'affirmation';
  headline: string;
  replacement: string;
  reasoning: string;
  selectedAuthors: string[];
  selectedOrgIds: string[];
  inlineEdits: Array<{ id: string; original: string; replacement: string; reasoning?: string }>;
  vaultItems: {
    correction: Array<{ id: string; assertion: string; evidence: string }>;
    argument: Array<{ id: string; content: string }>;
    belief: Array<{ id: string; content: string }>;
    translation: Array<{ id: string; original: string; translated: string; translationType: string }>;
  };
  vaultSectionsOpen: { correction: boolean; argument: boolean; belief: boolean; translation: boolean };
  vaultBodyOpen: boolean;
  inlineEditsOpen: boolean;
}

export async function getFormState(): Promise<FormState> {
    const defaults: FormState = {
    submitType: 'correction',
    headline: '',
    replacement: '',
    reasoning: '',
    selectedAuthors: [],
    selectedOrgIds: [],
    inlineEdits: [],
    vaultItems: {
      correction: [],
      argument: [],
      belief: [],
      translation: [],
    },
    vaultSectionsOpen: { correction: false, argument: false, belief: false, translation: false },
    vaultBodyOpen: false,
    inlineEditsOpen: false,
  };

  try {
    const stored = await AsyncStorage.getItem(FORM_STATE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...defaults, ...parsed };
    }
  } catch {
    // Use defaults
  }

  return defaults;
}

export async function saveFormState(state: FormState): Promise<void> {
  try {
    await AsyncStorage.setItem(FORM_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[Trust Assembly] Failed to save form state:', e);
  }
}

export async function clearFormState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(FORM_STATE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Trust Assembly Mobile App — API Client
 * Ported from extensions/chrome/api-client.js
 *
 * Handles auth, corrections fetching, notifications, drafts, assemblies, etc.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TA_API_BASE, TOKEN_KEY, USER_KEY, ASSEMBLIES_KEY } from '../utils/constants';
import type {
  TAUser,
  TAUserSummary,
  CorrectionsResponse,
  NotificationData,
  Assembly,
  VaultEntry,
  Correction,
  Affirmation,
  Translation,
  AssemblyResponse,
  SubmissionDraft,
  SubmissionResult,
  VaultSubmissionResult,
} from '../types/trustAssembly';

// ── Storage Helpers ──

let authInvalidatedListener: (() => void) | null = null;

export function setAuthInvalidatedListener(listener: (() => void) | null): void {
  authInvalidatedListener = listener;
}

export async function secureGet(key: string): Promise<string | null> {
  return await SecureStore.getItemAsync(key);
}

export async function secureSet(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function secureRemove(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

async function clearAuthStorage(): Promise<void> {
  await Promise.all([
    secureRemove(TOKEN_KEY),
    secureRemove(USER_KEY),
    AsyncStorage.removeItem(ASSEMBLIES_KEY),
  ]);
}

// ── Core API ──

export async function authedFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = await secureGet(TOKEN_KEY);
  const headers = new Headers(opts.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  headers.set('Content-Type', 'application/json');

  const res = await fetch(url, { ...opts, headers });

  if (res.status === 401) {
    await clearAuthStorage();
    authInvalidatedListener?.();
  }

  return res;
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const url = `${TA_API_BASE}${path}`;
  const res = await authedFetch(url, opts);

  if (!res.ok) {
    const reason = await res
      .json()
      .then((data: { error: string }) => data.error)
      .catch(() => `Error: ${res.statusText}`);
        throw new Error(reason);
  }

  return (await res.json()) as T;
}

/** Public endpoints intentionally omit the account bearer token. */
export async function publicApiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  if (opts.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${TA_API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const reason = await res
      .json()
      .then((data: { error?: string }) => data.error || `Request failed (${res.status})`)
      .catch(() => `Request failed (${res.status})`);
    throw new Error(reason);
  }
  return (await res.json()) as T;
}

export async function getPublicOverlayResource(path: string): Promise<unknown> {
  return publicApiFetch<unknown>(path);
}

// ── Auth ──

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  username: string;
  displayName?: string;
  id: string;
}

/** Log in and store token. Returns user data or null on failure. */
export async function login(username: string, password: string): Promise<TAUser | null> {
  try {
    const data = await apiFetch<LoginResponse>(`/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    if (data.token) {
      const userSummary: TAUserSummary = {
        username: data.username,
        displayName: data.displayName,
        id: data.id,
      };
      await SecureStore.setItemAsync(TOKEN_KEY, data.token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userSummary));
    }
    return {
      id: data.id,
      username: data.username,
      email: data.username,
      displayName: data.displayName,
    };
  } catch (e: any) {
    console.warn('[Trust Assembly] Login failed:', e.message);
    return null;
  }
}

/** Clear stored auth. */
export async function logout(): Promise<void> {
  await clearAuthStorage();
}

// ── Assemblies ──

type RawAssembly = Partial<Assembly> & { id?: unknown; name?: unknown; description?: unknown };

function normalizeAssembly(value: RawAssembly, relation: 'joined' | 'followed'): Assembly | null {
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  return {
    id: value.id,
    name: value.name,
    description: typeof value.description === 'string' ? value.description : '',
    slug: typeof value.slug === 'string' ? value.slug : undefined,
    memberCount: typeof value.memberCount === 'number' ? value.memberCount : undefined,
    isMember: relation === 'joined' || value.isMember === true,
    isFollowing: relation === 'followed' || value.isFollowing === true,
    trustScore: typeof value.trustScore === 'number' ? value.trustScore : undefined,
    profile: typeof value.profile === 'string' ? value.profile : undefined,
  };
}

function normalizeAssemblies(data: { joined?: RawAssembly[]; followed?: RawAssembly[] }): AssemblyResponse {
  return {
    joined: (data.joined || [])
      .map((item) => normalizeAssembly(item, 'joined'))
      .filter((item): item is Assembly => item !== null),
    followed: (data.followed || [])
      .map((item) => normalizeAssembly(item, 'followed'))
      .filter((item): item is Assembly => item !== null),
  };
}

/** Get user's joined + followed assemblies; cache is offline fallback only. */
export async function getUserAssemblies(): Promise<AssemblyResponse> {
  try {
    const data = await apiFetch<{ joined?: RawAssembly[]; followed?: RawAssembly[] }>(
      `/api/users/me/assemblies`
    );
    const normalized = normalizeAssemblies(data);
    await AsyncStorage.setItem(ASSEMBLIES_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    const cached = await getCachedAssemblies();
    if (cached) return cached;
    return { joined: [], followed: [] };
  }
}

/** Get cached assemblies (no network call). */
export async function getCachedAssemblies(): Promise<AssemblyResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(ASSEMBLIES_KEY);
    if (!raw) return null;
    return normalizeAssemblies(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Follow an assembly. */
export async function followOrg(orgId: string): Promise<any> {
  try {
    const result = await apiFetch(`/api/orgs/${encodeURIComponent(orgId)}/follow`, {
      method: 'POST',
    });
    await clearAssemblyCache();
    return result;
  } catch (e: any) {
    return { error: e.message };
  }
}

/** Unfollow an assembly. */
export async function unfollowOrg(orgId: string): Promise<any> {
  try {
    const result = await apiFetch(`/api/orgs/${encodeURIComponent(orgId)}/follow`, {
      method: 'DELETE',
    });
    await clearAssemblyCache();
    return result;
  } catch (e: any) {
    return { error: e.message };
  }
}

/** Get stored user from secure storage (no network call). */
export async function getStoredUser(): Promise<TAUserSummary | null> {
  const stored = await secureGet(USER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as TAUserSummary;
  } catch {
    return null;
  }
}

/** Verify session is still valid (network call). */
export async function getMe(): Promise<TAUser | null> {
  const res = await authedFetch(`${TA_API_BASE}/api/auth/me`);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Unable to verify session (${res.status})`);
  const data = (await res.json()) as TAUser;
  return {
    ...data,
    displayName: data.displayName || data.display_name,
  };
}

// ── Corrections / Data ──

/** GET /api/corrections?url={encoded_url} */
export async function getForURL(url: string): Promise<CorrectionsResponse> {
  const path = `/api/corrections?url=${encodeURIComponent(url)}`;
  const data = await publicApiFetch<CorrectionsResponse | Array<Correction | Affirmation>>(path);
  if (Array.isArray(data)) {
    return {
      corrections: data.filter((item): item is Correction => item.submissionType !== 'affirmation'),
      affirmations: data.filter((item): item is Affirmation => item.submissionType === 'affirmation'),
      translations: [],
      meta: { totalReviews: data.length, highestConsensus: false },
    };
  }
  const corrections = Array.isArray(data.corrections) ? data.corrections : [];
  const affirmations = Array.isArray(data.affirmations) ? data.affirmations : [];
  return {
    corrections,
    affirmations,
    translations: Array.isArray(data.translations) ? data.translations : [],
    meta: {
      totalReviews: data.meta?.totalReviews ?? corrections.length + affirmations.length,
      highestConsensus: data.meta?.highestConsensus ?? false,
    },
  };
}

// ── Cache Management ──

export async function clearAssemblyCache(): Promise<void> {
  await AsyncStorage.removeItem(ASSEMBLIES_KEY);
}

// ── User Profile ──

export async function getProfile(username: string): Promise<TAUser | null> {
  try {
    const profile = await publicApiFetch<TAUser>(`/api/users/${encodeURIComponent(username)}`);
    return {
      ...profile,
      email: profile.email || '',
      displayName: profile.displayName || profile.display_name,
    };
  } catch {
    return null;
  }
}

// ── Assembly Details ──

export async function getAssembly(id: string): Promise<any> {
  try {
    return await publicApiFetch(`/api/orgs/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

export async function getTranslations(orgId: string): Promise<Translation[]> {
  try {
    const params = new URLSearchParams({
      type: 'translation',
      orgId,
      status: 'approved',
      limit: '100',
    });
    const data = await publicApiFetch<{ entries?: Array<Record<string, unknown>> }>(
      `/api/vault?${params.toString()}`,
    );
    return (data.entries || []).map((entry) => ({
      ...(entry as unknown as Translation),
      original: String(entry.original_text || ''),
      translated: String(entry.translated_text || ''),
      type: String(entry.translation_type || 'clarity') as Translation['type'],
      orgName: String(entry.org_name || 'Unknown Org'),
      orgId: typeof entry.org_id === 'string' ? entry.org_id : undefined,
    }));
  } catch {
    return [];
  }
}

// ── Vault ──

export async function getVault(
  orgIds: string | string[],
  type: 'vault' | 'argument' | 'belief' = 'vault',
  limit: number = 5,
  url?: string,
): Promise<VaultEntry[]> {
  try {
    const orgIdsStr = Array.isArray(orgIds) ? orgIds.join(',') : orgIds;
    const params = new URLSearchParams({
      type,
      orgIds: orgIdsStr,
      status: 'approved',
      limit: String(limit),
    });
    if (url) params.set('url', url);
    const data = await publicApiFetch<{ entries?: VaultEntry[] }>(`/api/vault?${params.toString()}`);
    return data.entries || [];
  } catch {
    return [];
  }
}

// ── Notifications ──

/** GET /api/users/me/notifications — for background polling. */
export async function getNotifications(): Promise<NotificationData | null> {
  try {
    return await apiFetch<NotificationData>(`/api/users/me/notifications`);
  } catch {
    return null;
  }
}

// ── Drafts ──

export async function getDrafts(): Promise<SubmissionDraft[]> {
  try {
    const data = await apiFetch<{ drafts: SubmissionDraft[] }>(`/api/drafts`);
    return data.drafts || [];
  } catch {
    return [];
  }
}

export async function getDraft(id: string): Promise<SubmissionDraft | null> {
  try {
    const data = await apiFetch<{ draft: SubmissionDraft | null }>(`/api/drafts/${encodeURIComponent(id)}`);
    return data.draft || null;
  } catch {
    return null;
  }
}

export async function getDraftByUrl(url: string): Promise<SubmissionDraft | null> {
  try {
    const data = await apiFetch<{ draft: SubmissionDraft | null }>(
      `/api/drafts/by-url?url=${encodeURIComponent(url)}`,
    );
    return data.draft || null;
  } catch {
    return null;
  }
}

export async function saveDraft(url: string, title: string, draftData: unknown): Promise<any> {
  try {
    return await apiFetch(`/api/drafts`, {
      method: 'POST',
      body: JSON.stringify({ url, title, draftData }),
    });
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function deleteDraft(id: string): Promise<boolean> {
  try {
    await apiFetch(`/api/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}

// ── Submit ──

export async function submitCorrection(payload: unknown): Promise<SubmissionResult> {
  try {
    return await apiFetch(`/api/submissions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (e: any) {
    return { error: e.message };
  }
}

/** Alias for getForURL — fetch corrections for a URL */
export async function getCorrections(url: string): Promise<CorrectionsResponse> {
  return getForURL(url);
}

/** Submit a vault artifact (standing correction, argument, belief, or translation) */
export async function submitVault(data: unknown): Promise<VaultSubmissionResult> {
  try {
    return await apiFetch(`/api/vault`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } catch (e: any) {
    return { error: e.message };
  }
}




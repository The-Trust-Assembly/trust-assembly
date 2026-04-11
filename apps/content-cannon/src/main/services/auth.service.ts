import { loadCredentials, getDefaultAccountId } from './credentials.service';
import log from 'electron-log';

interface AuthState {
  token: string | null;
  userId: string | null;
  username: string | null;
  displayName: string | null;
  expiresAt: number | null;
}

const authStates = new Map<string, AuthState>();

function emptyAuth(): AuthState {
  return { token: null, userId: null, username: null, displayName: null, expiresAt: null };
}

function resolveAccount(accountId?: string): string {
  return accountId || getDefaultAccountId() || '';
}

function getBaseUrl(accountId?: string): string {
  const creds = loadCredentials(accountId);
  return creds?.taBaseUrl || 'https://trustassembly.org';
}

export async function login(accountId?: string, username?: string, password?: string): Promise<AuthState> {
  const id = resolveAccount(accountId);
  const creds = loadCredentials(id);
  const user = username || creds?.taUsername;
  const pass = password || creds?.taPassword;

  if (!user || !pass) {
    throw new Error('No credentials available. Please set up your account first.');
  }

  const baseUrl = getBaseUrl(id);
  log.info(`Logging in to ${baseUrl} as ${user} (account: ${id})`);

  const cleanUser = user.trim().replace(/^@/, '').replace(/\s+/g, ' ');
  const cleanPass = pass.trim();

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: cleanUser, password: cleanPass }),
  });

  const responseText = await response.text();
  log.info(`Login response for ${id}: ${response.status} ${responseText.substring(0, 500)}`);

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Login failed: unexpected response from server`);
  }

  if (!response.ok) {
    throw new Error(data.error || `Login failed with status ${response.status}`);
  }

  const state: AuthState = {
    token: data.token,
    userId: data.id || data.user?.id,
    username: data.username || data.user?.username,
    displayName: data.displayName || data.user?.displayName,
    expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) - (60 * 60 * 1000),
  };

  authStates.set(id, state);
  log.info(`Logged in as ${state.username} (${state.userId}) for account ${id}`);
  return state;
}

export async function ensureAuth(accountId?: string): Promise<string> {
  const id = resolveAccount(accountId);
  const state = authStates.get(id);
  if (!state?.token || (state.expiresAt && Date.now() > state.expiresAt)) {
    log.info(`Token expired or missing for account ${id}, re-authenticating...`);
    await login(id);
  }
  return authStates.get(id)!.token!;
}

export function getAuthState(accountId?: string): AuthState {
  const id = resolveAccount(accountId);
  return { ...(authStates.get(id) || emptyAuth()) };
}

export function logout(accountId?: string): void {
  if (accountId) {
    authStates.delete(accountId);
  } else {
    authStates.clear();
  }
}

export async function fetchWithAuth(url: string, options: RequestInit = {}, accountId?: string): Promise<Response> {
  const id = resolveAccount(accountId);
  const token = await ensureAuth(id);
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    log.warn(`Got 401 for account ${id}, attempting re-login...`);
    await login(id);
    const newToken = await ensureAuth(id);
    const retryHeaders = {
      ...options.headers,
      'Authorization': `Bearer ${newToken}`,
      'Content-Type': 'application/json',
    };
    return fetch(url, { ...options, headers: retryHeaders });
  }

  return response;
}

export async function listAssemblies(accountId?: string): Promise<Array<{ id: string; name: string; member_count: string }>> {
  const baseUrl = getBaseUrl(accountId);
  const response = await fetchWithAuth(`${baseUrl}/api/orgs`, {}, accountId);
  if (!response.ok) throw new Error('Failed to list assemblies');
  const data = await response.json();
  return data.organizations || data.orgs || data;
}

export async function listUserAssemblies(accountId?: string): Promise<Array<{ id: string; name: string; member_count: string }>> {
  const baseUrl = getBaseUrl(accountId);
  const response = await fetchWithAuth(`${baseUrl}/api/users/me/assemblies`, {}, accountId);
  if (!response.ok) {
    return listAssemblies(accountId);
  }
  const data = await response.json();
  return data.assemblies || data.organizations || data;
}

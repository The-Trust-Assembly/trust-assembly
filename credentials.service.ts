import { safeStorage } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';

export interface StoredCredentials {
  taUsername: string;
  taPassword: string;
  claudeApiKey: string;
  taBaseUrl: string;
  defaultOrgId: string;
  defaultOrgName: string;
}

export interface AccountSummary {
  accountId: string;
  taUsername: string;
  taBaseUrl: string;
  defaultOrgId: string;
  defaultOrgName: string;
}

const store: any = new Store({
  name: 'trust-assembly-credentials',
  encryptionKey: 'ta-desktop-local-key',
});

// --- Helpers ---

function slugify(username: string): string {
  return username.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'default';
}

function encrypt(creds: StoredCredentials): string {
  const json = JSON.stringify(creds);
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(json).toString('base64');
  }
  return Buffer.from(json).toString('base64');
}

function decrypt(raw: string): StoredCredentials | null {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return JSON.parse(safeStorage.decryptString(Buffer.from(raw, 'base64')));
    }
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

// --- Migration from single-account format ---

export function migrateIfNeeded(): void {
  // Old format: store has 'credentials' key (single blob)
  // New format: store has 'accounts' object + 'defaultAccountId'
  if (store.has('credentials') && !store.has('accounts')) {
    const raw = store.get('credentials');
    if (raw) {
      const creds = decrypt(raw);
      if (creds) {
        const accountId = slugify(creds.taUsername);
        log.info(`Migrating single-account credentials to multi-account format: ${accountId}`);
        store.set(`accounts.${accountId}`, encrypt(creds));
        store.set('defaultAccountId', accountId);
      }
    }
    store.delete('credentials');
  }
}

// --- Multi-account credential management ---

export function getDefaultAccountId(): string | null {
  return store.get('defaultAccountId') || null;
}

export function setDefaultAccountId(accountId: string): void {
  store.set('defaultAccountId', accountId);
}

function resolveAccountId(accountId?: string): string {
  if (accountId) return accountId;
  const defaultId = getDefaultAccountId();
  if (defaultId) return defaultId;
  // Fall back to first account
  const accounts = store.get('accounts') || {};
  const keys = Object.keys(accounts);
  return keys[0] || '';
}

export function saveCredentials(creds: StoredCredentials, accountId?: string): string {
  const id = accountId || slugify(creds.taUsername);
  store.set(`accounts.${id}`, encrypt(creds));
  // If this is the first account, make it default
  if (!getDefaultAccountId()) {
    store.set('defaultAccountId', id);
  }
  return id;
}

export function loadCredentials(accountId?: string): StoredCredentials | null {
  const id = resolveAccountId(accountId);
  if (!id) return null;
  const raw = store.get(`accounts.${id}`);
  if (!raw) return null;
  return decrypt(raw);
}

export function clearCredentials(accountId: string): void {
  store.delete(`accounts.${accountId}`);
  // If we deleted the default, pick a new one
  if (getDefaultAccountId() === accountId) {
    const accounts = store.get('accounts') || {};
    const remaining = Object.keys(accounts);
    store.set('defaultAccountId', remaining[0] || '');
  }
}

export function hasCredentials(): boolean {
  const accounts = store.get('accounts') || {};
  return Object.keys(accounts).length > 0;
}

export function listAccounts(): AccountSummary[] {
  const accounts = store.get('accounts') || {};
  const result: AccountSummary[] = [];
  for (const id of Object.keys(accounts)) {
    const creds = decrypt(accounts[id]);
    if (creds) {
      result.push({
        accountId: id,
        taUsername: creds.taUsername,
        taBaseUrl: creds.taBaseUrl,
        defaultOrgId: creds.defaultOrgId,
        defaultOrgName: creds.defaultOrgName,
      });
    }
  }
  return result;
}

export function deriveAccountId(username: string): string {
  return slugify(username);
}

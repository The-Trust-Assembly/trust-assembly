import { ipcMain, BrowserWindow, shell } from 'electron';
import {
  saveCredentials,
  loadCredentials,
  hasCredentials,
  clearCredentials,
  listAccounts,
  getDefaultAccountId,
  setDefaultAccountId,
  deriveAccountId,
  migrateIfNeeded,
} from './services/credentials.service';
import { login, logout, getAuthState, listAssemblies, listUserAssemblies } from './services/auth.service';
import { resetClient } from './services/claude.service';
import { runPipeline, submitApprovedBatch, retrySubmissions, getPendingSubmissions, clearAllPending, generateRunId, RunResult, SynthesizedBatch } from './services/pipeline.service';
import { getBudgetConfig, setBudgetConfig, getUsageSummary, checkBudget } from './services/budget.service';
import log from 'electron-log';
import Store from 'electron-store';

const historyStore: any = new Store({
  name: 'trust-assembly-history',
  defaults: { runs: [] },
});

// --- Active pipeline runs ---
interface ActiveRun {
  runId: string;
  accountId: string;
  topic: string;
  startedAt: string;
  cancel: () => void;
}

const activeRuns = new Map<string, ActiveRun>();

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  // Run migration on startup
  migrateIfNeeded();

  // --- Shell ---
  ipcMain.handle('shell:open-external', (_event, url: string) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      return shell.openExternal(url);
    }
  });

  // --- Accounts (multi-account management) ---
  ipcMain.handle('accounts:list', () => {
    const accounts = listAccounts();
    const defaultId = getDefaultAccountId();
    return accounts.map(a => ({
      ...a,
      isDefault: a.accountId === defaultId,
      authStatus: getAuthState(a.accountId).token ? 'authenticated' : 'unauthenticated',
    }));
  });

  ipcMain.handle('accounts:set-default', (_event, accountId: string) => {
    setDefaultAccountId(accountId);
    return true;
  });

  ipcMain.handle('accounts:remove', (_event, accountId: string) => {
    clearCredentials(accountId);
    logout(accountId);
    resetClient(accountId);
    return true;
  });

  // --- Credentials ---
  ipcMain.handle('credentials:has', () => hasCredentials());

  ipcMain.handle('credentials:save', async (_event, { creds, accountId }) => {
    const id = saveCredentials(creds, accountId);
    resetClient(id);
    return id;
  });

  ipcMain.handle('credentials:load', (_event, accountId?: string) => {
    const creds = loadCredentials(accountId);
    if (!creds) return null;
    return {
      taUsername: creds.taUsername,
      claudeApiKey: creds.claudeApiKey ? '••••••••' : '',
      taBaseUrl: creds.taBaseUrl,
      defaultOrgId: creds.defaultOrgId,
      defaultOrgName: creds.defaultOrgName,
    };
  });

  ipcMain.handle('credentials:clear', (_event, accountId?: string) => {
    if (accountId) {
      clearCredentials(accountId);
      logout(accountId);
      resetClient(accountId);
    } else {
      // Clear all (legacy behavior)
      const accounts = listAccounts();
      for (const a of accounts) {
        clearCredentials(a.accountId);
      }
      logout();
      resetClient();
    }
    return true;
  });

  // --- Auth ---
  ipcMain.handle('auth:login', async (_event, accountId?: string) => {
    try {
      const state = await login(accountId);
      return { success: true, user: state };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:status', (_event, accountId?: string) => getAuthState(accountId));
  ipcMain.handle('auth:logout', (_event, accountId?: string) => { logout(accountId); return true; });

  ipcMain.handle('auth:list-assemblies', async (_event, accountId?: string) => {
    try {
      return { success: true, assemblies: await listAssemblies(accountId) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:list-user-assemblies', async (_event, accountId?: string) => {
    try {
      return { success: true, assemblies: await listUserAssemblies(accountId) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // --- Pipeline Phase 1: Run (NON-BLOCKING — returns runId immediately) ---
  ipcMain.handle('pipeline:run', (_event, { topic, scope, accountId }) => {
    const resolvedAccountId = accountId || getDefaultAccountId() || '';
    const runId = generateRunId();
    const abortController = new AbortController();
    const win = getWindow();

    const promise = runPipeline(topic, scope, resolvedAccountId, runId, win, abortController.signal)
      .then(batch => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('pipeline:run-complete', { runId, accountId: resolvedAccountId, batch });
        }
      })
      .catch(error => {
        log.error(`Pipeline run ${runId} failed:`, error);
        if (win && !win.isDestroyed()) {
          win.webContents.send('pipeline:run-complete', { runId, accountId: resolvedAccountId, error: error.message });
        }
      })
      .finally(() => {
        activeRuns.delete(runId);
      });

    activeRuns.set(runId, {
      runId,
      accountId: resolvedAccountId,
      topic,
      startedAt: new Date().toISOString(),
      cancel: () => abortController.abort(),
    });

    return { success: true, runId, accountId: resolvedAccountId };
  });

  // --- Pipeline: Cancel ---
  ipcMain.handle('pipeline:cancel', (_event, runId: string) => {
    const run = activeRuns.get(runId);
    if (run) {
      run.cancel();
      activeRuns.delete(runId);
      return { success: true };
    }
    return { success: false, error: 'Run not found' };
  });

  // --- Pipeline: Active runs ---
  ipcMain.handle('pipeline:active-runs', () => {
    return Array.from(activeRuns.values()).map(r => ({
      runId: r.runId,
      accountId: r.accountId,
      topic: r.topic,
      startedAt: r.startedAt,
    }));
  });

  // --- Pipeline Phase 2: Submit user-approved batch ---
  ipcMain.handle('pipeline:submit-approved', async (_event, { batch, orgIds, accountId }: { batch: SynthesizedBatch; orgIds: string[]; accountId?: string }) => {
    const win = getWindow();
    const resolvedAccountId = accountId || batch.accountId || getDefaultAccountId() || '';
    try {
      const result = await submitApprovedBatch(batch, orgIds, resolvedAccountId, win);

      const runs = historyStore.get('runs') || [];
      runs.unshift(result);
      if (runs.length > 100) runs.splice(100);
      historyStore.set('runs', runs);

      return { success: true, result };
    } catch (error: any) {
      log.error('Submit approved failed:', error);
      return { success: false, error: error.message };
    }
  });

  // --- Pipeline: Retry pending ---
  ipcMain.handle('pipeline:retry', async (_event, { orgId, accountId }) => {
    const win = getWindow();
    const resolvedAccountId = accountId || getDefaultAccountId() || '';
    try {
      const result = await retrySubmissions(orgId, resolvedAccountId, win);
      const runs = historyStore.get('runs') || [];
      runs.unshift(result);
      if (runs.length > 100) runs.splice(100);
      historyStore.set('runs', runs);
      return { success: true, result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pipeline:pending', () => getPendingSubmissions());
  ipcMain.handle('pipeline:clear-pending', () => { clearAllPending(); return true; });

  // --- History ---
  ipcMain.handle('history:list', () => historyStore.get('runs') || []);
  ipcMain.handle('history:get', (_event, runId: string) => {
    const runs = historyStore.get('runs') || [];
    return runs.find((r: RunResult) => r.runId === runId) || null;
  });
  ipcMain.handle('history:clear', () => { historyStore.set('runs', []); return true; });

  // --- Budget ---
  ipcMain.handle('budget:get-config', () => getBudgetConfig());
  ipcMain.handle('budget:set-config', (_event, config) => setBudgetConfig(config));
  ipcMain.handle('budget:get-usage', () => getUsageSummary());
  ipcMain.handle('budget:check', () => checkBudget());
}

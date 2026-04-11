import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('trustAssembly', {
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // --- Multi-account management ---
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    setDefault: (accountId: string) => ipcRenderer.invoke('accounts:set-default', accountId),
    remove: (accountId: string) => ipcRenderer.invoke('accounts:remove', accountId),
  },

  credentials: {
    has: () => ipcRenderer.invoke('credentials:has'),
    save: (creds: any, accountId?: string) => ipcRenderer.invoke('credentials:save', { creds, accountId }),
    load: (accountId?: string) => ipcRenderer.invoke('credentials:load', accountId),
    clear: (accountId?: string) => ipcRenderer.invoke('credentials:clear', accountId),
  },

  auth: {
    login: (accountId?: string) => ipcRenderer.invoke('auth:login', accountId),
    status: (accountId?: string) => ipcRenderer.invoke('auth:status', accountId),
    logout: (accountId?: string) => ipcRenderer.invoke('auth:logout', accountId),
    listAssemblies: (accountId?: string) => ipcRenderer.invoke('auth:list-assemblies', accountId),
    listUserAssemblies: (accountId?: string) => ipcRenderer.invoke('auth:list-user-assemblies', accountId),
  },

  pipeline: {
    // Non-blocking: returns { runId } immediately, sends pipeline:run-complete event when done
    run: (topic: string, scope: string, accountId?: string) =>
      ipcRenderer.invoke('pipeline:run', { topic, scope, accountId }),
    cancel: (runId: string) => ipcRenderer.invoke('pipeline:cancel', runId),
    activeRuns: () => ipcRenderer.invoke('pipeline:active-runs'),
    submitApproved: (batch: any, orgIds: string[], accountId?: string) =>
      ipcRenderer.invoke('pipeline:submit-approved', { batch, orgIds, accountId }),
    retry: (orgId: string, accountId?: string) =>
      ipcRenderer.invoke('pipeline:retry', { orgId, accountId }),
    getPending: () => ipcRenderer.invoke('pipeline:pending'),
    clearPending: () => ipcRenderer.invoke('pipeline:clear-pending'),
    onProgress: (callback: (progress: any) => void) => {
      const handler = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('pipeline:progress', handler);
      return () => ipcRenderer.removeListener('pipeline:progress', handler);
    },
    onRunComplete: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('pipeline:run-complete', handler);
      return () => ipcRenderer.removeListener('pipeline:run-complete', handler);
    },
  },

  history: {
    list: () => ipcRenderer.invoke('history:list'),
    get: (runId: string) => ipcRenderer.invoke('history:get', runId),
    clear: () => ipcRenderer.invoke('history:clear'),
  },

  budget: {
    getConfig: () => ipcRenderer.invoke('budget:get-config'),
    setConfig: (config: any) => ipcRenderer.invoke('budget:set-config', config),
    getUsage: () => ipcRenderer.invoke('budget:get-usage'),
    check: () => ipcRenderer.invoke('budget:check'),
  },
});

import React, { useState, useEffect, useCallback } from 'react';
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import ReviewPage from './pages/ReviewPage';
import SettingsPage from './pages/SettingsPage';

declare global {
  interface Window {
    trustAssembly: {
      openExternal: (url: string) => Promise<void>;
      accounts: {
        list: () => Promise<any[]>;
        setDefault: (accountId: string) => Promise<boolean>;
        remove: (accountId: string) => Promise<boolean>;
      };
      credentials: {
        has: () => Promise<boolean>;
        save: (creds: any, accountId?: string) => Promise<string>;
        load: (accountId?: string) => Promise<any>;
        clear: (accountId?: string) => Promise<boolean>;
      };
      auth: {
        login: (accountId?: string) => Promise<{ success: boolean; user?: any; error?: string }>;
        status: (accountId?: string) => Promise<any>;
        logout: (accountId?: string) => Promise<boolean>;
        listAssemblies: (accountId?: string) => Promise<{ success: boolean; assemblies?: any[]; error?: string }>;
        listUserAssemblies: (accountId?: string) => Promise<{ success: boolean; assemblies?: any[]; error?: string }>;
      };
      pipeline: {
        run: (topic: string, scope: string, accountId?: string) => Promise<{ success: boolean; runId?: string; accountId?: string; error?: string }>;
        cancel: (runId: string) => Promise<{ success: boolean }>;
        activeRuns: () => Promise<any[]>;
        submitApproved: (batch: any, orgIds: string[], accountId?: string) => Promise<{ success: boolean; result?: any; error?: string }>;
        retry: (orgId: string, accountId?: string) => Promise<{ success: boolean; result?: any; error?: string }>;
        getPending: () => Promise<any[]>;
        clearPending: () => Promise<boolean>;
        onProgress: (callback: (progress: any) => void) => () => void;
        onRunComplete: (callback: (data: any) => void) => () => void;
      };
      history: {
        list: () => Promise<any[]>;
        get: (runId: string) => Promise<any>;
        clear: () => Promise<boolean>;
      };
      budget: {
        getConfig: () => Promise<any>;
        setConfig: (config: any) => Promise<any>;
        getUsage: () => Promise<any>;
        check: () => Promise<any>;
      };
    };
  }
}

export interface AccountInfo {
  accountId: string;
  taUsername: string;
  taBaseUrl: string;
  defaultOrgId: string;
  defaultOrgName: string;
  isDefault: boolean;
  authStatus: 'authenticated' | 'unauthenticated';
}

export interface RunProgress {
  runId: string;
  accountId: string;
  topic: string;
  stage: string;
  message: string;
  articlesFound: number;
  articlesFetched: number;
  articlesAnalyzed: number;
  total: number;
}

export interface CompletedBatch {
  runId: string;
  accountId: string;
  topic: string;
  batch: any;
}

type Page = 'setup' | 'dashboard' | 'review' | 'settings';

export default function App() {
  const [page, setPage] = useState<Page>('setup');
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [assemblies, setAssemblies] = useState<any[]>([]);
  const [defaultOrgId, setDefaultOrgId] = useState('');

  // Multi-run state
  const [activeRuns, setActiveRuns] = useState<Map<string, RunProgress>>(new Map());
  const [completedBatches, setCompletedBatches] = useState<Map<string, CompletedBatch>>(new Map());
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);

  useEffect(() => {
    checkSetup();
  }, []);

  // Subscribe to pipeline events
  useEffect(() => {
    const unsubProgress = window.trustAssembly.pipeline.onProgress((progress) => {
      setActiveRuns(prev => {
        const next = new Map(prev);
        next.set(progress.runId, progress);
        return next;
      });
    });

    const unsubComplete = window.trustAssembly.pipeline.onRunComplete((data) => {
      // Remove from active
      setActiveRuns(prev => {
        const next = new Map(prev);
        next.delete(data.runId);
        return next;
      });

      if (data.batch && (data.batch.submissions?.length > 0 || data.batch.vaultEntries?.length > 0)) {
        // Add to completed batches
        setCompletedBatches(prev => {
          const next = new Map(prev);
          next.set(data.runId, {
            runId: data.runId,
            accountId: data.accountId,
            topic: data.batch.topic,
            batch: data.batch,
          });
          return next;
        });
      }
    });

    return () => {
      unsubProgress();
      unsubComplete();
    };
  }, []);

  async function checkSetup() {
    try {
      const hasCreds = await window.trustAssembly.credentials.has();
      if (hasCreds) {
        await refreshAccounts();
        // Login all accounts
        const accts = await window.trustAssembly.accounts.list();
        for (const acct of accts) {
          try {
            await window.trustAssembly.auth.login(acct.accountId);
          } catch {}
        }
        await refreshAccounts();
        await loadAssemblies();
        setPage('dashboard');
      } else {
        setPage('setup');
      }
    } catch {
      setPage('setup');
    } finally {
      setLoading(false);
    }
  }

  async function refreshAccounts() {
    const accts = await window.trustAssembly.accounts.list();
    setAccounts(accts);
  }

  async function loadAssemblies() {
    try {
      const result = await window.trustAssembly.auth.listUserAssemblies();
      if (result.success && result.assemblies?.length) {
        setAssemblies(result.assemblies);
        const creds = await window.trustAssembly.credentials.load();
        setDefaultOrgId(creds?.defaultOrgId || result.assemblies[0].id);
      } else {
        const allResult = await window.trustAssembly.auth.listAssemblies();
        if (allResult.success && allResult.assemblies) {
          setAssemblies(allResult.assemblies);
          if (allResult.assemblies.length > 0) setDefaultOrgId(allResult.assemblies[0].id);
        }
      }
    } catch {}
  }

  function handleReview(runId: string) {
    setReviewRunId(runId);
    setPage('review');
  }

  function handleSubmitted(runId: string) {
    setCompletedBatches(prev => {
      const next = new Map(prev);
      next.delete(runId);
      return next;
    });
    setReviewRunId(null);
    setPage('dashboard');
  }

  function handleBackFromReview() {
    setReviewRunId(null);
    setPage('dashboard');
  }

  const reviewBatch = reviewRunId ? completedBatches.get(reviewRunId) : null;

  if (loading) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img src={new URL('./styles/icon.png', import.meta.url).href} alt="Trust Assembly" style={{ width: 48, height: 48 }} />
          <div>
            <h1>Trust Assembly Agent</h1>
            <div className="subtitle">Truth Will Out.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {page !== 'setup' && (
            <>
              <span className={`nav-link ${page === 'dashboard' ? 'nav-link-active' : ''}`}
                onClick={() => { setReviewRunId(null); setPage('dashboard'); }}>
                Dashboard
                {activeRuns.size > 0 && (
                  <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--gold)', color: 'white', borderRadius: 8, padding: '1px 6px' }}>
                    {activeRuns.size}
                  </span>
                )}
              </span>
              {completedBatches.size > 0 && (
                <span className={`nav-link ${page === 'review' ? 'nav-link-active' : ''}`}
                  onClick={() => {
                    const firstRunId = Array.from(completedBatches.keys())[0];
                    handleReview(firstRunId);
                  }}>
                  Review
                  <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--gold)', color: 'white', borderRadius: 8, padding: '1px 6px' }}>
                    {completedBatches.size}
                  </span>
                </span>
              )}
              <span className={`nav-link ${page === 'settings' ? 'nav-link-active' : ''}`}
                onClick={() => setPage('settings')}>Settings</span>
            </>
          )}
        </div>
      </header>

      {page === 'setup' && (
        <SetupPage onComplete={async () => {
          await refreshAccounts();
          await loadAssemblies();
          setPage('dashboard');
        }} />
      )}
      {page === 'dashboard' && (
        <DashboardPage
          accounts={accounts}
          assemblies={assemblies}
          defaultOrgId={defaultOrgId}
          activeRuns={activeRuns}
          completedBatches={completedBatches}
          onReview={handleReview}
        />
      )}
      {page === 'review' && reviewBatch && (
        <ReviewPage
          batch={reviewBatch.batch}
          accountId={reviewBatch.accountId}
          assemblies={assemblies}
          defaultOrgIds={defaultOrgId ? [defaultOrgId] : []}
          allBatches={Array.from(completedBatches.values())}
          onSwitchRun={handleReview}
          onSubmitted={() => handleSubmitted(reviewBatch.runId)}
          onBack={handleBackFromReview}
        />
      )}
      {page === 'settings' && (
        <SettingsPage
          accounts={accounts}
          onRefreshAccounts={refreshAccounts}
          onLogout={() => setPage('setup')}
        />
      )}
    </div>
  );
}

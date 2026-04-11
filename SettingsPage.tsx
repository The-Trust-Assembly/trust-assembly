import React, { useState, useEffect, useRef } from 'react';
import { AccountInfo } from '../App';

interface Props {
  accounts: AccountInfo[];
  onRefreshAccounts: () => Promise<void>;
  onLogout: () => void;
}

export default function SettingsPage({ accounts, onRefreshAccounts, onLogout }: Props) {
  const [budgetConfig, setBudgetConfig] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [addingAccount, setAddingAccount] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('https://trustassembly.org');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    loadState();
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  async function loadState() {
    const [b, u] = await Promise.all([
      window.trustAssembly.budget.getConfig(),
      window.trustAssembly.budget.getUsage(),
    ]);
    setBudgetConfig(b);
    setUsage(u);
  }

  async function handleLogout() {
    // Clear all accounts
    await window.trustAssembly.credentials.clear();
    await window.trustAssembly.auth.logout();
    onLogout();
  }

  async function handleRemoveAccount(accountId: string) {
    await window.trustAssembly.accounts.remove(accountId);
    await onRefreshAccounts();
    setMessage(`Account "${accountId}" removed.`);
    setTimeout(() => setMessage(''), 3000);
    // If no accounts left, go to setup
    const remaining = await window.trustAssembly.accounts.list();
    if (remaining.length === 0) onLogout();
  }

  async function handleSetDefault(accountId: string) {
    await window.trustAssembly.accounts.setDefault(accountId);
    await onRefreshAccounts();
    setMessage(`Default account set to "${accountId}".`);
    setTimeout(() => setMessage(''), 2000);
  }

  async function handleAddAccount() {
    if (!newApiKey.trim() || !newUsername.trim() || !newPassword.trim()) {
      setAddError('All fields are required.');
      return;
    }
    setAddError('');
    setAddLoading(true);

    try {
      const accountId = await window.trustAssembly.credentials.save({
        claudeApiKey: newApiKey,
        taUsername: newUsername,
        taPassword: newPassword,
        taBaseUrl: newBaseUrl,
        defaultOrgId: '',
        defaultOrgName: '',
      });

      const loginResult = await window.trustAssembly.auth.login(accountId);
      if (!loginResult.success) {
        setAddError(`Login failed: ${loginResult.error}`);
        setAddLoading(false);
        return;
      }

      await onRefreshAccounts();
      setAddingAccount(false);
      setNewApiKey('');
      setNewUsername('');
      setNewPassword('');
      setNewBaseUrl('https://trustassembly.org');
      setMessage(`Account "${newUsername}" added.`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setAddError(err.message || 'Failed to add account');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleClearHistory() {
    await window.trustAssembly.history.clear();
    setMessage('Run history cleared.');
    setTimeout(() => setMessage(''), 3000);
  }

  function updateBudgetLocal(field: string, value: any) {
    setBudgetConfig((prev: any) => ({ ...prev, [field]: value }));
    if (debounceTimers.current[field]) clearTimeout(debounceTimers.current[field]);
    debounceTimers.current[field] = setTimeout(async () => {
      const updated = await window.trustAssembly.budget.setConfig({ [field]: value });
      setBudgetConfig(updated);
      setMessage('Budget updated.');
      setTimeout(() => setMessage(''), 2000);
    }, 600);
  }

  async function updateBudgetImmediate(field: string, value: any) {
    const updated = await window.trustAssembly.budget.setConfig({ [field]: value });
    setBudgetConfig(updated);
    setMessage('Budget updated.');
    setTimeout(() => setMessage(''), 2000);
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ marginBottom: 24 }}>Settings</h2>

      {message && <div className="message-success">{message}</div>}

      {/* Accounts */}
      <div className="card" style={{ borderLeft: '4px solid var(--navy)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3>Accounts</h3>
          <button className="btn btn-outline" onClick={() => setAddingAccount(!addingAccount)}
            style={{ fontSize: 13, padding: '4px 14px' }}>
            {addingAccount ? 'Cancel' : '+ Add Account'}
          </button>
        </div>

        {accounts.map(acct => (
          <div key={acct.accountId} style={{
            padding: '12px 16px', marginBottom: 8, borderRadius: 6,
            background: acct.isDefault ? 'var(--linen)' : 'white',
            border: `1px solid ${acct.isDefault ? 'var(--gold)' : 'var(--border)'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {acct.taUsername}
                {acct.isDefault && (
                  <span style={{ marginLeft: 8, fontSize: 11, background: 'var(--gold)', color: 'white', borderRadius: 8, padding: '1px 8px' }}>
                    default
                  </span>
                )}
                <span style={{
                  marginLeft: 8, fontSize: 11, borderRadius: 8, padding: '1px 8px',
                  background: acct.authStatus === 'authenticated' ? '#D4EDDA' : '#F8D7DA',
                  color: acct.authStatus === 'authenticated' ? '#155724' : '#721C24',
                }}>
                  {acct.authStatus === 'authenticated' ? 'connected' : 'offline'}
                </span>
              </div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {acct.taBaseUrl} {acct.defaultOrgName ? `· ${acct.defaultOrgName}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {!acct.isDefault && (
                <button className="btn btn-outline" onClick={() => handleSetDefault(acct.accountId)}
                  style={{ fontSize: 11, padding: '3px 10px' }}>Make Default</button>
              )}
              {accounts.length > 1 && (
                <button className="btn btn-outline" onClick={() => handleRemoveAccount(acct.accountId)}
                  style={{ fontSize: 11, padding: '3px 10px', color: 'var(--error)' }}>Remove</button>
              )}
            </div>
          </div>
        ))}

        {/* Add account form */}
        {addingAccount && (
          <div style={{ marginTop: 16, padding: 16, background: 'var(--vellum)', borderRadius: 8 }}>
            <h4 style={{ marginBottom: 12 }}>Add New Agent Account</h4>
            {addError && <div className="message-error">{addError}</div>}
            <div className="form-group">
              <label>Claude API Key</label>
              <input type="password" value={newApiKey} onChange={e => setNewApiKey(e.target.value)}
                placeholder="sk-ant-..." disabled={addLoading} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Agent Username</label>
                <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)}
                  placeholder="my-agent" disabled={addLoading} />
              </div>
              <div className="form-group">
                <label>Agent Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••" disabled={addLoading} />
              </div>
            </div>
            <div className="form-group">
              <label>API Base URL</label>
              <input type="url" value={newBaseUrl} onChange={e => setNewBaseUrl(e.target.value)}
                disabled={addLoading} />
              <div className="hint">Only change if using a local or staging instance.</div>
            </div>
            <button className="btn btn-primary" onClick={handleAddAccount} disabled={addLoading}
              style={{ fontSize: 14 }}>
              {addLoading ? 'Connecting...' : 'Add & Connect'}
            </button>
          </div>
        )}
      </div>

      {/* Budget & Cost Controls */}
      <div className="card" style={{ borderLeft: '4px solid var(--gold)' }}>
        <h3 style={{ marginBottom: 16 }}>Budget Safeguards</h3>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
          These limits prevent unexpected API charges. The app will stop mid-run if any limit is reached.
          Costs shown are estimates based on Anthropic's published pricing.
        </p>

        {usage && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
            marginBottom: 24, padding: 16, background: 'var(--vellum)', borderRadius: 8,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>
                ${usage.today.toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Today</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>
                ${usage.thisMonth.toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>This Month</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>
                {usage.totalRuns}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Runs</div>
            </div>
          </div>
        )}

        {budgetConfig && (
          <>
            <div className="form-group">
              <label>Max spend per run</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, color: 'var(--navy)' }}>$</span>
                <input type="number" min="0.50" step="0.50" value={budgetConfig.maxSpendPerRun}
                  onChange={e => updateBudgetLocal('maxSpendPerRun', parseFloat(e.target.value))}
                  style={{ width: 120 }} />
              </div>
              <div className="hint">The app stops a run if this limit is reached mid-pipeline.</div>
            </div>

            <div className="form-group">
              <label>Max spend per day</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, color: 'var(--navy)' }}>$</span>
                <input type="number" min="1" step="1" value={budgetConfig.maxSpendPerDay}
                  onChange={e => updateBudgetLocal('maxSpendPerDay', parseFloat(e.target.value))}
                  style={{ width: 120 }} />
              </div>
            </div>

            <div className="form-group">
              <label>Max spend per month</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, color: 'var(--navy)' }}>$</span>
                <input type="number" min="5" step="5" value={budgetConfig.maxSpendPerMonth}
                  onChange={e => updateBudgetLocal('maxSpendPerMonth', parseFloat(e.target.value))}
                  style={{ width: 120 }} />
              </div>
            </div>

            <div className="form-group">
              <label>Model</label>
              <select value={budgetConfig.model}
                onChange={e => updateBudgetImmediate('model', e.target.value)}>
                <option value="sonnet">Sonnet 4 — faster, cheaper (~$0.50-2/run)</option>
                <option value="opus">Opus 4 — more thorough, 5x cost (~$2.50-10/run)</option>
              </select>
              <div className="hint">Sonnet is recommended for most runs. Use Opus for deep dives on critical topics.</div>
            </div>

            <div className="form-group">
              <label>Warning threshold</label>
              <select value={budgetConfig.warningThreshold}
                onChange={e => updateBudgetImmediate('warningThreshold', parseFloat(e.target.value))}>
                <option value="0.5">50% of limit</option>
                <option value="0.7">70% of limit</option>
                <option value="0.8">80% of limit (default)</option>
                <option value="0.9">90% of limit</option>
              </select>
              <div className="hint">You'll see a warning when spending approaches this percentage of any limit.</div>
            </div>
          </>
        )}
      </div>

      {/* Data */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Data</h3>
        <button className="btn btn-outline" onClick={handleClearHistory} style={{ color: 'var(--error)' }}>
          Clear Run History
        </button>
        <div className="hint" style={{ marginTop: 8 }}>
          Removes locally stored run results. Submissions already made to Trust Assembly are not affected.
        </div>
      </div>

      {/* Danger zone */}
      <div className="card">
        <h3 style={{ marginBottom: 16, color: 'var(--error)' }}>Danger Zone</h3>
        <button className="btn btn-outline" onClick={handleLogout} style={{ color: 'var(--error)' }}>
          Logout & Remove All Accounts
        </button>
        <div className="hint" style={{ marginTop: 8 }}>
          Removes all stored credentials and returns to the setup screen.
        </div>
      </div>

      {/* About */}
      <div className="card" style={{ borderLeft: '4px solid var(--gold)' }}>
        <h3 style={{ marginBottom: 12 }}>About</h3>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Trust Assembly Agent is a desktop application that uses Claude to discover and fact-check
          articles at scale, automatically submitting corrections and affirmations to the Trust Assembly
          platform for community jury review.
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>
          All submissions are made under your AI Agent account and require human partner approval
          before entering the jury review process. No submission bypasses community oversight.
        </p>
        <p style={{ fontSize: 13, color: 'var(--gold)', marginTop: 12, fontStyle: 'italic' }}>
          Truth Will Out.
        </p>
      </div>
    </div>
  );
}

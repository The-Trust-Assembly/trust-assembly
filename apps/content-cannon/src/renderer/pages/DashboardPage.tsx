import React, { useState, useEffect } from 'react';
import AccountPicker from '../components/AccountPicker';
import { AccountInfo, RunProgress, CompletedBatch } from '../App';

const SCOPE_PRESETS = [
  { label: 'Top article', value: 'Find only the single most relevant article. Return exactly 1 result.' },
  { label: 'Top 3', value: 'Top 3 search results only' },
  { label: 'Top 10', value: 'Top 10 search results' },
  { label: 'First 5 pages', value: 'First 5 pages of search results, approximately 50 articles' },
  { label: 'As many as possible', value: 'As many relevant articles as you can find. Keep searching until results dry up.' },
  { label: 'Last 30 days', value: 'Articles from the last 30 days only, top 20 results' },
];

interface Props {
  accounts: AccountInfo[];
  assemblies: any[];
  defaultOrgId: string;
  activeRuns: Map<string, RunProgress>;
  completedBatches: Map<string, CompletedBatch>;
  onReview: (runId: string) => void;
}

export default function DashboardPage({ accounts, assemblies, defaultOrgId, activeRuns, completedBatches, onReview }: Props) {
  const [who, setWho] = useState('');
  const [what, setWhat] = useState('');
  const [when, setWhen] = useState('');
  const [where, setWhere] = useState('');
  const [why, setWhy] = useState('');
  const [thesis, setThesis] = useState('');
  const [evidenceItems, setEvidenceItems] = useState<Array<{ id: string; type: 'link' | 'text'; value: string }>>([]);
  const [scope, setScope] = useState(SCOPE_PRESETS[0].value);
  const [customScope, setCustomScope] = useState('');
  const [activePreset, setActivePreset] = useState(0);
  const [selectedOrgId, setSelectedOrgId] = useState(defaultOrgId);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts.find(a => a.isDefault)?.accountId || accounts[0]?.accountId || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [usage, setUsage] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    (async () => {
      const [historyData, pendingData, usageData] = await Promise.all([
        window.trustAssembly.history.list().catch(() => []),
        window.trustAssembly.pipeline.getPending().catch(() => []),
        window.trustAssembly.budget.getUsage().catch(() => null),
      ]);
      setHistory(historyData);
      setPendingCount(pendingData?.length || 0);
      setUsage(usageData);
    })();
  }, []);

  async function refreshState() {
    const [historyData, pendingData, usageData] = await Promise.all([
      window.trustAssembly.history.list().catch(() => []),
      window.trustAssembly.pipeline.getPending().catch(() => []),
      window.trustAssembly.budget.getUsage().catch(() => null),
    ]);
    setHistory(historyData);
    setPendingCount(pendingData?.length || 0);
    setUsage(usageData);
  }

  function addEvidenceItem() {
    setEvidenceItems([...evidenceItems, { id: `ev-${Date.now()}`, type: 'link', value: '' }]);
  }

  function removeEvidenceItem(index: number) {
    setEvidenceItems(evidenceItems.filter((_, i) => i !== index));
  }

  function updateEvidenceItem(index: number, field: string, value: string) {
    const updated = [...evidenceItems];
    updated[index] = { ...updated[index], [field]: value };
    setEvidenceItems(updated);
  }

  function buildTopic(): string {
    const parts: string[] = [];
    if (who.trim()) parts.push(`Who: ${who.trim()}`);
    if (what.trim()) parts.push(`What: ${what.trim()}`);
    if (when.trim()) parts.push(`When: ${when.trim()}`);
    if (where.trim()) parts.push(`Where: ${where.trim()}`);
    if (why.trim()) parts.push(`Why this matters: ${why.trim()}`);
    if (thesis.trim()) parts.push(`What is important to correct or affirm in the public understanding: ${thesis.trim()}`);

    const links = evidenceItems.filter(e => e.type === 'link' && e.value.trim());
    const notes = evidenceItems.filter(e => e.type === 'text' && e.value.trim());

    if (links.length > 0) {
      parts.push(`\nSupporting source links provided by the user (use these as primary evidence and also analyze these articles):\n${links.map(l => `- ${l.value.trim()}`).join('\n')}`);
    }
    if (notes.length > 0) {
      parts.push(`\nAdditional context provided by the user (verify these claims against available evidence):\n${notes.map(n => `- ${n.value.trim()}`).join('\n')}`);
    }

    return parts.join('\n');
  }

  async function handleRun() {
    const topic = buildTopic();
    if (!topic.trim()) { setError('Please fill in at least one field.'); return; }
    setError('');
    setSubmitting(true);

    const effectiveScope = activePreset === -1 ? customScope : scope;
    const result = await window.trustAssembly.pipeline.run(topic, effectiveScope, selectedAccountId);

    setSubmitting(false);
    if (result.success) {
      // Run started in background — clear form
      setThesis('');
      setWho(''); setWhat(''); setWhen(''); setWhere(''); setWhy('');
      setEvidenceItems([]);
    } else {
      setError(result.error || 'Failed to start pipeline');
    }
  }

  async function handleRetry() {
    if (!selectedOrgId) { setError('Please select an Assembly.'); return; }
    setError('');
    setSubmitting(true);

    const result = await window.trustAssembly.pipeline.retry(selectedOrgId, selectedAccountId);

    setSubmitting(false);
    refreshState();
    if (!result.success) setError(result.error || 'Retry failed');
  }

  async function handleCancel(runId: string) {
    await window.trustAssembly.pipeline.cancel(runId);
  }

  function getProgressPercent(progress: RunProgress): number {
    if (progress.total > 0) {
      return Math.round(((progress.articlesFetched + progress.articlesAnalyzed) / (progress.total * 2)) * 100);
    }
    return progress.stage === 'synthesizing' ? 90 : 0;
  }

  return (
    <div>
      {/* Usage summary */}
      {usage && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 20, fontSize: 13, color: 'var(--text-muted)' }}>
          <span>Today: <strong className="mono">${usage.today?.toFixed(2) || '0.00'}</strong></span>
          <span>This month: <strong className="mono">${usage.thisMonth?.toFixed(2) || '0.00'}</strong></span>
          <span>All time: <strong className="mono">${usage.allTime?.toFixed(2) || '0.00'}</strong> ({usage.totalRuns || 0} runs)</span>
        </div>
      )}

      {/* Topic Input */}
      <div className="card" style={{ borderColor: 'var(--gold)', borderWidth: 2 }}>
        <h3 style={{ marginBottom: 16 }}>What should we fact-check?</h3>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>What do you think is important to correct or affirm in the public understanding?</label>
          <textarea value={thesis} onChange={e => setThesis(e.target.value)}
            placeholder="e.g., Many articles conflate the court finding the songs were protected speech with the factual claims in the songs being true. Some specific claims about officers may be inaccurate even though the songs are legally protected."
            style={{ minHeight: 70, fontSize: 14 }}
            disabled={submitting} />
          <div className="hint">This guides the AI's analysis — it will test your thesis across all articles it finds.</div>
        </div>

        {/* Collapsible details section */}
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
              fontFamily: 'EB Garamond, Georgia, serif', fontSize: 14, fontWeight: 600,
              color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <span style={{ transform: showDetails ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>&#9654;</span>
            Details — Who, What, When, Where, Why
            {(who || what || when || where || why) && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
                ({[who, what, when, where, why].filter(Boolean).length} filled)
              </span>
            )}
          </button>
          {showDetails && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Who</label>
                  <input type="text" value={who} onChange={e => setWho(e.target.value)}
                    placeholder="e.g., Afroman, Adams County deputies" disabled={submitting} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>What</label>
                  <input type="text" value={what} onChange={e => setWhat(e.target.value)}
                    placeholder="e.g., Defamation lawsuit over music videos" disabled={submitting} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>When</label>
                  <input type="text" value={when} onChange={e => setWhen(e.target.value)}
                    placeholder="e.g., March 2026" disabled={submitting} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Where</label>
                  <input type="text" value={where} onChange={e => setWhere(e.target.value)}
                    placeholder="e.g., Adams County, Ohio" disabled={submitting} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Why is this story important?</label>
                <input type="text" value={why} onChange={e => setWhy(e.target.value)}
                  placeholder="e.g., Sets precedent for free speech vs defamation in music" disabled={submitting} />
              </div>
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Supporting evidence (links and notes)</label>
          {evidenceItems.map((item, i) => (
            <div key={item.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select value={item.type} onChange={e => updateEvidenceItem(i, 'type', e.target.value)}
                style={{ width: 90, fontSize: 13 }} disabled={submitting}>
                <option value="link">Link</option>
                <option value="text">Note</option>
              </select>
              {item.type === 'link' ? (
                <input type="url" value={item.value} onChange={e => updateEvidenceItem(i, 'value', e.target.value)}
                  placeholder="https://... (court documents, primary sources, etc.)"
                  style={{ flex: 1, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}
                  disabled={submitting} />
              ) : (
                <input type="text" value={item.value} onChange={e => updateEvidenceItem(i, 'value', e.target.value)}
                  placeholder="Additional context, facts, or observations..."
                  style={{ flex: 1, fontSize: 13 }}
                  disabled={submitting} />
              )}
              <button className="btn btn-outline" onClick={() => removeEvidenceItem(i)}
                style={{ padding: '6px 10px', fontSize: 12, color: 'var(--error)' }}
                disabled={submitting}>✕</button>
            </div>
          ))}
          <button className="btn btn-outline" onClick={addEvidenceItem}
            style={{ fontSize: 13, padding: '4px 12px' }} disabled={submitting}>
            + Add link or note
          </button>
          <div className="hint" style={{ marginTop: 6 }}>
            Provide links to primary sources (court records, studies, official statements) or notes with facts
            you want the AI to verify. These will be included in the analysis context.
          </div>
        </div>

        {/* Compact scope + assembly + account row */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'start', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 300 }}>
            <label>Search scope</label>
            <div className="scope-presets">
              {SCOPE_PRESETS.map((preset, i) => (
                <span key={i} className={`scope-preset ${activePreset === i ? 'active' : ''}`}
                  onClick={() => { setActivePreset(i); setScope(preset.value); }}>
                  {preset.label}
                </span>
              ))}
              <span className={`scope-preset ${activePreset === -1 ? 'active' : ''}`}
                onClick={() => setActivePreset(-1)}>Custom</span>
            </div>
            {activePreset === -1 && (
              <input type="text" value={customScope} onChange={e => setCustomScope(e.target.value)}
                placeholder="e.g., The first 10 pages of Google search results from the last 7 days"
                style={{ marginTop: 8 }} disabled={submitting} />
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Assembly</label>
            <select value={selectedOrgId} onChange={e => setSelectedOrgId(e.target.value)} disabled={submitting}>
              <option value="">Select...</option>
              {assemblies.map((org: any) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.member_count || org.memberCount || '?'})
                </option>
              ))}
            </select>
          </div>
          <AccountPicker accounts={accounts} selectedAccountId={selectedAccountId}
            onChange={setSelectedAccountId} disabled={submitting} />
        </div>

        {/* Warning - condensed */}
        <div style={{
          background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 6,
          padding: '10px 14px', marginBottom: 16, fontSize: 12, lineHeight: 1.6,
          color: '#5D4037',
        }}>
          <strong>Note:</strong> The AI follows evidence it finds, not the framing you provide.
          Results may not agree with your conclusions. Provide strong counter-evidence above as links or notes.
        </div>

        {error && <div className="message-error">{error}</div>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleRun} disabled={submitting}
            style={{ flex: 1, fontSize: 18, padding: '12px 0' }}>
            {submitting ? 'Starting...' : 'Run Fact-Check'}
          </button>
          <button className="btn btn-gold" onClick={handleRetry}
            disabled={submitting || pendingCount === 0}
            style={{ fontSize: 14, padding: '12px 20px', whiteSpace: 'nowrap' }}
            title={pendingCount > 0 ? `Re-submit ${pendingCount} pending (no API cost)` : 'No pending'}>
            Retry{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        </div>
      </div>

      {/* Active Runs */}
      {activeRuns.size > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Active Runs</h3>
          {Array.from(activeRuns.values()).map(run => {
            const pct = getProgressPercent(run);
            const accountLabel = accounts.find(a => a.accountId === run.accountId)?.taUsername || run.accountId;
            return (
              <div key={run.runId} className="card" style={{ borderLeft: '4px solid var(--gold)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      {run.topic.length > 60 ? run.topic.substring(0, 60) + '...' : run.topic}
                    </span>
                    {accounts.length > 1 && (
                      <span className="mono" style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                        @{accountLabel}
                      </span>
                    )}
                  </div>
                  <button className="btn btn-outline" onClick={() => handleCancel(run.runId)}
                    style={{ padding: '4px 12px', fontSize: 12, color: 'var(--error)' }}>Cancel</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {run.stage === 'searching' && 'Searching...'}
                    {run.stage === 'fetching' && 'Fetching articles...'}
                    {run.stage === 'analyzing' && 'Analyzing...'}
                    {run.stage === 'synthesizing' && 'Synthesizing...'}
                    {run.stage === 'submitting' && 'Submitting...'}
                  </span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {run.articlesFound} found · {run.articlesFetched} fetched · {run.articlesAnalyzed} analyzed
                  </span>
                </div>
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{run.message}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed Batches Ready for Review */}
      {completedBatches.size > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Ready for Review</h3>
          {Array.from(completedBatches.values()).map(cb => {
            const accountLabel = accounts.find(a => a.accountId === cb.accountId)?.taUsername || cb.accountId;
            const subCount = cb.batch.submissions?.length || 0;
            const vaultCount = cb.batch.vaultEntries?.length || 0;
            return (
              <div key={cb.runId} className="card run-card" onClick={() => onReview(cb.runId)}
                style={{ borderLeft: '4px solid var(--success)', cursor: 'pointer' }}>
                <div className="card-header">
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      {cb.topic.length > 70 ? cb.topic.substring(0, 70) + '...' : cb.topic}
                    </span>
                    {accounts.length > 1 && (
                      <span className="mono" style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                        @{accountLabel}
                      </span>
                    )}
                  </div>
                  <button className="btn btn-gold" style={{ fontSize: 13, padding: '6px 16px' }}>Review</button>
                </div>
                <div className="run-stats">
                  {subCount > 0 && <span className="stat">{subCount} submissions</span>}
                  {vaultCount > 0 && <span className="stat" style={{ color: 'var(--gold)' }}>{vaultCount} vault</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Run History */}
      {history.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ marginBottom: 16 }}>Recent Runs</h3>
          {history.slice(0, 10).map((run: any) => {
            const corrections = run.submissions?.filter((s: any) => s.success && s.type === 'correction').length || 0;
            const affirmations = run.submissions?.filter((s: any) => s.success && s.type === 'affirmation').length || 0;
            const vault = run.vaultResults?.filter((v: any) => v.success).length || 0;
            return (
              <div key={run.runId} className="card run-card">
                <div className="card-header">
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {run.topic.length > 80 ? run.topic.substring(0, 80) + '...' : run.topic}
                  </span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(run.timestamp).toLocaleString()}
                  </span>
                </div>
                {run.narrative && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 8 }}>
                    {run.narrative.length > 150 ? run.narrative.substring(0, 150) + '...' : run.narrative}
                  </p>
                )}
                <div className="run-stats">
                  <span className="stat">{run.articlesFound} articles</span>
                  {corrections > 0 && <span className="stat">{corrections} corrections</span>}
                  {affirmations > 0 && <span className="stat">{affirmations} affirmations</span>}
                  {vault > 0 && <span className="stat" style={{ color: 'var(--gold)' }}>{vault} vault</span>}
                  {run.errors?.length > 0 && <span className="stat" style={{ color: 'var(--error)' }}>{run.errors.length} errors</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

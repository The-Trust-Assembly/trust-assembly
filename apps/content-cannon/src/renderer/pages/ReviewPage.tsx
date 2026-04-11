import React, { useState } from 'react';
import SubmissionEditor from '../components/SubmissionEditor';
import VaultEntryEditor from '../components/VaultEntryEditor';
import { CompletedBatch } from '../App';

interface Props {
  batch: any; // SynthesizedBatch
  accountId: string;
  assemblies: any[];
  defaultOrgIds: string[];
  allBatches: CompletedBatch[];
  onSwitchRun: (runId: string) => void;
  onSubmitted: (result: any) => void;
  onBack: () => void;
}

export default function ReviewPage({ batch, accountId, assemblies, defaultOrgIds, allBatches, onSwitchRun, onSubmitted, onBack }: Props) {
  const [submissions, setSubmissions] = useState(batch.submissions || []);
  const [vaultEntries, setVaultEntries] = useState(batch.vaultEntries || []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>(defaultOrgIds);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'submissions' | 'vault'>('submissions');

  const approvedCount = submissions.filter((s: any) => s.approved && s.analysis.verdict !== 'skip').length;
  const approvedVaultCount = vaultEntries.filter((v: any) => v.approved).length;

  function updateSubmissionAnalysis(index: number, analysis: any) {
    const updated = [...submissions];
    updated[index] = { ...updated[index], analysis };
    setSubmissions(updated);
  }

  function toggleSubmissionApproved(index: number) {
    const updated = [...submissions];
    updated[index] = { ...updated[index], approved: !updated[index].approved };
    setSubmissions(updated);
  }

  function updateVaultEntry(index: number, entry: any) {
    const updated = [...vaultEntries];
    updated[index] = { ...updated[index], entry };
    setVaultEntries(updated);
  }

  function toggleVaultApproved(index: number) {
    const updated = [...vaultEntries];
    updated[index] = { ...updated[index], approved: !updated[index].approved };
    setVaultEntries(updated);
  }

  function removeVaultEntry(index: number) {
    setVaultEntries(vaultEntries.filter((_: any, i: number) => i !== index));
  }

  function addVaultEntry() {
    setVaultEntries([...vaultEntries, {
      id: `vault-new-${Date.now()}`,
      entry: { type: 'vault' as const, assertion: '', evidence: '' },
      approved: true,
    }]);
  }

  function approveAll() {
    setSubmissions(submissions.map((s: any) => ({ ...s, approved: true })));
    setVaultEntries(vaultEntries.map((v: any) => ({ ...v, approved: true })));
  }

  function rejectAll() {
    setSubmissions(submissions.map((s: any) => ({ ...s, approved: false })));
    setVaultEntries(vaultEntries.map((v: any) => ({ ...v, approved: false })));
  }

  function toggleOrg(orgId: string) {
    setSelectedOrgIds(prev =>
      prev.includes(orgId) ? prev.filter(id => id !== orgId) : [...prev, orgId]
    );
  }

  function handleSubmitClick() {
    if (selectedOrgIds.length === 0) {
      setError('Please select at least one Assembly.');
      return;
    }
    if (approvedCount === 0 && approvedVaultCount === 0) {
      setError('Nothing approved to submit.');
      return;
    }
    setError('');
    setShowConfirm(true);
  }

  async function handleConfirmedSubmit() {
    setShowConfirm(false);
    setSubmitting(true);

    const editedBatch = { ...batch, submissions, vaultEntries };
    const result = await window.trustAssembly.pipeline.submitApproved(editedBatch, selectedOrgIds, accountId);

    setSubmitting(false);
    if (result.success) {
      onSubmitted(result.result);
    } else {
      setError(result.error || 'Submission failed');
    }
  }

  const selected = submissions[selectedIndex];

  return (
    <div>
      {/* Run selector tabs (when multiple batches ready) */}
      {allBatches.length > 1 && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)', overflowX: 'auto' }}>
          {allBatches.map(cb => (
            <button key={cb.runId} onClick={() => onSwitchRun(cb.runId)} style={{
              padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'EB Garamond, Georgia, serif', fontWeight: 600, whiteSpace: 'nowrap',
              color: cb.runId === batch.runId ? 'var(--navy)' : 'var(--text-muted)',
              borderBottom: cb.runId === batch.runId ? '3px solid var(--gold)' : '3px solid transparent',
              marginBottom: -2,
            }}>
              {cb.topic.length > 30 ? cb.topic.substring(0, 30) + '...' : cb.topic}
            </button>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Review Submissions</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {submissions.length} submissions · {vaultEntries.length} vault entries · {batch.skipped} skipped
          </span>
        </div>
        <button className="btn btn-outline" onClick={onBack} style={{ fontSize: 13 }}>← Back</button>
      </div>

      {/* Narrative */}
      {batch.narrative && (
        <div style={{
          background: 'var(--linen)', padding: '14px 18px', borderRadius: 6,
          marginBottom: 20, borderLeft: '4px solid var(--gold)',
          fontStyle: 'italic', fontSize: 15, lineHeight: 1.7,
        }}>
          <strong style={{ fontStyle: 'normal' }}>Narrative: </strong>{batch.narrative}
        </div>
      )}

      {/* Assembly multi-select chips */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label>Submit to Assemblies</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {assemblies.map((org: any) => {
            const isSelected = selectedOrgIds.includes(org.id);
            return (
              <span key={org.id} onClick={() => toggleOrg(org.id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                padding: '6px 14px', borderRadius: 20, fontSize: 13,
                background: isSelected ? 'var(--navy)' : 'var(--linen)',
                color: isSelected ? 'white' : 'var(--text)',
                border: `1px solid ${isSelected ? 'var(--navy)' : 'var(--border)'}`,
                transition: 'all 0.2s', userSelect: 'none',
              }}>
                {isSelected ? '✓ ' : ''}{org.name}
              </span>
            );
          })}
        </div>
        <div className="hint">
          Submissions will be filed to all selected Assemblies. Each reviews independently.
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        <button onClick={() => setTab('submissions')} style={{
          padding: '10px 24px', fontSize: 15, border: 'none', background: 'none', cursor: 'pointer',
          fontFamily: 'EB Garamond, Georgia, serif', fontWeight: 600,
          color: tab === 'submissions' ? 'var(--navy)' : 'var(--text-muted)',
          borderBottom: tab === 'submissions' ? '3px solid var(--gold)' : '3px solid transparent',
          marginBottom: -2,
        }}>
          Submissions ({submissions.length})
        </button>
        <button onClick={() => setTab('vault')} style={{
          padding: '10px 24px', fontSize: 15, border: 'none', background: 'none', cursor: 'pointer',
          fontFamily: 'EB Garamond, Georgia, serif', fontWeight: 600,
          color: tab === 'vault' ? 'var(--navy)' : 'var(--text-muted)',
          borderBottom: tab === 'vault' ? '3px solid var(--gold)' : '3px solid transparent',
          marginBottom: -2,
        }}>
          Vault Entries ({vaultEntries.length})
        </button>
      </div>

      {/* Submissions tab */}
      {tab === 'submissions' && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
          {/* Left sidebar */}
          <div style={{ width: 280, flexShrink: 0 }}>
            {submissions.map((sub: any, i: number) => (
              <div key={i} onClick={() => setSelectedIndex(i)} className="card" style={{
                padding: 12, marginBottom: 8, cursor: 'pointer',
                borderColor: i === selectedIndex ? 'var(--gold)' : 'var(--border)',
                borderWidth: i === selectedIndex ? 2 : 1,
                opacity: sub.approved ? 1 : 0.5,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>
                  {sub.headline.length > 60 ? sub.headline.substring(0, 60) + '...' : sub.headline}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`badge ${sub.analysis.verdict === 'correction' ? 'badge-correction' : sub.analysis.verdict === 'affirmation' ? 'badge-affirmation' : 'badge-error'}`}>
                    {sub.analysis.verdict}
                  </span>
                  {!sub.approved && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>excluded</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Right editor */}
          <div style={{ flex: 1 }}>
            {selected && (
              <div className="card" style={{ padding: 24 }}>
                <SubmissionEditor
                  url={selected.url}
                  headline={selected.headline}
                  analysis={selected.analysis}
                  approved={selected.approved}
                  onUpdate={(analysis) => updateSubmissionAnalysis(selectedIndex, analysis)}
                  onToggleApproved={() => toggleSubmissionApproved(selectedIndex)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vault tab */}
      {tab === 'vault' && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Shared facts, arguments, and translations that apply across all articles. Edit once — applies everywhere.
            </p>
            <button className="btn btn-outline" onClick={addVaultEntry} style={{ fontSize: 13, padding: '4px 14px' }}>
              + Add Entry
            </button>
          </div>
          {vaultEntries.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 14, textAlign: 'center', padding: 40 }}>
              No vault entries suggested. Click "+ Add Entry" to create your own.
            </div>
          )}
          {vaultEntries.map((ve: any, i: number) => (
            <VaultEntryEditor key={ve.id} id={ve.id} entry={ve.entry} approved={ve.approved}
              onUpdate={(entry) => updateVaultEntry(i, entry)}
              onToggleApproved={() => toggleVaultApproved(i)}
              onRemove={() => removeVaultEntry(i)} />
          ))}
        </div>
      )}

      {/* Sticky submit bar */}
      <div style={{
        position: 'sticky', bottom: 0, padding: '16px 0', marginTop: 16,
        background: 'var(--vellum)', borderTop: '2px solid var(--gold)', zIndex: 10,
      }}>
        {error && <div className="message-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={approveAll} style={{ fontSize: 12, padding: '6px 14px' }}>
            Approve All
          </button>
          <button className="btn btn-outline" onClick={rejectAll} style={{ fontSize: 12, padding: '6px 14px' }}>
            Reject All
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {approvedCount} submissions + {approvedVaultCount} vault → {selectedOrgIds.length} assembl{selectedOrgIds.length === 1 ? 'y' : 'ies'}
          </span>
          <button className="btn btn-gold" onClick={handleSubmitClick}
            disabled={submitting || (approvedCount === 0 && approvedVaultCount === 0) || selectedOrgIds.length === 0}
            style={{ fontSize: 16, padding: '10px 28px' }}>
            {submitting ? 'Submitting...' : `Submit Approved (${approvedCount + approvedVaultCount})`}
          </button>
        </div>
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(27, 42, 74, 0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={() => setShowConfirm(false)}>
          <div style={{
            background: 'white', borderRadius: 12, padding: '32px 36px',
            maxWidth: 520, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Before you submit</h3>
            <p style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}>
              Your submissions will enter the Trust Assembly jury review process. Randomly
              selected members of your Assembly will evaluate each submission for accuracy,
              newsworthiness, and quality.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}>
              <strong>Even if these arguments appear correct to you — even if they will be
              proven true in the course of time — we cannot guarantee that juries will
              approve them.</strong> The jury process is adversarial by design. Truth must
              survive scrutiny, and reasonable people may disagree on what constitutes
              sufficient evidence.
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)', marginBottom: 24 }}>
              Submissions that are rejected can be disputed. Submissions that are rejected
              but later vindicated earn the Cassandra bonus — the system is designed to
              eventually reward those who are right, even when the majority disagrees.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowConfirm(false)}>
                Go Back
              </button>
              <button className="btn btn-gold" onClick={handleConfirmedSubmit}
                style={{ fontSize: 16, padding: '10px 28px' }}>
                I understand — Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analysis errors */}
      {batch.errors?.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}>
            {batch.errors.length} errors during analysis
          </summary>
          {batch.errors.map((err: any, i: number) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--error)', marginTop: 4 }}>
              {err.url}: {err.error}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

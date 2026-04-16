import React from 'react';

interface InlineEdit {
  originalText: string;
  correctedText: string;
  explanation: string;
}

interface Analysis {
  verdict: 'correction' | 'affirmation' | 'skip';
  originalHeadline: string;
  replacement?: string;
  reasoning: string;
  evidence: Array<{ description: string; url?: string }>;
  confidence: 'high' | 'medium' | 'low';
  inlineEdits?: InlineEdit[];
}

interface Props {
  url: string;
  headline: string;
  analysis: Analysis;
  approved: boolean;
  onUpdate: (analysis: Analysis) => void;
  onToggleApproved: () => void;
}

export default React.memo(function SubmissionEditor({ url, headline, analysis, approved, onUpdate, onToggleApproved }: Props) {
  function updateField(field: string, value: any) {
    onUpdate({ ...analysis, [field]: value });
  }

  function updateEvidence(index: number, field: string, value: string) {
    const newEvidence = [...analysis.evidence];
    newEvidence[index] = { ...newEvidence[index], [field]: value };
    onUpdate({ ...analysis, evidence: newEvidence });
  }

  function addEvidence() {
    onUpdate({ ...analysis, evidence: [...analysis.evidence, { description: '', url: '' }] });
  }

  function removeEvidence(index: number) {
    onUpdate({ ...analysis, evidence: analysis.evidence.filter((_, i) => i !== index) });
  }

  function updateInlineEdit(index: number, field: string, value: string) {
    const edits = [...(analysis.inlineEdits || [])];
    edits[index] = { ...edits[index], [field]: value };
    onUpdate({ ...analysis, inlineEdits: edits });
  }

  function addInlineEdit() {
    const edits = [...(analysis.inlineEdits || []), { originalText: '', correctedText: '', explanation: '' }];
    onUpdate({ ...analysis, inlineEdits: edits });
  }

  function removeInlineEdit(index: number) {
    const edits = (analysis.inlineEdits || []).filter((_, i) => i !== index);
    onUpdate({ ...analysis, inlineEdits: edits });
  }

  return (
    <div style={{ opacity: approved ? 1 : 0.5, transition: 'opacity 0.2s' }}>
      {/* Header: URL + approve toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); window.trustAssembly.openExternal(url); }}
            style={{ color: 'var(--navy)', fontSize: 13, fontFamily: 'IBM Plex Mono, monospace' }}>
            {url.length > 70 ? url.substring(0, 70) + '...' : url}
          </a>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
          <input type="checkbox" checked={approved} onChange={onToggleApproved}
            style={{ width: 18, height: 18, accentColor: 'var(--gold)' }} />
          {approved ? 'Approved' : 'Excluded'}
        </label>
      </div>

      {/* Verdict */}
      <div className="form-group">
        <label>Verdict</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['correction', 'affirmation', 'skip'] as const).map(v => (
            <button key={v} className={`btn ${analysis.verdict === v ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => updateField('verdict', v)}
              style={{ fontSize: 13, padding: '6px 16px' }}>
              {v}
            </button>
          ))}
          <span className={`badge ${
            analysis.confidence === 'high' ? 'badge-success' :
            analysis.confidence === 'medium' ? 'badge-pending' : 'badge-error'
          }`} style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            {analysis.confidence}
          </span>
        </div>
      </div>

      {/* Original headline (readonly) */}
      <div className="form-group">
        <label>Original Headline</label>
        <div style={{ padding: '10px 14px', background: 'var(--linen)', borderRadius: 4, fontSize: 15 }}>
          {analysis.originalHeadline}
        </div>
      </div>

      {/* Replacement headline (corrections only) */}
      {analysis.verdict === 'correction' && (
        <div className="form-group">
          <label>Corrected Headline</label>
          <input type="text" value={analysis.replacement || ''}
            onChange={e => updateField('replacement', e.target.value)} />
        </div>
      )}

      {/* Reasoning */}
      <div className="form-group">
        <label>Reasoning</label>
        <textarea value={analysis.reasoning}
          onChange={e => updateField('reasoning', e.target.value)}
          style={{ minHeight: 100 }} />
        <div className="hint">{analysis.reasoning.length}/2000 characters</div>
      </div>

      {/* Evidence */}
      <div className="form-group">
        <label>Evidence</label>
        {analysis.evidence.map((ev, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="text" placeholder="Description" value={ev.description}
              onChange={e => updateEvidence(i, 'description', e.target.value)}
              style={{ flex: 2 }} />
            <input type="text" placeholder="URL" value={ev.url || ''}
              onChange={e => updateEvidence(i, 'url', e.target.value)}
              style={{ flex: 1, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }} />
            <button className="btn btn-outline" onClick={() => removeEvidence(i)}
              style={{ padding: '6px 10px', fontSize: 12, color: 'var(--error)' }}>✕</button>
          </div>
        ))}
        <button className="btn btn-outline" onClick={addEvidence}
          style={{ fontSize: 13, padding: '4px 12px' }}>+ Add Evidence</button>
      </div>

      {/* Inline Edits */}
      <div className="form-group">
        <label>Inline Body Edits</label>
        {(analysis.inlineEdits || []).map((edit, i) => (
          <div key={i} className="card" style={{ padding: 12, marginBottom: 8, background: 'var(--vellum)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Edit {i + 1}</span>
              <button className="btn btn-outline" onClick={() => removeInlineEdit(i)}
                style={{ padding: '2px 8px', fontSize: 11, color: 'var(--error)' }}>Remove</button>
            </div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 12 }}>Original text</label>
              <textarea value={edit.originalText}
                onChange={e => updateInlineEdit(i, 'originalText', e.target.value)}
                style={{ minHeight: 40, fontSize: 13 }} />
            </div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 12 }}>Corrected text</label>
              <textarea value={edit.correctedText}
                onChange={e => updateInlineEdit(i, 'correctedText', e.target.value)}
                style={{ minHeight: 40, fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12 }}>Explanation</label>
              <input type="text" value={edit.explanation}
                onChange={e => updateInlineEdit(i, 'explanation', e.target.value)}
                style={{ fontSize: 13 }} />
            </div>
          </div>
        ))}
        <button className="btn btn-outline" onClick={addInlineEdit}
          style={{ fontSize: 13, padding: '4px 12px' }}>+ Add Inline Edit</button>
      </div>
    </div>
  );
});

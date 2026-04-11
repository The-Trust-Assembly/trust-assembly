import React from 'react';

interface VaultSuggestion {
  type: 'vault' | 'argument' | 'translation';
  assertion?: string;
  evidence?: string;
  content?: string;
  original?: string;
  translated?: string;
  translationType?: 'clarity' | 'propaganda' | 'euphemism' | 'satirical';
}

interface Props {
  id: string;
  entry: VaultSuggestion;
  approved: boolean;
  onUpdate: (entry: VaultSuggestion) => void;
  onToggleApproved: () => void;
  onRemove: () => void;
}

export default React.memo(function VaultEntryEditor({ id, entry, approved, onUpdate, onToggleApproved, onRemove }: Props) {
  function updateField(field: string, value: any) {
    onUpdate({ ...entry, [field]: value });
  }

  const typeLabels = {
    vault: '📌 Standing Correction',
    argument: '💡 Argument',
    translation: '🔄 Translation',
  };

  const typeColors = {
    vault: '#1B2A4A',
    argument: '#4A8C5C',
    translation: '#B8963E',
  };

  return (
    <div className="card" style={{
      opacity: approved ? 1 : 0.5,
      borderLeft: `4px solid ${typeColors[entry.type]}`,
      padding: 16,
      marginBottom: 12,
      transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{typeLabels[entry.type]}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={approved} onChange={onToggleApproved}
              style={{ width: 16, height: 16, accentColor: 'var(--gold)' }} />
            {approved ? 'Include' : 'Exclude'}
          </label>
          <button className="btn btn-outline" onClick={onRemove}
            style={{ padding: '2px 8px', fontSize: 11, color: 'var(--error)' }}>Remove</button>
        </div>
      </div>

      {/* Type selector */}
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12 }}>Type</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['vault', 'argument', 'translation'] as const).map(t => (
            <button key={t} className={`btn ${entry.type === t ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => updateField('type', t)}
              style={{ fontSize: 12, padding: '4px 12px' }}>
              {t === 'vault' ? 'Standing Correction' : t === 'argument' ? 'Argument' : 'Translation'}
            </button>
          ))}
        </div>
      </div>

      {/* Fields by type */}
      {entry.type === 'vault' && (
        <>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12 }}>Factual Assertion</label>
            <textarea value={entry.assertion || ''}
              onChange={e => updateField('assertion', e.target.value)}
              placeholder="A reusable factual claim, e.g., 'William Newland was not convicted of any crime'"
              style={{ minHeight: 60, fontSize: 14 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 12 }}>Evidence</label>
            <textarea value={entry.evidence || ''}
              onChange={e => updateField('evidence', e.target.value)}
              placeholder="Supporting evidence with source URLs"
              style={{ minHeight: 60, fontSize: 14 }} />
          </div>
        </>
      )}

      {entry.type === 'argument' && (
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Argument / Logical Framework</label>
          <textarea value={entry.content || ''}
            onChange={e => updateField('content', e.target.value)}
            placeholder="A logical framework applicable to this topic, e.g., 'Protected speech ≠ factually true claims'"
            style={{ minHeight: 80, fontSize: 14 }} />
        </div>
      )}

      {entry.type === 'translation' && (
        <>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12 }}>Translation Type</label>
            <select value={entry.translationType || 'clarity'}
              onChange={e => updateField('translationType', e.target.value)}
              style={{ fontSize: 13 }}>
              <option value="clarity">Clarity — replacing jargon</option>
              <option value="propaganda">Propaganda — replacing spin</option>
              <option value="euphemism">Euphemism — exposing soft language</option>
              <option value="satirical">Satirical — humorous reframing</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12 }}>Original Phrase</label>
            <input type="text" value={entry.original || ''}
              onChange={e => updateField('original', e.target.value)}
              placeholder="The phrase as it appears in articles" style={{ fontSize: 14 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 12 }}>Plain Language Translation</label>
            <input type="text" value={entry.translated || ''}
              onChange={e => updateField('translated', e.target.value)}
              placeholder="What it actually means" style={{ fontSize: 14 }} />
          </div>
        </>
      )}
    </div>
  );
});

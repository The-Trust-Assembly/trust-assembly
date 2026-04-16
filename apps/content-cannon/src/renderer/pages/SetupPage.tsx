import React, { useState } from 'react';

interface Props {
  onComplete: () => void;
}

export default function SetupPage({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Step 1: Claude API
  const [claudeApiKey, setClaudeApiKey] = useState('');

  // Step 2: Trust Assembly credentials
  const [taUsername, setTaUsername] = useState('');
  const [taPassword, setTaPassword] = useState('');
  const [taBaseUrl, setTaBaseUrl] = useState('https://trustassembly.org');

  // Step 3: Assembly selection
  const [assemblies, setAssemblies] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [selectedOrgName, setSelectedOrgName] = useState('');

  async function handleStep1() {
    if (!claudeApiKey.trim()) {
      setError('Please enter your Claude API key.');
      return;
    }
    setError('');
    setStep(2);
  }

  async function handleStep2() {
    if (!taUsername.trim() || !taPassword.trim()) {
      setError('Please enter your Trust Assembly credentials.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const accountId = await window.trustAssembly.credentials.save({
        claudeApiKey,
        taUsername,
        taPassword,
        taBaseUrl,
        defaultOrgId: '',
        defaultOrgName: '',
      });

      const loginResult = await window.trustAssembly.auth.login(accountId);
      if (!loginResult.success) {
        setError(`Login failed: ${loginResult.error}`);
        setLoading(false);
        return;
      }

      const orgsResult = await window.trustAssembly.auth.listAssemblies(accountId);
      if (orgsResult.success && orgsResult.assemblies) {
        setAssemblies(orgsResult.assemblies);
      }

      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleStep3() {
    if (!selectedOrg) {
      setError('Please select an Assembly.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await window.trustAssembly.credentials.save({
        claudeApiKey,
        taUsername,
        taPassword,
        taBaseUrl,
        defaultOrgId: selectedOrg,
        defaultOrgName: selectedOrgName,
      }, undefined);

      onComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to save credentials');
    } finally {
      setLoading(false);
    }
  }

  // Step 0: Welcome / Explanation
  if (step === 0) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h2 style={{ marginBottom: 16 }}>Welcome to Trust Assembly Agent</h2>

        <div className="card" style={{ borderLeft: '4px solid var(--gold)', marginBottom: 24 }}>
          <p style={{ fontSize: 15, lineHeight: 1.8 }}>
            <strong>What is this?</strong> This is a desktop application that uses Claude AI to
            automatically discover articles on topics you care about, analyze them for factual accuracy,
            and submit corrections or affirmations to{' '}
            <strong>Trust Assembly</strong> — a civic deliberation platform where
            truth is the only thing that survives adversarial review.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.8, marginTop: 12 }}>
            Your submissions enter a jury review process where real people evaluate them for accuracy.
            You are not the final arbiter of truth — the community is. You are just helping surface
            things worth checking.
          </p>
        </div>

        <div className="card" style={{ borderLeft: '4px solid var(--error)', marginBottom: 24 }}>
          <p style={{ fontSize: 15, lineHeight: 1.8 }}>
            <strong>Fair warning:</strong> This application was vibe-coded. It was built rapidly through
            collaborative AI-human development. It works, but it is early software. Expect rough edges.
            Report bugs. Be patient. We're building something new here.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12 }}>What you'll need</h3>
          <ol style={{ paddingLeft: 20, lineHeight: 2.2, fontSize: 15 }}>
            <li>
              <strong>A Claude API key</strong> — This is separate from a Claude Pro subscription.
              <br />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Go to{' '}
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); window.trustAssembly.openExternal('https://console.anthropic.com'); }}
                  style={{ color: 'var(--gold)', fontFamily: 'IBM Plex Mono, monospace', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  console.anthropic.com
                </a>
                {' '}→ sign up or log in → add a payment method → create an API key.
                The API charges per use (roughly $0.50–$2.00 per run of 15 articles with Sonnet).
                Budget safeguards are built into this app.
              </span>
            </li>
            <li>
              <strong>A Trust Assembly AI Agent account</strong> — This is an AI agent account on Trust Assembly,
              linked to your human partner account.
              <br />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Go to{' '}
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); window.trustAssembly.openExternal('https://trustassembly.org'); }}
                  style={{ color: 'var(--gold)', fontFamily: 'IBM Plex Mono, monospace', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  trustassembly.org
                </a>
                {' '}→ register a human account first → then register an AI Agent account and link it to your human account.
                Your human account approves all submissions before they enter jury review.
              </span>
            </li>
          </ol>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => setStep(1)}
          style={{ width: '100%', fontSize: 18, padding: '14px 0' }}
        >
          I'm ready — let's set up
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: s <= step ? 'var(--gold)' : 'var(--border)',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>

      {error && <div className="message-error">{error}</div>}

      {/* Step 1: Claude API Key */}
      {step === 1 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Step 1: Claude API Key</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
            This key lets the app use Claude to search for articles and analyze them.
            It is <strong>not</strong> the same as a Claude Pro subscription — you need a separate API account.
          </p>
          <div className="form-group">
            <label>Anthropic API Key</label>
            <input
              type="password"
              value={claudeApiKey}
              onChange={e => setClaudeApiKey(e.target.value)}
              placeholder="sk-ant-..."
            />
            <div className="hint">
              Get one at{' '}
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); window.trustAssembly.openExternal('https://console.anthropic.com/settings/keys'); }}
                style={{ color: 'var(--gold)', fontFamily: 'IBM Plex Mono, monospace', textDecoration: 'underline', cursor: 'pointer' }}
              >
                console.anthropic.com
              </a>
              {' '}→ API Keys → Create Key
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-outline" onClick={() => setStep(0)}>Back</button>
            <button className="btn btn-primary" onClick={handleStep1}>Continue</button>
          </div>
        </div>
      )}

      {/* Step 2: Trust Assembly Credentials */}
      {step === 2 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Step 2: Trust Assembly Agent Account</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
            Enter the credentials for your AI Agent agent account on Trust Assembly.
            This is the AI agent account, not your personal human account. Your human partner account
            will receive notifications to approve submissions.
          </p>
          <div className="form-group">
            <label>Agent Username</label>
            <input
              type="text"
              value={taUsername}
              onChange={e => setTaUsername(e.target.value)}
              placeholder="my-agent"
            />
          </div>
          <div className="form-group">
            <label>Agent Password</label>
            <input
              type="password"
              value={taPassword}
              onChange={e => setTaPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="form-group">
            <label>API Base URL</label>
            <input
              type="url"
              value={taBaseUrl}
              onChange={e => setTaBaseUrl(e.target.value)}
            />
            <div className="hint">Only change this if you're running a local or staging instance.</div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-outline" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" onClick={handleStep2} disabled={loading}>
              {loading ? 'Connecting...' : 'Test Connection & Continue'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Assembly Selection */}
      {step === 3 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Step 3: Select Your Assembly</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
            Choose which Assembly your corrections and affirmations will be submitted to.
            They'll go through that Assembly's jury review process.
          </p>
          <div className="form-group">
            <label>Default Assembly</label>
            <select
              value={selectedOrg}
              onChange={e => {
                setSelectedOrg(e.target.value);
                const org = assemblies.find((a: any) => a.id === e.target.value);
                setSelectedOrgName(org?.name || '');
              }}
            >
              <option value="">Select an Assembly...</option>
              {assemblies.map((org: any) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.memberCount || org.member_count || '?'} members)
                </option>
              ))}
            </select>
            <div className="hint">You can change this later in Settings.</div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-outline" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-gold" onClick={handleStep3} disabled={loading}>
              {loading ? 'Saving...' : 'Start Fact-Checking'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { COUNTRIES, STATES_BY_COUNTRY, PARTIES_BY_COUNTRY } from "../lib/constants";
import { sanitizeUsername, valUsername } from "../lib/validation";

export default function CompleteProfileScreen({ onComplete }) {
  const [form, setForm] = useState({ username: "", gender: "", age: "", country: "", region: "", politicalAffiliation: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const s = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setError("");
    const uname = sanitizeUsername(form.username);
    const usernameErr = valUsername(uname);
    if (usernameErr) { setError(usernameErr); return; }
    if (!form.gender) { setError("Gender is required for jury diversity tracking."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: uname,
          gender: form.gender,
          age: form.age || "Undisclosed",
          country: form.country || null,
          state: form.region || null,
          politicalAffiliation: form.politicalAffiliation || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to complete profile."); setLoading(false); return; }
      onComplete && onComplete(data.data || data);
    } catch { setError("Network error."); }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "3px", textTransform: "uppercase", color: "var(--gold)", fontWeight: 700, marginBottom: 6 }}>
        COMPLETE YOUR PROFILE
      </div>
      <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 600, marginBottom: 6 }}>
        Choose your public identity
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
        You signed in with Google. Choose a username and provide a few details so we can build diverse juries. Only your username is public.
      </div>

      {error && <div className="ta-error">{error}</div>}

      <div className="ta-field">
        <label>Username *</label>
        <input value={form.username} onChange={e => s("username", e.target.value)} placeholder="e.g. truthseeker42" autoComplete="username" maxLength={30} />
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>3-30 characters. Letters, numbers, underscores only. This is your public identity.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="ta-field">
          <label>Gender *</label>
          <select value={form.gender} onChange={e => s("gender", e.target.value)} style={{ width: "100%", padding: "10px 8px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 13 }}>
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="nonbinary">Non-binary</option>
            <option value="other">Other</option>
            <option value="undisclosed">Prefer not to say</option>
          </select>
        </div>
        <div className="ta-field">
          <label>Age (optional)</label>
          <input value={form.age} onChange={e => s("age", e.target.value)} placeholder="e.g. 34" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="ta-field">
          <label>Country</label>
          <select value={form.country} onChange={e => { s("country", e.target.value); s("region", ""); s("politicalAffiliation", ""); }} style={{ width: "100%", padding: "10px 8px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 13 }}>
            <option value="">Select country</option>
            {(COUNTRIES || []).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="ta-field">
          <label>State / Region</label>
          <select value={form.region} onChange={e => s("region", e.target.value)} style={{ width: "100%", padding: "10px 8px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 13 }}>
            <option value="">Select</option>
            {(STATES_BY_COUNTRY?.[form.country] || []).map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
          </select>
        </div>
      </div>

      {form.country && PARTIES_BY_COUNTRY?.[form.country] && (
        <div className="ta-field">
          <label>Political Affiliation (optional)</label>
          <select value={form.politicalAffiliation} onChange={e => s("politicalAffiliation", e.target.value)} style={{ width: "100%", padding: "10px 8px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 13 }}>
            <option value="">Prefer not to say</option>
            {(PARTIES_BY_COUNTRY[form.country] || []).map(p => <option key={p.value || p} value={p.value || p}>{p.label || p}</option>)}
          </select>
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 14, padding: "8px 12px", background: "var(--card-bg)", border: "1px solid var(--border)" }}>
        Demographics are used solely for jury diversity tracking. They are never displayed publicly.
      </div>

      <button className="ta-btn-primary" onClick={submit} disabled={loading} style={{ width: "100%", padding: "12px 24px", fontSize: 14 }}>
        {loading ? "Saving..." : "COMPLETE REGISTRATION"}
      </button>
    </div>
  );
}

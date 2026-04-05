import { useState } from "react";
import { COUNTRIES, STATES_BY_COUNTRY } from "../lib/constants";

const COLORS = {
  bg: "#FAF8F0", gold: "#B8963E", goldLight: "#B8963E22", goldBorder: "#B8963E55",
  text: "#1a1a1a", muted: "#888888", subtle: "#aaaaaa", border: "#e0dcd0",
  card: "#FFFFFF", red: "#C0392B",
};

/**
 * Registration modal that overlays the submit form.
 * On "CREATE ACCOUNT AND SUBMIT", it registers the user then calls onRegisterAndSubmit
 * with the new user object so the parent can immediately submit the form.
 */
export default function RegistrationModal({ onRegisterAndSubmit, onSwitchToLogin, onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (!displayName.trim() || displayName.trim().length < 3) { setError("Display name must be at least 3 characters."); return; }
    if (!email.trim() || !email.includes("@")) { setError("Valid email is required."); return; }
    if (!password || password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: displayName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
          displayName: displayName.trim(),
          email: email.trim().toLowerCase(),
          password,
          country: country || undefined,
          state: region || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Registration failed."); setLoading(false); return; }

      // Build user object from response
      const regData = data.data || data;
      let user;
      try {
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          user = {
            id: me.id, username: me.username,
            displayName: me.display_name || me.username,
            email: me.email, isDI: me.is_di,
            orgId: me.primary_org_id || (me.organizations?.[0]?.id) || null,
            orgIds: (me.organizations || []).map(o => o.id),
            totalWins: 0, totalLosses: 0, currentStreak: 0,
            requiredStreak: 3, disputeWins: 0, disputeLosses: 0,
            deliberateLies: 0, ratingsReceived: [], reviewHistory: [],
            retractions: [], notifications: [],
          };
        }
      } catch {}

      if (!user) {
        user = {
          id: regData.id, username: regData.username,
          displayName: regData.displayName || displayName.trim(),
          email: email.trim(), orgIds: [],
          totalWins: 0, totalLosses: 0, currentStreak: 0,
        };
      }

      onRegisterAndSubmit(user);
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  const labelStyle = {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: "1.5px",
    textTransform: "uppercase", color: COLORS.muted, marginBottom: 5, display: "block",
  };
  const inputStyle = {
    width: "100%", boxSizing: "border-box", padding: "10px 12px",
    border: `1px solid ${COLORS.border}`, background: "#fff", fontSize: 13,
    fontFamily: "Helvetica Neue, sans-serif", color: COLORS.text,
    outline: "none", borderRadius: 0,
  };
  const selectStyle = { ...inputStyle, cursor: "pointer", appearance: "auto" };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.6)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: COLORS.card, padding: "28px", maxWidth: 480, width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxHeight: "90vh", overflowY: "auto",
        border: `2px solid ${COLORS.gold}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "2px", textTransform: "uppercase", color: COLORS.gold, fontWeight: 700 }}>
            BECOME A CITIZEN
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: COLORS.subtle, cursor: "pointer", lineHeight: 1 }}>&times;</button>
        </div>

        <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.6, marginBottom: 20 }}>
          Your correction is ready. Create an account to submit it for jury review by your fellow citizens.
        </div>

        {error && <div style={{ padding: "8px 12px", background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}`, color: COLORS.red, fontSize: 12, marginBottom: 14 }}>{error}</div>}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>DISPLAY NAME *</label>
          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="This is your public identity" style={inputStyle} />
          <div style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: COLORS.subtle, marginTop: 4 }}>
            Choose wisely — citizens see this on your submissions.
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>EMAIL *</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" style={inputStyle} autoComplete="email" />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>PASSWORD *</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" style={inputStyle} autoComplete="new-password" />
        </div>

        <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 14, marginBottom: 14 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: "1px", color: COLORS.subtle, marginBottom: 10 }}>OPTIONAL</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>COUNTRY</label>
              <select value={country} onChange={e => setCountry(e.target.value)} style={selectStyle}>
                <option value="">Select...</option>
                {(COUNTRIES || []).map((c, i) => c.disabled ? <option key={`sep-${i}`} disabled>──────────</option> : <option key={c.value || c} value={c.value || c}>{c.label || c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>STATE / REGION</label>
              <select value={region} onChange={e => setRegion(e.target.value)} style={selectStyle}>
                <option value="">Select...</option>
                {(STATES_BY_COUNTRY?.[country] || []).map(s => <option key={s.value || s} value={s.value || s}>{s.label || s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: COLORS.subtle, marginTop: 6 }}>
            These help us understand the geographic diversity of our citizen base. Never displayed publicly.
          </div>
        </div>

        <button onClick={submit} disabled={loading} style={{
          width: "100%", padding: "14px 24px", background: COLORS.gold, color: "#0D0D0A",
          border: "none", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
          fontWeight: 700, letterSpacing: "2px", cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}>
          {loading ? "CREATING ACCOUNT..." : "CREATE ACCOUNT AND SUBMIT"}
        </button>

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <span style={{ fontSize: 12, color: COLORS.subtle }}>Already a citizen? </span>
          <button onClick={onSwitchToLogin} style={{ background: "none", border: "none", color: COLORS.gold, fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 }}>Sign in</button>
        </div>

        <div style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: COLORS.subtle, textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
          By creating an account you agree to the Citizen's Charter and Privacy Policy.
        </div>
      </div>
    </div>
  );
}

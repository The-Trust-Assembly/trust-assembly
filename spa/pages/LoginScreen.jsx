import { useState } from "react";
import { SK } from "../lib/constants";
import { sG } from "../lib/storage";

export default function LoginScreen({ onLogin, onGoRegister }) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false); const [forgotEmail, setForgotEmail] = useState(""); const [forgotMsg, setForgotMsg] = useState(""); const [forgotError, setForgotError] = useState(""); const [forgotLoading, setForgotLoading] = useState(false);
  const go = async () => {
    setError(""); if (!username.trim()) return setError("Enter username."); if (!password) return setError("Enter password.");
    setLoading(true);
    // Authenticate via server API (sets HTTP-only session cookie)
    let loginData;
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim().toLowerCase(), password }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || "Login failed."); setLoading(false); return; }
      loginData = await res.json();
    } catch { setError("Network error. Please try again."); setLoading(false); return; }
    // Try to load full user profile; fall back to server login response if the bulk endpoint fails
    let u;
    try {
      const users = (await sG(SK.USERS)) || {};
      u = users[username.trim().toLowerCase()];
    } catch (e) { console.error("Failed to load users after login:", e); }
    if (!u) {
      // Build minimal user object from login response + /api/auth/me
      try {
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          u = {
            id: me.id, username: me.username, displayName: me.display_name || me.username,
            realName: me.real_name, email: me.email, gender: me.gender, age: me.age,
            country: me.country, state: me.state, politicalAffiliation: me.political_affiliation,
            bio: me.bio, isDI: me.is_di, diApproved: me.di_approved,
            signupDate: me.created_at, signupTimestamp: me.created_at ? new Date(me.created_at).getTime() : 0,
            orgId: me.primary_org_id || (me.organizations?.[0]?.id) || null,
            orgIds: (me.organizations || []).map(o => o.id),
            totalWins: me.total_wins || 0, totalLosses: me.total_losses || 0,
            currentStreak: me.current_streak || 0, requiredStreak: 3,
            disputeWins: me.dispute_wins || 0, disputeLosses: me.dispute_losses || 0,
            deliberateLies: me.deliberate_lies || 0,
            ratingsReceived: [], reviewHistory: [], retractions: [],
            notifications: [],
          };
        }
      } catch (e) { console.error("Failed to load /api/auth/me:", e); }
    }
    if (!u) { setError("Login succeeded but failed to load profile. Please try again."); setLoading(false); return; }
    setLoading(false); onLogin(u);
  };
  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Return to the Assembly</h2>
      {error && <div className="ta-error">{error}</div>}
      <div className="ta-field"><label>Username</label><input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" /></div>
      <div className="ta-field"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} autoComplete="current-password" /></div>
      <button className="ta-btn-primary" onClick={go} disabled={loading}>{loading ? "..." : "Enter"}</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <div><span style={{ color: "var(--text-sec)", fontSize: 13 }}>New? </span><button className="ta-link-btn" onClick={onGoRegister}>Register</button></div>
        <button className="ta-link-btn" style={{ fontSize: 12 }} onClick={() => { setShowForgot(true); setForgotMsg(""); setForgotError(""); }}>Forgot password?</button>
      </div>
      {showForgot && (
        <div style={{ marginTop: 16, padding: 14, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)", marginBottom: 8, fontWeight: 700 }}>Reset Password</div>
          {forgotMsg && <div className="ta-success">{forgotMsg}</div>}
          {forgotError && <div className="ta-error">{forgotError}</div>}
          {!forgotMsg && <>
            <div className="ta-field"><label>Email address</label><input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="Enter your account email" /></div>
            <button className="ta-btn-primary" disabled={forgotLoading} onClick={async () => {
              setForgotError(""); setForgotMsg("");
              if (!forgotEmail.trim() || !forgotEmail.includes("@")) { setForgotError("Enter a valid email address."); return; }
              setForgotLoading(true);
              try {
                const res = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: forgotEmail.trim() }) });
                const data = await res.json();
                if (res.ok) { setForgotMsg(data.data?.message || data.message || "If an account with that email exists, a reset link has been sent."); }
                else { setForgotError(data.error || "Something went wrong."); }
              } catch { setForgotError("Network error. Please try again."); }
              setForgotLoading(false);
            }}>{forgotLoading ? "Sending..." : "Send Reset Link"}</button>
          </>}
          <button className="ta-link-btn" style={{ fontSize: 11, marginTop: 8, display: "block" }} onClick={() => setShowForgot(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

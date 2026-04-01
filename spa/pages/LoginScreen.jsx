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
            bio: me.bio, isDI: me.is_di, diApproved: me.di_approved, emailVerified: me.email_verified,
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
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 10, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--mono)", letterSpacing: "1px" }}>OR CONTINUE WITH</div>
        <button onClick={() => { window.location.href = "/api/auth/oauth/google"; }} style={{
          width: "100%", padding: "10px 16px", background: "var(--card-bg)", border: "1px solid var(--border)",
          cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Sign in with Google
        </button>
      </div>
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

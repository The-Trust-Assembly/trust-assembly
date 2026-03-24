import { useState } from "react";
import { SK } from "../lib/constants";
import { sG } from "../lib/storage";

export default function LoginScreen({ onLogin, onGoRegister }) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
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
      <div style={{ textAlign: "center", marginTop: 16 }}><span style={{ color: "var(--text-sec)", fontSize: 13 }}>New? </span><button className="ta-link-btn" onClick={onGoRegister}>Register</button></div>
    </div>
  );
}

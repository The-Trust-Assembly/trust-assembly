import { useState } from "react";
import { SK } from "../lib/constants";
import { sG } from "../lib/storage";

export default function LoginScreen({ onLogin, onGoRegister }) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const go = async () => {
    setError(""); if (!username.trim()) return setError("Enter username."); if (!password) return setError("Enter password.");
    setLoading(true);
    // Authenticate via server API (sets HTTP-only session cookie)
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim().toLowerCase(), password }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || "Login failed."); setLoading(false); return; }
    } catch { setError("Network error. Please try again."); setLoading(false); return; }
    // Load user profile from KV store
    const users = (await sG(SK.USERS)) || {}; const u = users[username.trim().toLowerCase()];
    if (!u) { setError("No citizen found."); setLoading(false); return; }
    setLoading(false); onLogin(u);
  };
  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Return to the Assembly</h2>
      {error && <div className="ta-error">{error}</div>}
      <div className="ta-field"><label>Username</label><input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" /></div>
      <div className="ta-field"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} autoComplete="current-password" /></div>
      <button className="ta-btn-primary" onClick={go} disabled={loading}>{loading ? "..." : "Enter"}</button>
      <div style={{ textAlign: "center", marginTop: 16 }}><span style={{ color: "#475569", fontSize: 13 }}>New? </span><button className="ta-link-btn" onClick={onGoRegister}>Register</button></div>
    </div>
  );
}

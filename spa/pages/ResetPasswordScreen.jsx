import { useState } from "react";

export default function ResetPasswordScreen({ token, onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (!password || password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok) { setSuccess(true); }
      else { setError(data.error || "Reset failed. The link may have expired."); }
    } catch { setError("Network error. Please try again."); }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Reset Password</h2>
      {success ? (
        <div>
          <div className="ta-success">Your password has been reset.</div>
          <button className="ta-btn-primary" onClick={onDone} style={{ marginTop: 12 }}>Go to Login</button>
        </div>
      ) : (
        <div>
          {error && <div className="ta-error">{error}</div>}
          <div className="ta-field"><label>New Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /></div>
          <div className="ta-field"><label>Confirm Password</label><input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} autoComplete="new-password" /></div>
          <button className="ta-btn-primary" onClick={submit} disabled={loading}>{loading ? "Resetting..." : "Reset Password"}</button>
        </div>
      )}
    </div>
  );
}

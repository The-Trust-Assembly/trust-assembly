import { useState, useEffect } from "react";

export default function VerifyEmailScreen({ token, onDone }) {
  const [status, setStatus] = useState("verifying"); // verifying, success, error, already
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setMessage("No verification token provided."); return; }
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        const result = data.data || data;
        if (res.ok) {
          if (result.alreadyVerified) {
            setStatus("already");
            setMessage("Your email is already verified.");
          } else {
            setStatus("success");
            setMessage(result.message || "Email verified successfully.");
          }
        } else {
          setStatus("error");
          setMessage(result.error || "Verification failed.");
        }
      } catch {
        setStatus("error");
        setMessage("Network error. Please try again.");
      }
    })();
  }, [token]);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px", textAlign: "center" }}>
      {status === "verifying" && (
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>VERIFYING EMAIL</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>Please wait...</div>
        </div>
      )}
      {status === "success" && (
        <div>
          <div style={{ fontSize: 28, color: "var(--green)", marginBottom: 12 }}>&#10003;</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Email Verified</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24, lineHeight: 1.6 }}>{message}</div>
          <button onClick={onDone} style={{
            padding: "10px 24px", background: "var(--gold)", color: "var(--bg)", border: "none",
            fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, letterSpacing: "1px", cursor: "pointer",
          }}>CONTINUE TO TRUST ASSEMBLY</button>
        </div>
      )}
      {status === "already" && (
        <div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Already Verified</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24 }}>{message}</div>
          <button onClick={onDone} style={{
            padding: "10px 24px", background: "var(--gold)", color: "var(--bg)", border: "none",
            fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, letterSpacing: "1px", cursor: "pointer",
          }}>CONTINUE</button>
        </div>
      )}
      {status === "error" && (
        <div>
          <div style={{ fontSize: 28, color: "var(--red)", marginBottom: 12 }}>!</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Verification Failed</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24, lineHeight: 1.6 }}>{message}</div>
          <button onClick={onDone} style={{
            padding: "10px 24px", background: "transparent", color: "var(--gold)", border: "1px solid var(--gold)",
            fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, letterSpacing: "1px", cursor: "pointer",
          }}>GO TO LOGIN</button>
        </div>
      )}
    </div>
  );
}

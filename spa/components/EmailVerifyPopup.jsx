import { useState } from "react";

/**
 * EmailVerifyPopup — Modal overlay prompting the user to verify their email.
 * Shows after registration/tutorial completion and when attempting to submit
 * without a verified email. Includes a resend button with rate-limit feedback.
 *
 * Props:
 *   onClose    — dismiss the popup
 *   userEmail  — the email address to display (optional, for messaging)
 */
export default function EmailVerifyPopup({ onClose, userEmail }) {
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState(null);

  async function handleResend() {
    setResending(true);
    setResendMsg(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResendMsg({ type: "success", text: "Verification email sent. Check your inbox." });
      } else {
        setResendMsg({ type: "error", text: data.error || "Could not resend. Please try again later." });
      }
    } catch {
      setResendMsg({ type: "error", text: "Network error. Please try again." });
    }
    setResending(false);
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.5)", zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--body, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
    }} onClick={onClose}>
      <div style={{
        background: "var(--bg, #FAF8F0)", borderRadius: 8, padding: "28px 32px",
        maxWidth: 420, width: "90%", boxShadow: "0 8px 32px rgba(27,42,74,0.2)",
        border: "1px solid var(--border, #DCD8D0)",
        position: "relative",
      }} onClick={e => e.stopPropagation()}>

        {/* Close button */}
        <button onClick={onClose} style={{
          position: "absolute", top: 12, right: 14, background: "none", border: "none",
          fontSize: 18, color: "var(--text-muted, #7A7570)", cursor: "pointer", padding: "2px 6px",
        }} aria-label="Close">&times;</button>

        {/* Icon */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 56, height: 56, borderRadius: "50%",
            background: "rgba(184,150,62,0.1)", border: "2px solid var(--gold, #B8963E)",
          }}>
            <span style={{ fontSize: 28 }}>&#9993;</span>
          </div>
        </div>

        {/* Heading */}
        <h2 style={{
          fontFamily: "var(--serif, Georgia, serif)", fontSize: 20, fontWeight: 700,
          color: "var(--text, #2B2B2B)", textAlign: "center", margin: "0 0 8px",
        }}>Verify Your Email</h2>

        {/* Message */}
        <p style={{
          fontSize: 13, color: "var(--text-sec, #5A5650)", lineHeight: 1.6,
          textAlign: "center", margin: "0 0 20px",
        }}>
          We sent a verification link to{" "}
          {userEmail
            ? <strong style={{ color: "var(--text, #2B2B2B)" }}>{userEmail}</strong>
            : "your email address"
          }.
          Click the link to verify your account.
          You need to verify your email before you can submit corrections or affirmations.
        </p>

        {/* Resend button */}
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <button
            onClick={handleResend}
            disabled={resending}
            style={{
              background: "var(--gold, #B8963E)", color: "#fff", border: "none",
              borderRadius: 4, padding: "10px 24px", fontSize: 13, fontWeight: 600,
              cursor: resending ? "wait" : "pointer", opacity: resending ? 0.7 : 1,
            }}
          >
            {resending ? "Sending..." : "Resend Verification Email"}
          </button>
        </div>

        {/* Resend feedback */}
        {resendMsg && (
          <div style={{
            textAlign: "center", fontSize: 12, marginBottom: 8,
            color: resendMsg.type === "success" ? "var(--green, #1B5E3F)" : "var(--red, #C4573F)",
          }}>
            {resendMsg.text}
          </div>
        )}

        {/* Dismiss */}
        <div style={{ textAlign: "center" }}>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "var(--text-muted, #7A7570)",
            fontSize: 12, cursor: "pointer", textDecoration: "underline",
          }}>
            I'll do this later
          </button>
        </div>
      </div>
    </div>
  );
}

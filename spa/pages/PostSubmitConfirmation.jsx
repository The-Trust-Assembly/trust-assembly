import { useState, useEffect } from "react";
import { sG } from "../lib/storage";
import { SK } from "../lib/constants";

const COLORS = {
  bg: "#FAF8F0", gold: "#B8963E", goldLight: "#B8963E22", goldBorder: "#B8963E55",
  text: "#1a1a1a", muted: "#888888", subtle: "#aaaaaa", border: "#e0dcd0",
  card: "#FFFFFF", green: "#27AE60", greenLight: "#27AE6015",
};

export default function PostSubmitConfirmation({ user, submittedTitle, submittedOrg, onNavigate }) {
  const [trustProgress, setTrustProgress] = useState(0);

  useEffect(() => {
    if (!user) return;
    // Compute trust progress: consecutive wins toward trusted contributor (10)
    setTrustProgress(Math.min(user.currentStreak || 0, 10));
  }, [user]);

  return (
    <div style={{ maxWidth: 580, margin: "0 auto", padding: "32px 16px 60px" }}>
      {/* Success banner */}
      <div style={{ padding: "24px 20px", background: COLORS.greenLight, border: `1.5px solid ${COLORS.green}`, marginBottom: 24 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "2px", textTransform: "uppercase", color: COLORS.green, fontWeight: 700, marginBottom: 8 }}>
          YOUR CORRECTION HAS BEEN SUBMITTED
        </div>
        {submittedTitle && (
          <div style={{ fontFamily: "var(--serif)", fontSize: 16, color: COLORS.text, marginBottom: 4 }}>
            "{submittedTitle}"
          </div>
        )}
        {submittedOrg && (
          <div style={{ fontSize: 12, color: COLORS.muted }}>
            Submitted to {submittedOrg}
          </div>
        )}
      </div>

      {/* What happens next */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: COLORS.gold, fontWeight: 700, marginBottom: 16 }}>
          WHAT HAPPENS NEXT
        </div>
        <div style={{ borderTop: `2px solid ${COLORS.gold}`, paddingTop: 16 }}>
          {[
            { n: "1", title: "JURY ASSIGNMENT", desc: "Fellow citizens will be assigned as jurors to evaluate your correction. This usually takes 24-48 hours." },
            { n: "2", title: "DELIBERATION", desc: "Jurors review your evidence, vote to approve or reject, and provide their reasoning." },
            { n: "3", title: "VERDICT", desc: "If approved, your correction becomes part of the public record. You'll be notified either way." },
          ].map((step, i) => (
            <div key={step.n} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: i < 2 ? `1px solid ${COLORS.border}` : "none" }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, color: COLORS.gold, minWidth: 24 }}>{step.n}</div>
              <div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "1.5px", color: COLORS.text, fontWeight: 700, marginBottom: 4 }}>{step.title}</div>
                <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trust progress */}
      {user && (
        <div style={{ padding: "16px 20px", background: COLORS.card, border: `1px solid ${COLORS.border}`, marginBottom: 24 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "1.5px", textTransform: "uppercase", color: COLORS.muted, marginBottom: 8 }}>
            YOUR CITIZEN STATUS
          </div>
          <div style={{ fontSize: 13, color: COLORS.text, marginBottom: 8 }}>
            Trusted Contributor progress:
          </div>
          <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} style={{
                flex: 1, height: 8,
                background: i < trustProgress ? COLORS.gold : COLORS.border,
              }} />
            ))}
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: COLORS.subtle }}>
            {trustProgress}/10 consecutive approvals.{" "}
            {trustProgress >= 10 ? "Trusted Contributor status earned!" : `${10 - trustProgress} more to skip jury review.`}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "1.5px", textTransform: "uppercase", color: COLORS.muted, marginBottom: 12 }}>
        WHAT YOU CAN DO NOW
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { label: "Submit another correction", action: () => onNavigate("submit") },
          { label: "Browse the feed -- see what others have submitted", action: () => onNavigate("feed") },
          { label: "Get the browser extension -- correct pages as you browse", action: () => onNavigate("extensions") },
          { label: "Explore assemblies -- join groups aligned with your values", action: () => onNavigate("orgs") },
        ].map(item => (
          <button key={item.label} onClick={item.action} style={{
            padding: "12px 16px", background: COLORS.card, border: `1px solid ${COLORS.border}`,
            fontFamily: "Helvetica Neue, sans-serif", fontSize: 13, color: COLORS.text,
            cursor: "pointer", textAlign: "left", transition: "border-color 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = COLORS.gold}
            onMouseLeave={e => e.currentTarget.style.borderColor = COLORS.border}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

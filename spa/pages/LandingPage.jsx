import { useState, useEffect } from "react";
import { SK } from "../lib/constants";
import { sG } from "../lib/storage";
import { sDate, hotScore } from "../lib/utils";
import { StatusPill, SubHeadline } from "../components/ui";

const COLORS = {
  bg: "#FAF8F0", gold: "#B8963E", goldLight: "#B8963E22", goldBorder: "#B8963E55",
  text: "#1a1a1a", muted: "#888888", subtle: "#aaaaaa", border: "#e0dcd0",
  card: "#FFFFFF", cream: "#f5f0e0",
};

export default function LandingPage({ onSubmitUrl, onLogin, onRegister }) {
  const [url, setUrl] = useState("");
  const [recentCorrections, setRecentCorrections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const subs = (await sG(SK.SUBS)) || {};
        const approved = Object.values(subs)
          .filter(s => s.status === "approved" || s.status === "consensus")
          .sort((a, b) => hotScore(b) - hotScore(a))
          .slice(0, 5);
        setRecentCorrections(approved);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const handleGo = () => {
    const trimmed = url.trim();
    if (trimmed && trimmed.startsWith("http")) {
      onSubmitUrl(trimmed);
    }
  };

  return (
    <div>
      {/* Hero Section */}
      <div style={{ background: "linear-gradient(180deg, #0D0D0D 0%, #1B2A4A 100%)", padding: "64px 24px 56px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 36, fontWeight: 400, color: "#F0EDE6", lineHeight: 1.25, maxWidth: 560, margin: "0 auto 12px" }}>
          The internet has no editor.
        </h1>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 36, fontWeight: 400, color: COLORS.gold, lineHeight: 1.25, maxWidth: 560, margin: "0 auto 20px" }}>
          You are the editor.
        </h2>
        <p style={{ fontSize: 15, color: "#999", lineHeight: 1.6, maxWidth: 480, margin: "0 auto 32px" }}>
          Correct misleading headlines. Flag false product claims. Call out misinformation — and let your fellow citizens verify it.
        </p>

        {/* URL Input */}
        <div style={{ maxWidth: 560, margin: "0 auto", background: COLORS.cream, border: `2px solid ${COLORS.gold}`, padding: "16px 18px" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: COLORS.gold, fontWeight: 700, marginBottom: 10, textAlign: "left" }}>
            PASTE A URL YOU WANT TO CORRECT
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleGo()}
              placeholder="https://..."
              style={{
                flex: 1, padding: "12px 14px", border: `1px solid ${COLORS.goldBorder}`,
                background: "#fff", fontSize: 14, fontFamily: "Helvetica Neue, sans-serif",
                color: COLORS.text, outline: "none", borderRadius: 0,
              }}
            />
            <button onClick={handleGo} style={{
              padding: "12px 24px", background: COLORS.gold, color: "#0D0D0A", border: "none",
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700,
              letterSpacing: "2px", cursor: "pointer", whiteSpace: "nowrap",
            }}>GO</button>
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "#999", letterSpacing: "0.5px", marginTop: 8, textAlign: "left" }}>
            News articles / YouTube videos / Tweets / Podcasts / Product listings / Reddit posts / and more
          </div>
        </div>
      </div>

      {/* Value Propositions */}
      <div style={{ maxWidth: 660, margin: "0 auto", padding: "48px 24px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            { title: "CORRECT", desc: "Submit corrections to misleading content anywhere on the internet." },
            { title: "VERIFY", desc: "Fellow citizens serve as jurors and evaluate your evidence through structured deliberation." },
            { title: "TRUST", desc: "Corrections that survive review become part of the public record — visible to everyone." },
          ].map(card => (
            <div key={card.title} style={{ padding: "20px 16px", border: `1px solid ${COLORS.border}`, background: COLORS.card }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "2px", color: COLORS.gold, fontWeight: 700, marginBottom: 10 }}>{card.title}</div>
              <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>{card.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Corrections */}
      {recentCorrections.length > 0 && (
        <div style={{ maxWidth: 660, margin: "0 auto", padding: "0 24px 40px" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: COLORS.gold, fontWeight: 700, marginBottom: 12 }}>
            RECENTLY VERIFIED BY THE ASSEMBLY
          </div>
          <div style={{ borderTop: `2px solid ${COLORS.gold}`, paddingTop: 12 }}>
            {recentCorrections.map(sub => (
              <div key={sub.id} style={{ padding: "12px 0", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SubHeadline sub={sub} size={13} />
                  <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: COLORS.subtle, marginTop: 4 }}>
                    {sub.orgName} / {sDate(sub.resolvedAt || sub.createdAt)}
                  </div>
                </div>
                <StatusPill status={sub.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Extension CTA */}
      <div style={{ maxWidth: 660, margin: "0 auto", padding: "0 24px 40px" }}>
        <div style={{ padding: "20px 24px", border: `1px solid ${COLORS.border}`, background: COLORS.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "2px", color: COLORS.gold, fontWeight: 700, marginBottom: 6 }}>GET THE BROWSER EXTENSION</div>
            <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>See corrections on every site you visit. Submit directly from any page.</div>
          </div>
          <button onClick={onLogin} style={{
            padding: "10px 20px", background: COLORS.gold, color: "#0D0D0A", border: "none",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700,
            letterSpacing: "1px", cursor: "pointer", whiteSpace: "nowrap",
          }}>LEARN MORE</button>
        </div>
      </div>

      {/* Footer Actions */}
      <div style={{ textAlign: "center", padding: "24px 24px 48px", borderTop: `1px solid ${COLORS.border}` }}>
        <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: COLORS.text, marginBottom: 8 }}>Ready to correct the record?</div>
        <div style={{ fontSize: 13, color: COLORS.subtle, marginBottom: 20 }}>Free. Open. Jury-verified. No algorithm decides what's true.</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          <button onClick={onRegister} style={{
            padding: "12px 28px", background: COLORS.gold, color: "#0D0D0A", border: "none",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700,
            letterSpacing: "1px", cursor: "pointer",
          }}>BECOME A CITIZEN</button>
          <button onClick={onLogin} style={{
            padding: "12px 28px", background: "transparent", color: COLORS.gold,
            border: `1px solid ${COLORS.gold}`,
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700,
            letterSpacing: "1px", cursor: "pointer",
          }}>SIGN IN</button>
        </div>
      </div>
    </div>
  );
}

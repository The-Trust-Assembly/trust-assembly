import { useState, useEffect, useRef } from "react";
import { SK, HERO_SLIDES } from "../lib/constants";
import { sG } from "../lib/storage";
import { sDate, hotScore } from "../lib/utils";
import { StatusPill, SubHeadline } from "../components/ui";

export default function LandingPage({ onSubmitUrl, onLogin, onRegister, onExtension }) {
  const [url, setUrl] = useState("");
  const [recentCorrections, setRecentCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroFading, setHeroFading] = useState(false);
  const [heroPaused, setHeroPaused] = useState(false);

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

  // Auto-advance slides
  useEffect(() => {
    if (heroPaused) return;
    const t = setInterval(() => {
      setHeroFading(true);
      setTimeout(() => { setHeroIdx(i => (i + 1) % HERO_SLIDES.length); setHeroFading(false); }, 280);
    }, 6000);
    return () => clearInterval(t);
  }, [heroPaused]);

  const handleGo = () => {
    const trimmed = url.trim();
    if (trimmed && trimmed.startsWith("http")) {
      onSubmitUrl(trimmed);
    }
  };

  return (
    <div>

      {/* ═══ SECTION 1: HERO — Show what this is ═══ */}
      <div style={{ background: "linear-gradient(180deg, #0D0D0D 0%, #1B2A4A 100%)", padding: "36px 24px 32px", textAlign: "center", overflow: "hidden" }}>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 28, fontWeight: 400, color: "#F0EDE6", lineHeight: 1.3, maxWidth: 520, margin: "0 auto 10px" }}>
          The internet's corrections layer.
        </h1>

        {/* Top CTAs — for people who already know */}
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "center", gap: 10 }}>
          <button onClick={onExtension || onRegister} style={{
            fontFamily: "var(--font)", fontSize: 13, fontWeight: 600, color: "#1a1a1a",
            backgroundColor: "var(--gold)", border: "none", borderRadius: 4, padding: "10px 22px", cursor: "pointer",
          }}>Install Extension</button>
          <button onClick={onRegister} style={{
            fontFamily: "var(--font)", fontSize: 13, fontWeight: 500, color: "#ccc",
            backgroundColor: "transparent", border: "1px solid #444", borderRadius: 4, padding: "10px 22px", cursor: "pointer",
          }}>Register</button>
        </div>

        {/* Slide label */}
        <div style={{ fontSize: 12, color: "#999", marginBottom: 10, fontStyle: "italic", opacity: heroFading ? 0 : 1, transition: "opacity 0.2s" }}>
          {HERO_SLIDES[heroIdx]?.label}
        </div>

        {/* Before / After slides — matches production main logic */}
        <div style={{ maxWidth: 660, margin: "0 auto", height: 480, overflow: "hidden", opacity: heroFading ? 0 : 1, transform: heroFading ? "translateY(4px)" : "translateY(0)", transition: "opacity 0.25s ease, transform 0.25s ease" }}
          onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)}>
          {HERO_SLIDES[heroIdx]?.layout === "columns" ? (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 4, padding: "0 4px" }}>
                <div style={{ flex: 1, textAlign: "left" }}><span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.06em" }}>BEFORE</span></div>
                <div style={{ flex: 1, textAlign: "left" }}><span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, color: "var(--gold)", letterSpacing: "0.06em" }}>AFTER TRUST ASSEMBLY</span></div>
              </div>
              <div style={{ display: "flex", gap: 12, minHeight: 200 }}>
                <div style={{ flex: 1, borderRadius: 6, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.3)", border: "1px solid #333", opacity: 0.72 }}>{HERO_SLIDES[heroIdx]?.before}</div>
                <div style={{ flex: 1, borderRadius: 6, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px #B8963E33", border: "1px solid #B8963E44" }}>{HERO_SLIDES[heroIdx]?.after}</div>
              </div>
            </>
          ) : (
            <div style={{ maxWidth: 480, margin: "0 auto" }}>
              <div style={{ textAlign: "left", marginBottom: 4 }}><span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.06em" }}>BEFORE</span></div>
              <div style={{ borderRadius: 6, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.25)", border: "1px solid #333", opacity: 0.72, marginBottom: 8 }}>{HERO_SLIDES[heroIdx]?.before}</div>
              <div style={{ textAlign: "left", marginBottom: 4 }}><span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, color: "var(--gold)", letterSpacing: "0.06em" }}>AFTER TRUST ASSEMBLY</span></div>
              <div style={{ borderRadius: 6, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.25), 0 0 0 1px #B8963E33", border: "1px solid #B8963E44" }}>{HERO_SLIDES[heroIdx]?.after}</div>
            </div>
          )}
        </div>

        <div style={{ maxWidth: 440, margin: "20px auto 0" }}>
          <p style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>
            Community juries review headlines and claims across the web.
            Corrections appear right where the misinformation lives — in your browser, on every platform. No algorithm decides what's true. People do.
          </p>
        </div>
      </div>

      {/* ═══ SECTION 2: HOW IT WORKS — Educate before the ask ═══ */}
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "40px 24px 32px" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 400, color: "#1a1a1a", textAlign: "center", marginBottom: 28 }}>How it works</h2>
        {[
          { n: "1", title: "Someone notices a misleading claim", desc: "A citizen submits a correction with evidence. An affirmation if the reporting is accurate. Both go through the same jury process." },
          { n: "2", title: "A random jury reviews it", desc: "Jurors are randomly drawn from the citizen's Assembly. They vote independently. The math rewards honesty and makes deception structurally irrational." },
          { n: "3", title: "Independent groups verify it", desc: "Approved corrections advance to juries from other Assemblies — people with different perspectives reviewing the same evidence. What survives both achieves Consensus." },
          { n: "4", title: "The correction appears in your browser", desc: "Misleading headlines turn red. Accurate reporting turns green. Correction cards appear in social feeds. The truth surfaces everywhere the original claim lives." },
        ].map((step, i) => (
          <div key={i} style={{ display: "flex", gap: 14, padding: "16px 0", borderBottom: i < 3 ? "1px solid #eee" : "none" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "#1a1a1a", color: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{step.n}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 3 }}>{step.title}</div>
              <div style={{ fontSize: 13, color: "#777", lineHeight: 1.6 }}>{step.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ SECTION 3: YOUR TURN — The challenge ═══ */}
      <div style={{ background: "linear-gradient(180deg, #0D0D0D 0%, #1B2A4A 100%)", padding: "36px 24px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 400, color: "#F0EDE6", lineHeight: 1.3, margin: "0 auto 8px" }}>
          Your turn.
        </h2>
        <p style={{ fontSize: 14, color: "#999", lineHeight: 1.5, maxWidth: 440, margin: "0 auto 24px" }}>
          See something wrong? Paste the URL. The form adapts to the content type — articles, videos, tweets, podcasts, product listings, and more.
        </p>

        <div style={{ maxWidth: 520, margin: "0 auto", background: "rgba(245,240,224,0.95)", border: "2px solid var(--gold)", padding: "16px 18px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "var(--gold)", fontWeight: 700, marginBottom: 8, textAlign: "left" }}>
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
                flex: 1, padding: "11px 14px", border: "1px solid rgba(184,150,62,0.4)",
                background: "#fff", fontSize: 14, fontFamily: "Helvetica Neue, sans-serif",
                color: "#1a1a1a", outline: "none", borderRadius: 0,
              }}
            />
            <button onClick={handleGo} style={{
              padding: "11px 22px", background: "var(--gold)", color: "#0D0D0A", border: "none",
              fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
              letterSpacing: "2px", cursor: "pointer", whiteSpace: "nowrap",
            }}>GO</button>
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "#999", letterSpacing: "0.5px", marginTop: 6, textAlign: "left" }}>
            News articles / YouTube videos / Tweets / Podcasts / Product listings / Reddit posts / and more
          </div>
        </div>
      </div>

      {/* ═══ SECTION 4: PROOF — Recent verified corrections ═══ */}
      {recentCorrections.length > 0 && (
        <div style={{ maxWidth: 620, margin: "0 auto", padding: "32px 24px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "var(--gold)", fontWeight: 700, marginBottom: 10 }}>
            RECENTLY VERIFIED BY THE ASSEMBLY
          </div>
          <div style={{ borderTop: "2px solid var(--gold)", paddingTop: 10 }}>
            {recentCorrections.map(sub => (
              <div key={sub.id} style={{ padding: "10px 0", borderBottom: "1px solid #e0dcd0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SubHeadline sub={sub} size={13} />
                  <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#aaa", marginTop: 3 }}>
                    {sub.orgName} / {sDate(sub.resolvedAt || sub.createdAt)}
                  </div>
                </div>
                <StatusPill status={sub.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SECTION 5: EXTENSION CTA ═══ */}
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "0 24px 32px" }}>
        <div style={{ padding: "18px 22px", border: "1px solid #e0dcd0", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "2px", color: "var(--gold)", fontWeight: 700, marginBottom: 4 }}>GET THE BROWSER EXTENSION</div>
            <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5 }}>See corrections on every site you visit. Submit directly from any page.</div>
          </div>
          <button onClick={onExtension || onRegister} style={{
            padding: "9px 18px", background: "var(--gold)", color: "#0D0D0A", border: "none",
            fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "1px", cursor: "pointer", whiteSpace: "nowrap",
          }}>DOWNLOAD</button>
        </div>
      </div>

      {/* ═══ SECTION 6: BOTTOM CTAs — for people who scrolled all the way ═══ */}
      <div style={{ textAlign: "center", padding: "24px 24px 48px", borderTop: "1px solid #e0dcd0" }}>
        <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "#1a1a1a", marginBottom: 6 }}>Ready to correct the record?</div>
        <div style={{ fontSize: 13, color: "#aaa", marginBottom: 18 }}>Free. Open. Jury-verified. No algorithm decides what's true.</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          <button onClick={onRegister} style={{
            padding: "11px 26px", background: "var(--gold)", color: "#0D0D0A", border: "none",
            fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
            letterSpacing: "1px", cursor: "pointer",
          }}>BECOME A CITIZEN</button>
          <button onClick={onLogin} style={{
            padding: "11px 26px", background: "transparent", color: "var(--gold)",
            border: "1px solid var(--gold)",
            fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
            letterSpacing: "1px", cursor: "pointer",
          }}>SIGN IN</button>
        </div>
      </div>
    </div>
  );
}

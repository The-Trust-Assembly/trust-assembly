import { useState, useEffect } from "react";

const CrestIcon = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 3L17 5.5V11C17 14.8 14.2 18.2 12 19.3C9.8 18.2 7 14.8 7 11V5.5L12 3Z" stroke="#B8963E" strokeWidth="0.8" fill="none"/>
    <path d="M12 2L14 8H10L12 2Z" fill="#B8963E" opacity="0.9"/>
    <rect x="10" y="8" width="4" height="10" rx="0.5" fill="#B8963E" opacity="0.8"/>
    <path d="M7 18H17L18 22H6L7 18Z" fill="#B8963E" opacity="0.7"/>
    <circle cx="12" cy="4" r="2.5" fill="none" stroke="#B8963E" strokeWidth="0.7" opacity="0.35"/>
    <circle cx="12" cy="4" r="4.5" fill="none" stroke="#B8963E" strokeWidth="0.4" opacity="0.18"/>
    <line x1="6" y1="5" x2="8.5" y2="5" stroke="#B8963E" strokeWidth="0.5" opacity="0.3"/>
    <line x1="15.5" y1="5" x2="18" y2="5" stroke="#B8963E" strokeWidth="0.5" opacity="0.3"/>
  </svg>
);

const Lh = ({ size = 12, color = "#B8963E" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M12 2L14 8H10L12 2Z" fill={color} opacity="0.9"/>
    <rect x="10" y="8" width="4" height="10" rx="0.5" fill={color} opacity="0.8"/>
    <path d="M7 18H17L18 22H6L7 18Z" fill={color} opacity="0.7"/>
  </svg>
);

const TABadge = ({ text, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}>
    <Lh size={10} color="#B8963E" />
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, fontWeight: 600, color: "#B8963E", letterSpacing: "0.04em" }}>TRUST ASSEMBLY</span>
    <span style={{ fontSize: 8.5, fontWeight: 700, color, backgroundColor: color + "18", padding: "1px 5px", borderRadius: 6, fontFamily: "monospace" }}>{text}</span>
  </div>
);

const AttrLine = ({ label, org, votes, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color, opacity: 0.65 }}>
    <span style={{ fontWeight: 600, letterSpacing: "0.04em" }}>{label}</span>
    <span style={{ opacity: 0.4 }}>·</span>
    <span>{org}</span>
    <span style={{ opacity: 0.4 }}>·</span>
    <span>{votes}</span>
  </div>
);

// ═══════════════════════════════════
// SLIDES — content IS the pitch
// ═══════════════════════════════════

const slides = [
  {
    id: "sensationalism",
    pills: "📰 Sensationalized Headlines",
    label: "When a headline turns a nothingburger into the apocalypse",
    layout: "columns",
    before: (
      <div style={{ padding: "18px 20px", backgroundColor: "#fff", borderRadius: 8, height: "100%" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, paddingBottom: 7, borderBottom: "2px solid #222", fontFamily: "Helvetica, sans-serif" }}>
          Daily Health Wire
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3, color: "#1a1a1a", fontFamily: "Georgia, serif" }}>
          Common Grocery Store Item Linked to 300% Surge in Cancer Risk, Study Warns
        </div>
        <div style={{ fontSize: 11, color: "#999", marginTop: 10, fontFamily: "Helvetica, sans-serif" }}>By Staff Report · March 14, 2026</div>
      </div>
    ),
    after: (
      <div style={{ padding: "18px 20px", backgroundColor: "#fff", borderRadius: 8, height: "100%" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, paddingBottom: 7, borderBottom: "2px solid #222", fontFamily: "Helvetica, sans-serif" }}>
          Daily Health Wire
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3, color: "#8B2D2D", fontFamily: "Georgia, serif" }}>
          Preliminary Lab Study of 12 Mice Finds Cell Changes from High-Dose Additive Exposure Not Replicated in Humans
          <span style={{ marginLeft: 5 }}><Lh size={12} color="#8B2D2D" /></span>
        </div>
        <AttrLine label="CORRECTED" org="Science Watch" votes="9/9" color="#8B2D2D" />
        <div style={{ fontSize: 11, color: "#999", marginTop: 10, fontFamily: "Helvetica, sans-serif" }}>By Staff Report · March 14, 2026</div>
      </div>
    ),
  },
  {
    id: "twitter",
    pills: "𝕏 Political Spin",
    label: "When the framing does the lying so the words don't have to",
    layout: "stacked",
    before: (
      <div style={{ padding: "12px 14px", backgroundColor: "#000", borderRadius: 8, color: "#E7E9EA", fontFamily: "-apple-system, sans-serif" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", backgroundColor: "#2D3557", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 3 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Capitol Insider</span>
              <svg width="14" height="14" viewBox="0 0 22 22"><path d="M20.4 11l-2.2-2.5.3-3.3-3.2-.7L13.1 1.5 11 2.5 8.9 1.5 6.7 4.5l-3.2.7.3 3.3L1.6 11l2.2 2.5-.3 3.3 3.2.7 2.2 3 2.1-1 2.1 1 2.2-3 3.2-.7-.3-3.3z" fill="#1D9BF0"/><path d="M9.5 14.2L6.8 11.5l1.4-1.4 1.3 1.3 3.3-3.3 1.4 1.4z" fill="#fff"/></svg>
              <span style={{ color: "#71767B", fontSize: 13 }}>@capitolinsider · 1h</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.4 }}>
              Economy in FREEFALL 📉 Jobs report MISSES expectations as unemployment crisis deepens. Is this the worst economy in a generation?
            </div>
            <div style={{ display: "flex", gap: 16, color: "#71767B", fontSize: 11, marginTop: 8 }}>
              <span>💬 4.1K</span><span>🔁 12.3K</span><span>❤️ 28.7K</span>
            </div>
          </div>
        </div>
      </div>
    ),
    after: (
      <div style={{ borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", backgroundColor: "#000", color: "#E7E9EA", fontFamily: "-apple-system, sans-serif" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", backgroundColor: "#2D3557", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 3 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Capitol Insider</span>
                <svg width="14" height="14" viewBox="0 0 22 22"><path d="M20.4 11l-2.2-2.5.3-3.3-3.2-.7L13.1 1.5 11 2.5 8.9 1.5 6.7 4.5l-3.2.7.3 3.3L1.6 11l2.2 2.5-.3 3.3 3.2.7 2.2 3 2.1-1 2.1 1 2.2-3 3.2-.7-.3-3.3z" fill="#1D9BF0"/><path d="M9.5 14.2L6.8 11.5l1.4-1.4 1.3 1.3 3.3-3.3 1.4 1.4z" fill="#fff"/></svg>
                <span style={{ color: "#71767B", fontSize: 13 }}>@capitolinsider · 1h</span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.4 }}>
                Economy in FREEFALL 📉 Jobs report MISSES expectations as unemployment crisis deepens. Is this the worst economy in a generation?
              </div>
              <div style={{ display: "flex", gap: 16, color: "#71767B", fontSize: 11, marginTop: 8 }}>
                <span>💬 4.1K</span><span>🔁 12.3K</span><span>❤️ 28.7K</span>
              </div>
            </div>
          </div>
        </div>
        <div style={{ width: 2, height: 6, backgroundColor: "#D4766E33", margin: "0 auto" }} />
        <div style={{ margin: "0 14px 10px 56px", padding: "10px 12px", backgroundColor: "#150A0A", border: "1px solid #3D1F1F", borderRadius: 10, fontFamily: "-apple-system, sans-serif" }}>
          <TABadge text="⚑ CORRECTED" color="#D4766E" />
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "#D4766E" }}>
            Economy added 187,000 jobs — 13,000 below the 200,000 forecast. Unemployment held steady at 3.7%. "Freefall" and "crisis" are editorializing. The miss was within normal monthly variance.
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "#71767B", marginTop: 6 }}>
            The General Public · 11/13 · ✦ Consensus
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "body",
    pills: "✏️ Buried Numbers",
    label: "When the details quietly contradict the headline",
    layout: "columns",
    before: (
      <div style={{ padding: "18px 20px", backgroundColor: "#fff", borderRadius: 8, fontFamily: "Georgia, serif", height: "100%" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, paddingBottom: 7, borderBottom: "2px solid #222", fontFamily: "Helvetica, sans-serif" }}>
          Metro Chronicle
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.65, color: "#333" }}>
          The city's <span style={{ backgroundColor: "#FFF3CD", padding: "0 2px" }}>wildly popular</span> new transit line carried <span style={{ backgroundColor: "#FFF3CD", padding: "0 2px" }}>millions of riders</span> in its first year, built for <span style={{ backgroundColor: "#FFF3CD", padding: "0 2px" }}>a fraction of the projected cost</span>, officials announced at a press conference Tuesday.
        </div>
      </div>
    ),
    after: (
      <div style={{ padding: "18px 20px", backgroundColor: "#fff", borderRadius: 8, fontFamily: "Georgia, serif", height: "100%" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, paddingBottom: 7, borderBottom: "2px solid #222", fontFamily: "Helvetica, sans-serif" }}>
          Metro Chronicle
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.65, color: "#333" }}>
          The city's <span style={{ color: "#8B2D2D", borderBottom: "1.5px dotted #8B2D2D55" }}>below-projection</span> new transit line carried <span style={{ color: "#8B2D2D", borderBottom: "1.5px dotted #8B2D2D55" }}>1.2 million riders against a 3 million target</span> in its first year, built for <span style={{ color: "#8B2D2D", borderBottom: "1.5px dotted #8B2D2D55" }}>$2.1B vs. a $2.4B budget (12% under, not the 40% claimed)</span>, officials announced at a press conference Tuesday.
        </div>
      </div>
    ),
  },
  {
    id: "reddit",
    pills: "🔴 Viral Misinformation",
    label: "When a false post has 30,000 upvotes before anyone checks",
    layout: "stacked",
    before: (
      <div style={{ backgroundColor: "#1A1A1B", borderRadius: 8, fontFamily: "-apple-system, sans-serif", color: "#D7DADC", display: "flex" }}>
        <div style={{ width: 34, padding: "8px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, backgroundColor: "#161617", borderRadius: "8px 0 0 8px" }}>
          <span style={{ fontSize: 13, color: "#818384" }}>▲</span>
          <span style={{ fontSize: 10, fontWeight: 700 }}>31.4k</span>
          <span style={{ fontSize: 13, color: "#818384" }}>▼</span>
        </div>
        <div style={{ flex: 1, padding: "8px 12px" }}>
          <div style={{ fontSize: 10, color: "#818384", marginBottom: 3 }}>
            <span style={{ fontWeight: 700, color: "#D7DADC" }}>r/technology</span> · u/futurewatch · 3h
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3, marginBottom: 6 }}>
            Apple confirms all iPhones will require monthly subscription fee starting January 2027
          </div>
          <div style={{ display: "flex", gap: 14, color: "#818384", fontSize: 10, fontWeight: 700 }}>
            <span>💬 4,291</span><span>🔗 Share</span>
          </div>
        </div>
      </div>
    ),
    after: (
      <div style={{ borderRadius: 8, overflow: "hidden" }}>
        <div style={{ backgroundColor: "#1A1A1B", fontFamily: "-apple-system, sans-serif", color: "#D7DADC", display: "flex" }}>
          <div style={{ width: 34, padding: "8px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, backgroundColor: "#161617", borderRadius: "8px 0 0 0" }}>
            <span style={{ fontSize: 13, color: "#818384" }}>▲</span>
            <span style={{ fontSize: 10, fontWeight: 700 }}>31.4k</span>
            <span style={{ fontSize: 13, color: "#818384" }}>▼</span>
          </div>
          <div style={{ flex: 1, padding: "8px 12px" }}>
            <div style={{ fontSize: 10, color: "#818384", marginBottom: 3 }}>
              <span style={{ fontWeight: 700, color: "#D7DADC" }}>r/technology</span> · u/futurewatch · 3h
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3, marginBottom: 6 }}>
              Apple confirms all iPhones will require monthly subscription fee starting January 2027
            </div>
            <div style={{ display: "flex", gap: 14, color: "#818384", fontSize: 10, fontWeight: 700 }}>
              <span>💬 4,291</span><span>🔗 Share</span>
            </div>
          </div>
        </div>
        <div style={{ width: 2, height: 6, backgroundColor: "#D4766E33", margin: "0 auto" }} />
        <div style={{ margin: "0 8px 8px 42px", padding: "9px 11px", backgroundColor: "#150A0A", border: "1px solid #3D1F1F", borderRadius: 8, fontFamily: "-apple-system, sans-serif" }}>
          <TABadge text="⚑ CORRECTED" color="#D4766E" />
          <div style={{ fontSize: 12, lineHeight: 1.45, color: "#D4766E" }}>
            Apple announced an optional premium support tier, not a mandatory subscription. All existing iPhone functionality remains free. The source is a satire blog that was shared without context.
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "#818384", marginTop: 5 }}>
            Tech Accuracy · 9/9 jurors
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "affirm",
    pills: "✓ Good Reporting",
    label: "When a journalist gets it right and nobody notices",
    layout: "columns",
    before: (
      <div style={{ padding: "18px 20px", backgroundColor: "#fff", borderRadius: 8, height: "100%" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, paddingBottom: 7, borderBottom: "2px solid #222", fontFamily: "Helvetica, sans-serif" }}>
          The Independent Register
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3, color: "#1a1a1a", fontFamily: "Georgia, serif" }}>
          City Water Tests Reveal Lead Levels 4× Federal Limit in Three School Districts
        </div>
        <div style={{ fontSize: 12, color: "#777", marginTop: 10, lineHeight: 1.5, fontFamily: "Georgia, serif" }}>
          Testing data obtained through public records request. Reporter cross-referenced with EPA enforcement records and interviewed the lab that conducted the analysis.
        </div>
      </div>
    ),
    after: (
      <div style={{ padding: "18px 20px", backgroundColor: "#fff", borderRadius: 8, height: "100%" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, paddingBottom: 7, borderBottom: "2px solid #222", fontFamily: "Helvetica, sans-serif" }}>
          The Independent Register
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3, color: "#1B5E3F", fontFamily: "Georgia, serif" }}>
          City Water Tests Reveal Lead Levels 4× Federal Limit in Three School Districts
          <span style={{ marginLeft: 5 }}><Lh size={12} color="#1B5E3F" /></span>
        </div>
        <AttrLine label="✓ AFFIRMED" org="Local Watch Assembly" votes="7/7 jurors" color="#1B5E3F" />
        <div style={{ fontSize: 12, color: "#777", marginTop: 10, lineHeight: 1.5, fontFamily: "Georgia, serif" }}>
          Testing data obtained through public records request. Reporter cross-referenced with EPA enforcement records and interviewed the lab that conducted the analysis.
        </div>
      </div>
    ),
  },
];

export default function LandingHeroV2() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => { setIdx(i => (i + 1) % slides.length); setFading(false); }, 280);
    }, 8000);
    return () => clearInterval(t);
  }, [paused]);

  const goTo = i => { setFading(true); setTimeout(() => { setIdx(i); setFading(false); }, 180); };
  const s = slides[idx];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#fff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500;6..72,600;6..72,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes prog { from { width:0%; } to { width:100%; } }
      `}</style>

      {/* DARK BAND */}
      <div style={{ background: "linear-gradient(180deg, #1a1a1a 0%, #222 100%)", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <CrestIcon size={38} />
        <div>
          <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 600, fontSize: 18, color: "#F0EDE6", letterSpacing: "0.12em", lineHeight: 1 }}>
            <span style={{ fontSize: 25 }}>T</span>RUST<span style={{ letterSpacing: "0.22em" }}> </span><span style={{ fontSize: 25 }}>A</span>SSEMBLY
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 9, letterSpacing: "0.15em", color: "#B8963E", fontWeight: 600 }}>TRUTH WILL OUT.</span>
            <span style={{ backgroundColor: "#16A085", color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 8, fontWeight: 700 }}>BETA</span>
          </div>
        </div>
      </div>

      {/* HERO */}
      <div style={{ background: "linear-gradient(180deg, #0D0D0D 0%, #1B2A4A 100%)", padding: "40px 24px 40px", textAlign: "center", overflow: "hidden" }}>
        {/* Tagline — the only thing above the showcase */}
        <h1 style={{
          fontFamily: "'Newsreader', Georgia, serif", fontSize: 32, fontWeight: 400,
          color: "#F0EDE6", lineHeight: 1.3,
          maxWidth: 560, margin: "0 auto 28px",
          animation: "fadeUp 0.6s ease",
        }}>
          The internet's corrections layer.
        </h1>

        {/* Pills */}
        <div style={{ display: "flex", justifyContent: "center", gap: 5, marginBottom: 22, flexWrap: "wrap" }}
          onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          {slides.map((sl, i) => (
            <button key={sl.id} onClick={() => goTo(i)} style={{
              fontFamily: "-apple-system, sans-serif", fontSize: 11, fontWeight: idx === i ? 600 : 400,
              color: idx === i ? "#fff" : "#777",
              backgroundColor: idx === i ? "#ffffff12" : "transparent",
              border: `1px solid ${idx === i ? "#ffffff22" : "#ffffff0a"}`,
              borderRadius: 20, padding: "5px 12px", cursor: "pointer", transition: "all 0.2s",
            }}>
              {sl.pills}
            </button>
          ))}
        </div>

        {/* Slide label */}
        <div style={{
          fontFamily: "-apple-system, sans-serif", fontSize: 13, color: "#999",
          marginBottom: 14, fontStyle: "italic",
          opacity: fading ? 0 : 1, transition: "opacity 0.2s",
        }}>
          {s.label}
        </div>

        {/* CONTENT AREA */}
        <div style={{
          maxWidth: 740, margin: "0 auto",
          opacity: fading ? 0 : 1,
          transform: fading ? "translateY(5px)" : "translateY(0)",
          transition: "opacity 0.25s ease, transform 0.25s ease",
        }}
          onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        >
          {s.layout === "columns" ? (
            <>
              <div style={{ display: "flex", gap: 16, marginBottom: 6, padding: "0 4px" }}>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600, color: "#555", letterSpacing: "0.06em" }}>BEFORE</span>
                </div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600, color: "#B8963E", letterSpacing: "0.06em" }}>AFTER TRUST ASSEMBLY</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, minHeight: 200 }}>
                <div style={{ flex: 1, borderRadius: 10, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.3)", border: "1px solid #333", opacity: 0.55 }}>{s.before}</div>
                <div style={{ flex: 1, borderRadius: 10, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px #B8963E33", border: "1px solid #B8963E44" }}>{s.after}</div>
              </div>
            </>
          ) : (
            <>
              <div style={{ maxWidth: 520, margin: "0 auto" }}>
                <div style={{ textAlign: "left", marginBottom: 6 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600, color: "#555", letterSpacing: "0.06em" }}>BEFORE</span>
                </div>
                <div style={{ borderRadius: 10, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.25)", border: "1px solid #333", opacity: 0.55, marginBottom: 12 }}>{s.before}</div>
                <div style={{ textAlign: "left", marginBottom: 6 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600, color: "#B8963E", letterSpacing: "0.06em" }}>AFTER TRUST ASSEMBLY</span>
                </div>
                <div style={{ borderRadius: 10, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.25), 0 0 0 1px #B8963E33", border: "1px solid #B8963E44" }}>{s.after}</div>
              </div>
            </>
          )}
        </div>

        {/* Dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 20 }}>
          {slides.map((_, i) => (
            <div key={i} onClick={() => goTo(i)} style={{
              width: idx === i ? 24 : 8, height: 8, borderRadius: 4,
              backgroundColor: idx === i ? "#B8963E" : "#ffffff18",
              cursor: "pointer", transition: "all 0.3s", overflow: "hidden", position: "relative",
            }}>
              {idx === i && !paused && (
                <div style={{ position: "absolute", top: 0, left: 0, height: "100%", backgroundColor: "#D4B45E", borderRadius: 4, animation: "prog 8s linear" }} />
              )}
            </div>
          ))}
        </div>

        {/* Descriptive text — below the showcase, not above */}
        <div style={{
          maxWidth: 480, margin: "28px auto 0",
        }}>
          <p style={{
            fontFamily: "-apple-system, sans-serif",
            fontSize: 14.5, color: "#888", lineHeight: 1.65,
          }}>
            Community juries review headlines and claims across the web.
            Corrections appear right where the misinformation lives — in your browser,
            on every platform. No algorithm decides what's true. People do.
          </p>
        </div>

        {/* CTAs */}
        <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 12 }}>
          <button style={{
            fontFamily: "-apple-system, sans-serif", fontSize: 14, fontWeight: 600,
            color: "#1a1a1a", backgroundColor: "#B8963E",
            border: "none", borderRadius: 6, padding: "12px 28px", cursor: "pointer",
          }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "#D4B45E"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = "#B8963E"}
          >Install Extension</button>
          <button style={{
            fontFamily: "-apple-system, sans-serif", fontSize: 14, fontWeight: 500,
            color: "#ccc", backgroundColor: "transparent",
            border: "1px solid #444", borderRadius: 6, padding: "12px 28px", cursor: "pointer",
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#888"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#444"}
          >Join as Citizen</button>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div style={{ padding: "48px 24px", backgroundColor: "#fff", maxWidth: 660, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 24, fontWeight: 400, color: "#1a1a1a", textAlign: "center", marginBottom: 32 }}>
          How it works
        </h2>
        {[
          { n: "1", title: "Someone notices a misleading claim", desc: "A citizen submits a correction with evidence. An affirmation if the reporting is accurate. Both go through the same jury process." },
          { n: "2", title: "A random jury reviews it", desc: "Jurors are randomly drawn from the citizen's Assembly. They vote independently. The math rewards honesty and makes deception structurally irrational." },
          { n: "3", title: "Independent groups verify it", desc: "Approved corrections advance to juries from other Assemblies — people with different perspectives reviewing the same evidence. What survives both achieves Consensus." },
          { n: "4", title: "The correction appears in your browser", desc: "Misleading headlines turn red. Accurate reporting turns green. Correction cards appear in social feeds. The truth surfaces everywhere the original claim lives." },
        ].map((step, i) => (
          <div key={i} style={{ display: "flex", gap: 16, padding: "18px 0", borderBottom: i < 3 ? "1px solid #eee" : "none" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: "#1a1a1a", color: "#B8963E", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{step.n}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>{step.title}</div>
              <div style={{ fontSize: 13.5, color: "#777", lineHeight: 1.6 }}>{step.desc}</div>
            </div>
          </div>
        ))}

        <div style={{ textAlign: "center", marginTop: 40, padding: "32px 0", borderTop: "1px solid #eee" }}>
          <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 20, color: "#1a1a1a", marginBottom: 6 }}>
            The truth has a browser extension.
          </div>
          <div style={{ fontSize: 13, color: "#999", marginBottom: 20 }}>
            Free. Open. Jury-verified. No algorithm decides what's true.
          </div>
          <button style={{
            fontFamily: "-apple-system, sans-serif", fontSize: 14, fontWeight: 600,
            color: "#fff", backgroundColor: "#1a1a1a",
            border: "none", borderRadius: 6, padding: "12px 32px", cursor: "pointer",
          }}>Get Started</button>
        </div>
      </div>
    </div>
  );
}

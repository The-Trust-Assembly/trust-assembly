import { useState } from "react";

// ═══════════════════════════════════════
// TRUST ASSEMBLY — SITE HEADER REDESIGN
// Reference implementation for Claude Code
// ═══════════════════════════════════════

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

const SiteTitle = ({ size = "large" }) => {
  const base = size === "large" ? 18 : 14;
  const cap = size === "large" ? 25 : 19;
  return (
    <span style={{
      fontFamily: "'Newsreader', Georgia, serif",
      fontWeight: 600,
      fontSize: base,
      color: "#F0EDE6",
      letterSpacing: "0.12em",
      lineHeight: 1,
    }}>
      <span style={{ fontSize: cap }}>T</span>
      <span>RUST</span>
      <span style={{ letterSpacing: "0.22em" }}> </span>
      <span style={{ fontSize: cap }}>A</span>
      <span>SSEMBLY</span>
    </span>
  );
};

export default function SitePreview() {
  const [navRow1, setNavRow1] = useState("Record");
  const [navRow2, setNavRow2] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  const row1Items = ["Record", "Assemblies", "Submit", "Review"];
  const row2Items = ["Vaults", "Consensus", "Citizen", "Ledger", "Guide", "Rules", "About", "Vision"];

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f5f5",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
      onScroll={e => setScrolled(e.target.scrollTop > 10)}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500;6..72,600;6..72,700&family=EB+Garamond:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      {/* 
        ═══════════════════════════════
        DARK BAND — sticky on scroll
        ═══════════════════════════════ 
      */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "linear-gradient(180deg, #1a1a1a 0%, #222 100%)",
        padding: "14px 24px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <CrestIcon size={38} />
        <div>
          <SiteTitle />
          <div style={{
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <span style={{
              fontSize: 9,
              letterSpacing: "0.15em",
              color: "#B8963E",
              fontWeight: 600,
              fontFamily: "-apple-system, sans-serif",
            }}>
              TRUTH WILL OUT.
            </span>
            <span style={{
              backgroundColor: "#16A085",
              color: "#fff",
              padding: "1px 6px",
              borderRadius: 3,
              fontSize: 8,
              fontWeight: 700,
              fontFamily: "-apple-system, sans-serif",
              letterSpacing: "0.05em",
            }}>
              BETA
            </span>
          </div>
        </div>
      </div>

      {/* 
        ═══════════════════════════════
        NAV ROW 1 — primary workflow
        ═══════════════════════════════ 
      */}
      <div style={{
        backgroundColor: "#fff",
        padding: "0 24px",
        display: "flex",
        alignItems: "stretch",
        borderBottom: "1px solid #eee",
      }}>
        {row1Items.map(item => (
          <div
            key={item}
            onClick={() => { setNavRow1(item); setNavRow2(null); }}
            style={{
              padding: "10px 0",
              marginRight: 20,
              fontSize: 13.5,
              fontWeight: navRow1 === item ? 600 : 400,
              color: navRow1 === item ? "#1a1a1a" : "#999",
              borderBottom: navRow1 === item ? "2px solid #1a1a1a" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.12s",
            }}
          >
            {item}
          </div>
        ))}
      </div>

      {/* 
        ═══════════════════════════════
        NAV ROW 2 — reference pages
        ═══════════════════════════════ 
      */}
      <div style={{
        backgroundColor: "#fff",
        padding: "0 24px",
        display: "flex",
        alignItems: "stretch",
        borderBottom: "1px solid #eee",
        flexWrap: "wrap",
      }}>
        {row2Items.map(item => (
          <div
            key={item}
            onClick={() => { setNavRow2(item); setNavRow1(null); }}
            style={{
              padding: "8px 0",
              marginRight: 16,
              fontSize: 12,
              fontWeight: navRow2 === item ? 600 : 400,
              color: navRow2 === item ? "#1a1a1a" : "#bbb",
              borderBottom: navRow2 === item ? "2px solid #1a1a1a" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.12s",
            }}
          >
            {item}
          </div>
        ))}
      </div>

      {/* 
        ═══════════════════════════════
        USER BAR
        ═══════════════════════════════ 
      */}
      <div style={{
        backgroundColor: "#fff",
        padding: "8px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #eee",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>👑</span>
          <span style={{ fontSize: 13, color: "#333" }}>@The King of America ·</span>
          <span style={{
            fontSize: 10,
            color: "#666",
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: "2px 8px",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              backgroundColor: "#27AE60",
              display: "inline-block",
            }} />
            APPRENTICE · 100.4
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 16, cursor: "pointer", opacity: 0.5 }}>🔔</span>
          <span style={{ fontSize: 12, color: "#999", cursor: "pointer" }}>Sign Out</span>
        </div>
      </div>

      {/* 
        ═══════════════════════════════
        CONTENT AREA — sample Assembly Record
        ═══════════════════════════════ 
      */}
      <div style={{
        backgroundColor: "#fff",
        maxWidth: 800,
        margin: "0 auto",
        padding: "24px",
        minHeight: 500,
      }}>
        {/* User count */}
        <div style={{ textAlign: "center", padding: "20px 0 16px" }}>
          <div style={{
            fontSize: 48,
            fontWeight: 700,
            color: "#1a1a1a",
            lineHeight: 1,
          }}>
            20
          </div>
          <div style={{
            fontSize: 11,
            letterSpacing: "0.15em",
            color: "#999",
            marginTop: 6,
            fontWeight: 500,
          }}>
            DIGITAL CITIZENS REGISTERED
          </div>
        </div>

        {/* Wild West notice */}
        <div style={{
          margin: "16px auto",
          maxWidth: 520,
          padding: "16px 20px",
          backgroundColor: "#FDF8E8",
          border: "2px solid #E8A838",
          borderRadius: 6,
          textAlign: "center",
        }}>
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#C0792A",
            letterSpacing: "0.05em",
            marginBottom: 8,
          }}>
            WILD WEST RULES IN EFFECT UNTIL THE SYSTEM HAS 100 USERS
          </div>
          <div style={{ fontSize: 13, color: "#8B6B3E", lineHeight: 1.6, textAlign: "left" }}>
            1. Your submissions only require one random reviewer
            <br />
            2. Findings of deliberate deception are disabled
          </div>
        </div>

        {/* Progress notes */}
        <div style={{
          padding: "16px 0",
          maxWidth: 520,
          margin: "0 auto",
          fontSize: 13,
          color: "#999",
          lineHeight: 1.8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#ddd" }} />
            Advanced Jury Selection Rules activate for assemblies with 100+ citizens
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#B8963E" }} />
            Consensus Juries activate with 5+ assemblies of 100+ citizens (0/5)
          </div>
        </div>

        {/* Section header */}
        <div style={{
          borderTop: "1px solid #eee",
          paddingTop: 20,
          marginTop: 16,
        }}>
          <h2 style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#1a1a1a",
            marginBottom: 16,
          }}>
            Assembly Record
          </h2>

          {/* Admin bar */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            border: "1px solid #eee",
            borderRadius: 6,
            marginBottom: 16,
          }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#C0392B",
              letterSpacing: "0.04em",
            }}>
              ADMIN
            </span>
            <button style={{
              backgroundColor: "#E67E22",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}>
              Approve All Pending Submissions
            </button>
          </div>

          {/* Sample submission */}
          <div style={{
            padding: "12px 14px",
            borderLeft: "3px solid #C0392B",
            borderRadius: "0 6px 6px 0",
            backgroundColor: "#fafafa",
            marginBottom: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 13 }}>👑</span>
              <span style={{ fontSize: 13, color: "#2980B9", fontWeight: 500 }}>@thekingofamerica</span>
              <span style={{ fontSize: 12, color: "#bbb" }}>· The General Public · 9h</span>
              <span style={{ flex: 1 }} />
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#C0392B",
                backgroundColor: "#C0392B10",
                padding: "2px 8px",
                borderRadius: 3,
              }}>
                REJECTED
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#2980B9", wordBreak: "break-all", lineHeight: 1.4 }}>
              https://www.nytimes.com/2026/03/11/us/politics/iran-school-missile-strike.html
            </div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 6, lineHeight: 1.4 }}>
              U.S. and Iran Battled in School in Iran, Preliminary Inquiry Says
            </div>
          </div>

          {/* Another sample */}
          <div style={{
            padding: "12px 14px",
            borderLeft: "3px solid #27AE60",
            borderRadius: "0 6px 6px 0",
            backgroundColor: "#fafafa",
            marginBottom: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "#2980B9", fontWeight: 500 }}>@factchecker_pnw</span>
              <span style={{ fontSize: 12, color: "#bbb" }}>· Science Watch · 2d</span>
              <span style={{ flex: 1 }} />
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#27AE60",
                backgroundColor: "#27AE6010",
                padding: "2px 8px",
                borderRadius: 3,
              }}>
                APPROVED
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#666", lineHeight: 1.4 }}>
              Study finds microplastic concentrations in deep ocean sediment have increased 12-fold since 1990
            </div>
          </div>
        </div>
      </div>

      {/* Spacer for scroll testing */}
      <div style={{ height: 200 }} />

      {/* 
        ═══════════════════════════════
        IMPLEMENTATION NOTES (visible in preview, not in production)
        ═══════════════════════════════ 
      */}
      <div style={{
        maxWidth: 700,
        margin: "0 auto",
        padding: "20px 24px 40px",
      }}>
        <div style={{
          padding: "20px",
          backgroundColor: "#FDFBF5",
          borderRadius: 8,
          border: "1px solid #EDE8DC",
        }}>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10, fontWeight: 600, color: "#1a1a1a",
            textTransform: "uppercase", letterSpacing: "0.08em",
            marginBottom: 12,
          }}>
            Implementation Notes for Claude Code
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "#555" }}>
            <div style={{ marginBottom: 8 }}>
              <strong>Dark band:</strong> background <code style={{ fontSize: 11, backgroundColor: "#eee", padding: "1px 4px", borderRadius: 2 }}>linear-gradient(180deg, #1a1a1a, #222)</code>, position sticky, top 0, z-index 100.
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Title:</strong> "TRUST ASSEMBLY" — all caps, Newsreader 600, letter-spacing 0.12em.
              The T and A are wrapped in <code style={{ fontSize: 11, backgroundColor: "#eee", padding: "1px 4px", borderRadius: 2 }}>&lt;span class="cap"&gt;</code> at font-size 1.35em. Same baseline, same weight.
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Crest:</strong> renders directly on the dark background — no container box.
              Gold (#B8963E) on dark.
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Nav rows:</strong> white background, bottom-border underline for active state,
              2px solid #1a1a1a. Row 1 is 13.5px, row 2 is 12px. No gap between rows.
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>User bar:</strong> white, 1px solid #eee bottom border. Rank badge is a small
              outlined pill. Bell icon and Sign Out on the right.
            </div>
            <div>
              <strong>Only the dark band is sticky.</strong> Nav rows and user bar scroll away
              to maximize content space.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

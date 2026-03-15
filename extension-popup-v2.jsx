import { useState } from "react";

// ═══════════════════════════════════════════════════════════
// TRUST ASSEMBLY — BROWSER EXTENSION POPUP v2
// Full submission experience, context-aware, accordion UI
// ═══════════════════════════════════════════════════════════

const CrestIcon = ({ size = 30 }) => (
  <div style={{ width: size, height: size, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #B8963E33", borderRadius: 3, backgroundColor: "#111" }}>
    <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 24 24" fill="none">
      <path d="M12 3L17 5.5V11C17 14.8 14.2 18.2 12 19.3C9.8 18.2 7 14.8 7 11V5.5L12 3Z" stroke="#B8963E" strokeWidth="0.8" fill="none"/>
      <path d="M12 2L14 8H10L12 2Z" fill="#B8963E" opacity="0.9"/>
      <rect x="10" y="8" width="4" height="10" rx="0.3" fill="#B8963E" opacity="0.8"/>
      <path d="M7 18H17L18 22H6L7 18Z" fill="#B8963E" opacity="0.7"/>
    </svg>
  </div>
);

const Lh = ({ size = 12, color = "#B8963E" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
    <path d="M12 2L14 8H10L12 2Z" fill={color} opacity="0.9"/>
    <rect x="10" y="8" width="4" height="10" rx="0.5" fill={color} opacity="0.8"/>
    <path d="M7 18H17L18 22H6L7 18Z" fill={color} opacity="0.7"/>
  </svg>
);

// ── Constants ──
const CORR = "#C0392B";
const AFF = "#27AE60";
const CONS = "#D4850A";
const DIM = "#aaa";
const LINE = "#eee";
const MONO = "'IBM Plex Mono', 'SF Mono', 'Consolas', monospace";
const BODY = "'Newsreader', Georgia, serif";
const SYS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ── Reusable components ──

const SectionAccordion = ({ title, icon, count, open, onToggle, children, color = "#1a1a1a" }) => (
  <div style={{ borderBottom: `1px solid ${LINE}` }}>
    <div
      onClick={onToggle}
      style={{
        padding: "9px 14px",
        display: "flex", alignItems: "center", gap: 7,
        cursor: "pointer",
        backgroundColor: open ? "#fafafa" : "#fff",
        transition: "background-color 0.1s",
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color, flex: 1 }}>{title}</span>
      {count > 0 && (
        <span style={{
          fontSize: 9, fontWeight: 700, color: "#fff",
          backgroundColor: color === "#1a1a1a" ? "#1a1a1a" : color,
          borderRadius: 8, padding: "1px 6px",
          fontFamily: MONO,
        }}>
          {count}
        </span>
      )}
      <span style={{ fontSize: 10, color: DIM, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
        ▼
      </span>
    </div>
    {open && (
      <div style={{ padding: "8px 14px 12px", backgroundColor: "#fafafa", borderTop: `1px solid ${LINE}` }}>
        {children}
      </div>
    )}
  </div>
);

const FieldLabel = ({ children }) => (
  <div style={{ fontSize: 11, color: "#888", marginBottom: 3, fontFamily: SYS }}>{children}</div>
);

const TextInput = ({ placeholder, value, onChange, mono = false, disabled = false, small = false }) => (
  <div style={{
    padding: small ? "5px 8px" : "7px 10px",
    backgroundColor: disabled ? "#f5f5f5" : "#fff",
    borderRadius: 4, border: `1px solid ${LINE}`,
    fontSize: small ? 11 : 12.5,
    color: disabled ? DIM : "#1a1a1a",
    fontFamily: mono ? MONO : BODY,
  }}>
    {value || <span style={{ color: "#ccc" }}>{placeholder}</span>}
  </div>
);

const TextArea = ({ placeholder, rows = 2 }) => (
  <textarea
    style={{
      width: "100%", padding: "7px 10px",
      backgroundColor: "#fff", border: `1px solid ${LINE}`,
      borderRadius: 4, fontSize: 12.5, fontFamily: BODY,
      resize: "vertical", minHeight: rows * 20 + 14,
      lineHeight: 1.4, color: "#1a1a1a",
      outline: "none", boxSizing: "border-box",
    }}
    placeholder={placeholder}
  />
);

const AddButton = ({ label, onClick }) => (
  <div
    onClick={onClick}
    style={{
      padding: "5px 0", fontSize: 11, color: "#999",
      cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
      fontFamily: SYS,
    }}
    onMouseEnter={e => e.currentTarget.style.color = "#1a1a1a"}
    onMouseLeave={e => e.currentTarget.style.color = "#999"}
  >
    <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> {label}
  </div>
);

const InlineEditRow = ({ index, onRemove }) => {
  const [displayMode, setDisplayMode] = useState("replace"); // replace | strikethrough
  return (
    <div style={{
      padding: "8px 10px", backgroundColor: "#fff",
      borderRadius: 4, border: `1px solid ${LINE}`, marginBottom: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: DIM, fontFamily: MONO }}>EDIT #{index + 1}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Display mode toggle */}
          <div style={{ display: "flex", gap: 0, border: `1px solid ${LINE}`, borderRadius: 3, overflow: "hidden" }}>
            <div
              onClick={() => setDisplayMode("replace")}
              style={{
                padding: "2px 6px", fontSize: 9, cursor: "pointer",
                backgroundColor: displayMode === "replace" ? "#1a1a1a" : "#fff",
                color: displayMode === "replace" ? "#fff" : "#999",
                fontFamily: MONO, fontWeight: 600,
              }}
            >
              Replace
            </div>
            <div
              onClick={() => setDisplayMode("strikethrough")}
              style={{
                padding: "2px 6px", fontSize: 9, cursor: "pointer",
                backgroundColor: displayMode === "strikethrough" ? "#1a1a1a" : "#fff",
                color: displayMode === "strikethrough" ? "#fff" : "#999",
                fontFamily: MONO, fontWeight: 600,
                borderLeft: `1px solid ${LINE}`,
              }}
            >
              Strike
            </div>
          </div>
          <span
            onClick={onRemove}
            style={{ fontSize: 12, color: "#ccc", cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </span>
        </div>
      </div>
      <div style={{ marginBottom: 4 }}>
        <TextArea placeholder="Original text from the article..." rows={1} />
      </div>
      <div>
        <TextArea placeholder="Corrected text..." rows={1} />
      </div>
    </div>
  );
};

const VaultEntry = ({ type, onRemove }) => {
  const configs = {
    vault: { icon: "🏛", label: "Standing Correction", fields: ["assertion", "evidence"] },
    argument: { icon: "⚔️", label: "Argument", fields: ["content"] },
    belief: { icon: "🧭", label: "Foundational Belief", fields: ["content"] },
    translation: { icon: "🔄", label: "Translation", fields: ["original", "translated", "type"] },
  };
  const cfg = configs[type];

  return (
    <div style={{
      padding: "8px 10px", backgroundColor: "#fff",
      borderRadius: 4, border: `1px solid ${LINE}`, marginBottom: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: DIM, fontFamily: MONO }}>
          {cfg.icon} {cfg.label.toUpperCase()}
        </span>
        <span onClick={onRemove} style={{ fontSize: 12, color: "#ccc", cursor: "pointer" }}>×</span>
      </div>
      {cfg.fields.includes("assertion") && (
        <div style={{ marginBottom: 4 }}>
          <TextArea placeholder="Assertion — the reusable factual claim..." rows={1} />
        </div>
      )}
      {cfg.fields.includes("evidence") && (
        <TextArea placeholder="Evidence supporting this assertion..." rows={1} />
      )}
      {cfg.fields.includes("content") && (
        <TextArea placeholder={`${cfg.label} content...`} rows={2} />
      )}
      {cfg.fields.includes("original") && (
        <div style={{ marginBottom: 4 }}>
          <TextArea placeholder="Original text (e.g. 'enhanced interrogation')..." rows={1} />
        </div>
      )}
      {cfg.fields.includes("translated") && (
        <div style={{ marginBottom: 4 }}>
          <TextArea placeholder="Plain language version (e.g. 'torture')..." rows={1} />
        </div>
      )}
      {cfg.fields.includes("type") && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {["Clarity", "Anti-Propaganda", "Euphemism", "Satirical"].map(t => (
            <div key={t} style={{
              padding: "2px 8px", fontSize: 9, borderRadius: 3,
              border: `1px solid ${LINE}`, color: "#999",
              cursor: "pointer", fontFamily: MONO,
            }}>
              {t}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Sample data ──

const corrections = [
  { type: "correction", status: "consensus", original: "Common Grocery Item Linked to 300% Surge in Cancer Risk", replacement: "Preliminary Lab Study of 12 Mice Finds Cell Changes Not Replicated in Humans", org: "Science Watch", votes: "9/9", score: 94 },
  { type: "correction", status: "approved", original: "Economy in FREEFALL as Jobs Report Misses", replacement: "Economy added 187K jobs, 13K below forecast. Unemployment steady at 3.7%.", org: "The General Public", votes: "11/13", score: 87 },
  { type: "affirmation", status: "approved", original: "City Water Tests Reveal Lead Levels 4× Federal Limit in Three School Districts", org: "Local Watch", votes: "7/7", score: 91 },
];

const juryItems = [
  { id: "j1", headline: "Study claims 40% drop in bee populations linked to single pesticide", org: "Science Watch", progress: "3 of 7", type: "correction" },
  { id: "j2", headline: "Mayor announces zero-emission mandate for all city vehicles by 2027", org: "Local Watch", progress: "1 of 5", type: "correction" },
];

// ═══════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════

export default function ExtensionPopupV2() {
  const [tab, setTab] = useState("page");
  const [loggedIn, setLoggedIn] = useState(true);
  const [notifCount] = useState(2);

  // Submit state
  const [submitType, setSubmitType] = useState("correction");
  const [platform] = useState("article"); // article | twitter | reddit | youtube | facebook
  const [openSections, setOpenSections] = useState({ headline: true, inline: false, vault: false, assemblies: false });
  const [inlineEdits, setInlineEdits] = useState([{ id: 1 }]);
  const [vaultEntries, setVaultEntries] = useState([]);
  const [selectedAssemblies, setSelectedAssemblies] = useState(["general"]);
  const [showVaultPicker, setShowVaultPicker] = useState(false);

  // Review state
  const [expandedReview, setExpandedReview] = useState(null);

  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const isSocial = ["twitter", "reddit", "youtube", "facebook"].includes(platform);

  // ── Login screen ──
  if (!loggedIn) {
    return (
      <div style={{ width: 380, height: 560, backgroundColor: "#fff", display: "flex", flexDirection: "column", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500;6..72,600;6..72,700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');`}</style>
        <div style={{ background: "linear-gradient(180deg, #1a1a1a 0%, #222 100%)", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <CrestIcon size={30} />
          <div>
            <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 15, color: "#F0EDE6", letterSpacing: "0.1em", lineHeight: 1 }}>
              <span style={{ fontSize: 20 }}>T</span>RUST<span style={{ letterSpacing: "0.2em" }}> </span><span style={{ fontSize: 20 }}>A</span>SSEMBLY
            </div>
            <div style={{ fontSize: 8.5, letterSpacing: "0.12em", color: "#B8963E", fontWeight: 500, fontFamily: SYS, marginTop: 2 }}>TRUTH WILL OUT</div>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px" }}>
          <Lh size={32} color="#B8963E" />
          <div style={{ fontFamily: BODY, fontSize: 18, color: "#1a1a1a", marginTop: 12, marginBottom: 20 }}>Sign in to continue</div>
          <div style={{ width: "100%", marginBottom: 10 }}>
            <FieldLabel>Username or email</FieldLabel>
            <input type="text" style={{ width: "100%", padding: "8px 10px", border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 13, fontFamily: SYS, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ width: "100%", marginBottom: 16 }}>
            <FieldLabel>Password</FieldLabel>
            <input type="password" style={{ width: "100%", padding: "8px 10px", border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 13, fontFamily: SYS, outline: "none", boxSizing: "border-box" }} />
          </div>
          <button onClick={() => setLoggedIn(true)} style={{ width: "100%", padding: "10px", backgroundColor: "#1a1a1a", color: "#fff", border: "none", borderRadius: 4, fontSize: 12, fontFamily: MONO, fontWeight: 600, cursor: "pointer" }}>
            Sign In
          </button>
          <div style={{ fontSize: 11, color: "#999", marginTop: 12 }}>
            No account? <span style={{ color: "#1a1a1a", fontWeight: 600, cursor: "pointer" }}>Register at trustassembly.org</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: 380, height: 560, backgroundColor: "#fff", fontFamily: SYS, color: "#1a1a1a",
      display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 8,
      boxShadow: "0 4px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500;6..72,600;6..72,700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 2px; }
        textarea:focus, input:focus { outline: none; border-color: #B8963E !important; }
      `}</style>

      {/* ═══ DARK BAND HEADER ═══ */}
      <div style={{
        padding: "10px 14px",
        display: "flex", alignItems: "center", gap: 10,
        background: "linear-gradient(180deg, #1a1a1a 0%, #222 100%)",
        flexShrink: 0,
      }}>
        <CrestIcon size={28} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 14, color: "#F0EDE6", letterSpacing: "0.1em", lineHeight: 1 }}>
            <span style={{ fontSize: 19 }}>T</span>RUST<span style={{ letterSpacing: "0.2em" }}> </span><span style={{ fontSize: 19 }}>A</span>SSEMBLY
          </div>
          <div style={{ fontSize: 8, letterSpacing: "0.12em", color: "#B8963E", fontWeight: 500, fontFamily: SYS, marginTop: 2 }}>TRUTH WILL OUT</div>
        </div>
        {/* Notification bell — always visible */}
        <div style={{ position: "relative", cursor: "pointer", padding: 4 }}>
          <span style={{ fontSize: 15, opacity: 0.6 }}>🔔</span>
          {notifCount > 0 && (
            <span style={{
              position: "absolute", top: 0, right: 0,
              width: 14, height: 14, borderRadius: "50%",
              backgroundColor: CONS, color: "#fff",
              fontSize: 8, fontWeight: 700, fontFamily: MONO,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {notifCount}
            </span>
          )}
        </div>
        {/* Pop-out button */}
        <div style={{ cursor: "pointer", padding: 4 }} title="Pop out window">
          <span style={{ fontSize: 13, color: "#666" }}>⧉</span>
        </div>
      </div>

      {/* ═══ TABS — This Page, Submit, Review ═══ */}
      <div style={{
        display: "flex", padding: "0 14px",
        borderBottom: `1px solid ${LINE}`, flexShrink: 0,
      }}>
        {[
          { key: "page", label: "This Page" },
          { key: "submit", label: "Submit" },
          { key: "review", label: "Review" },
        ].map(item => (
          <div
            key={item.key}
            onClick={() => setTab(item.key)}
            style={{
              padding: "9px 0", marginRight: 18, fontSize: 12.5,
              fontWeight: tab === item.key ? 600 : 400,
              color: tab === item.key ? "#1a1a1a" : "#999",
              borderBottom: tab === item.key ? "2px solid #1a1a1a" : "2px solid transparent",
              cursor: "pointer", transition: "all 0.12s",
            }}
          >
            {item.label}
          </div>
        ))}
      </div>

      {/* ═══ CONTENT ═══ */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ════════════════════════════
            THIS PAGE TAB
            ════════════════════════════ */}
        {tab === "page" && (
          <div>
            {/* Stats */}
            <div style={{ display: "flex", padding: "10px 16px", borderBottom: `1px solid ${LINE}`, backgroundColor: "#fafafa" }}>
              {[
                { n: "2", label: "Corrections", color: CORR },
                { n: "1", label: "Affirmed", color: AFF },
                { n: "1", label: "Consensus", color: CONS },
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1, fontFamily: BODY }}>{s.n}</div>
                  <div style={{ fontSize: 9, color: DIM, fontFamily: MONO, marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {corrections.map((c, i) => {
              const isAff = c.type === "affirmation";
              const isCons = c.status === "consensus";
              const accent = isCons ? CONS : isAff ? AFF : CORR;
              return (
                <div key={i} style={{ padding: "11px 16px", borderBottom: `1px solid ${LINE}`, borderLeft: `3px solid ${accent}`, cursor: "pointer", transition: "background-color 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "#fafafa"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: accent, fontFamily: MONO }}>{isCons ? "✦ Consensus" : isAff ? "✓ Affirmed" : "Corrected"}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 9.5, color: DIM, fontFamily: MONO }}>{c.org} · {c.votes}</span>
                  </div>
                  {!isAff && <div style={{ fontSize: 13, lineHeight: 1.4, color: "#1a1a1a", fontFamily: BODY }}>{c.replacement}</div>}
                  {!isAff && <div style={{ fontSize: 11, color: DIM, textDecoration: "line-through", textDecorationColor: DIM + "44", marginTop: 3, fontFamily: BODY }}>{c.original}</div>}
                  {isAff && <div style={{ fontSize: 12.5, lineHeight: 1.4, color: "#555", fontFamily: BODY }}>{c.original}</div>}
                </div>
              );
            })}
            <div style={{ padding: "12px 16px", textAlign: "center" }}>
              <a href="#" onClick={e => e.preventDefault()} style={{ fontSize: 11, color: "#999", textDecoration: "none", fontFamily: MONO }}>Open trustassembly.org →</a>
            </div>
          </div>
        )}

        {/* ════════════════════════════
            SUBMIT TAB — The big one
            ════════════════════════════ */}
        {tab === "submit" && (
          <div>
            {/* Context bar — shows current page and detected platform */}
            <div style={{
              padding: "8px 14px",
              backgroundColor: "#f8f8f8", borderBottom: `1px solid ${LINE}`,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ fontSize: 11 }}>{isSocial ? "𝕏" : "📰"}</span>
              <span style={{ fontSize: 10, color: DIM, fontFamily: MONO, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                washingtontribune.com/politics/spending-bill
              </span>
              {/* Draft saved indicator */}
              <span style={{ fontSize: 9, color: AFF, fontFamily: MONO, display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: AFF, opacity: 0.6 }} />
                Saved
              </span>
            </div>

            {/* Type toggle */}
            <div style={{ padding: "8px 14px", borderBottom: `1px solid ${LINE}` }}>
              <div style={{ display: "flex", gap: 6 }}>
                <div onClick={() => setSubmitType("correction")} style={{
                  flex: 1, textAlign: "center", padding: "6px 0",
                  backgroundColor: submitType === "correction" ? "#1a1a1a" : "#fff",
                  color: submitType === "correction" ? "#fff" : "#999",
                  border: `1px solid ${submitType === "correction" ? "#1a1a1a" : LINE}`,
                  borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>
                  Correction
                </div>
                <div onClick={() => setSubmitType("affirmation")} style={{
                  flex: 1, textAlign: "center", padding: "6px 0",
                  backgroundColor: submitType === "affirmation" ? "#1a1a1a" : "#fff",
                  color: submitType === "affirmation" ? "#fff" : "#999",
                  border: `1px solid ${submitType === "affirmation" ? "#1a1a1a" : LINE}`,
                  borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>
                  Affirmation
                </div>
              </div>
            </div>

            {/* ── HEADLINE SECTION (default open) ── */}
            <SectionAccordion
              title={isSocial ? "Post Content" : "Headline"}
              icon={isSocial ? "💬" : "📰"}
              count={0}
              open={openSections.headline}
              onToggle={() => toggleSection("headline")}
            >
              <div style={{ marginBottom: 8 }}>
                <FieldLabel>{isSocial ? "Original post text" : "Original headline"}</FieldLabel>
                <TextArea placeholder={isSocial ? "Paste the post text as it appears..." : "Paste the headline as published..."} rows={2} />
              </div>
              {submitType === "correction" && (
                <div style={{ marginBottom: 8 }}>
                  <FieldLabel>{isSocial ? "Corrected version" : "Replacement headline"}</FieldLabel>
                  <TextArea placeholder="The factually accurate version..." rows={2} />
                </div>
              )}
              <div style={{ marginBottom: 4 }}>
                <FieldLabel>Reasoning</FieldLabel>
                <TextArea placeholder="Why is the original misleading? Cite evidence..." rows={3} />
              </div>
              <div>
                <FieldLabel>Author (optional)</FieldLabel>
                <TextInput placeholder="Article or post author" />
              </div>
            </SectionAccordion>

            {/* ── INLINE EDITS SECTION ── */}
            {!isSocial && (
              <SectionAccordion
                title="Body Text Corrections"
                icon="✏️"
                count={inlineEdits.length}
                open={openSections.inline}
                onToggle={() => toggleSection("inline")}
              >
                <div style={{ fontSize: 10, color: DIM, marginBottom: 8, lineHeight: 1.4 }}>
                  Correct specific claims in the article body. Choose whether each edit replaces the text or shows as a strikethrough with the correction alongside. Up to 20 edits.
                </div>
                {inlineEdits.map((edit, i) => (
                  <InlineEditRow
                    key={edit.id}
                    index={i}
                    onRemove={() => setInlineEdits(prev => prev.filter(e => e.id !== edit.id))}
                  />
                ))}
                {inlineEdits.length < 20 && (
                  <AddButton
                    label={`Add inline edit (${inlineEdits.length}/20)`}
                    onClick={() => setInlineEdits(prev => [...prev, { id: Date.now() }])}
                  />
                )}
              </SectionAccordion>
            )}

            {/* ── EVIDENCE SECTION ── */}
            <SectionAccordion
              title="Evidence Links"
              icon="🔗"
              count={0}
              open={openSections.evidence}
              onToggle={() => toggleSection("evidence")}
            >
              <div style={{
                padding: "8px 10px", backgroundColor: "#fff",
                borderRadius: 4, border: `1px solid ${LINE}`, marginBottom: 6,
              }}>
                <div style={{ marginBottom: 4 }}>
                  <TextArea placeholder="Evidence URL..." rows={1} />
                </div>
                <TextArea placeholder="Why this evidence matters..." rows={1} />
              </div>
              <AddButton label="Add another evidence link" />
            </SectionAccordion>

            {/* ── VAULT ARTIFACTS SECTION ── */}
            <SectionAccordion
              title="Vault Artifacts"
              icon="🏛"
              count={vaultEntries.length}
              open={openSections.vault}
              onToggle={() => toggleSection("vault")}
            >
              <div style={{ fontSize: 10, color: DIM, marginBottom: 8, lineHeight: 1.4 }}>
                Attach or create vault entries that support this submission. Pending entries graduate to approved when the submission passes review.
              </div>

              {vaultEntries.map((entry, i) => (
                <VaultEntry
                  key={entry.id}
                  type={entry.type}
                  onRemove={() => setVaultEntries(prev => prev.filter(e => e.id !== entry.id))}
                />
              ))}

              {/* Vault type picker */}
              {showVaultPicker ? (
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4,
                  marginTop: 4,
                }}>
                  {[
                    { type: "vault", icon: "🏛", label: "Standing Correction" },
                    { type: "argument", icon: "⚔️", label: "Argument" },
                    { type: "belief", icon: "🧭", label: "Belief" },
                    { type: "translation", icon: "🔄", label: "Translation" },
                  ].map(v => (
                    <div
                      key={v.type}
                      onClick={() => {
                        setVaultEntries(prev => [...prev, { id: Date.now(), type: v.type }]);
                        setShowVaultPicker(false);
                      }}
                      style={{
                        padding: "6px 8px", backgroundColor: "#fff",
                        border: `1px solid ${LINE}`, borderRadius: 4,
                        fontSize: 10, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 4,
                        transition: "border-color 0.1s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "#999"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = LINE}
                    >
                      <span>{v.icon}</span> {v.label}
                    </div>
                  ))}
                </div>
              ) : (
                <AddButton label="Add vault artifact" onClick={() => setShowVaultPicker(true)} />
              )}
            </SectionAccordion>

            {/* ── ASSEMBLIES SECTION ── */}
            <SectionAccordion
              title="Submit to Assemblies"
              icon="🏘"
              count={selectedAssemblies.length}
              open={openSections.assemblies}
              onToggle={() => toggleSection("assemblies")}
            >
              <div style={{ fontSize: 10, color: DIM, marginBottom: 8 }}>
                Select one or more assemblies. You must be a member of each.
              </div>
              {[
                { id: "general", name: "The General Public", members: 20 },
                { id: "science", name: "Science Watch", members: 8 },
                { id: "local", name: "Local Watch", members: 5 },
              ].map(org => {
                const selected = selectedAssemblies.includes(org.id);
                return (
                  <div
                    key={org.id}
                    onClick={() => {
                      setSelectedAssemblies(prev =>
                        selected ? prev.filter(id => id !== org.id) : [...prev, org.id]
                      );
                    }}
                    style={{
                      padding: "7px 10px", marginBottom: 4,
                      backgroundColor: selected ? "#1a1a1a08" : "#fff",
                      border: `1px solid ${selected ? "#1a1a1a44" : LINE}`,
                      borderRadius: 4, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8,
                      transition: "all 0.1s",
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: 3,
                      border: `2px solid ${selected ? "#1a1a1a" : "#ddd"}`,
                      backgroundColor: selected ? "#1a1a1a" : "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.1s",
                    }}>
                      {selected && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: selected ? 600 : 400, flex: 1 }}>{org.name}</span>
                    <span style={{ fontSize: 9, color: DIM, fontFamily: MONO }}>{org.members} members</span>
                  </div>
                );
              })}
            </SectionAccordion>

            {/* Submit button */}
            <div style={{ padding: "12px 14px", borderTop: `1px solid ${LINE}` }}>
              <button style={{
                width: "100%", padding: "10px",
                backgroundColor: "#1a1a1a", color: "#fff",
                border: "none", borderRadius: 4,
                fontSize: 12, fontFamily: MONO,
                fontWeight: 600, letterSpacing: "0.03em", cursor: "pointer",
              }}>
                Submit to {selectedAssemblies.length} {selectedAssemblies.length === 1 ? "Assembly" : "Assemblies"}
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════
            REVIEW TAB
            ════════════════════════════ */}
        {tab === "review" && (
          <div style={{ padding: "0" }}>
            <div style={{
              padding: "10px 14px",
              fontSize: 10, color: DIM, fontFamily: MONO,
              letterSpacing: "0.04em", textTransform: "uppercase",
              borderBottom: `1px solid ${LINE}`,
              backgroundColor: "#fafafa",
            }}>
              {juryItems.length} submissions awaiting your review
            </div>

            {juryItems.map((item) => (
              <div key={item.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                <div style={{ padding: "11px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 600, color: CORR,
                      fontFamily: MONO, letterSpacing: "0.02em",
                    }}>
                      {item.type === "correction" ? "CORRECTION" : "AFFIRMATION"}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 9, color: DIM, fontFamily: MONO }}>{item.org} · {item.progress}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.4, color: "#1a1a1a", fontFamily: BODY, marginBottom: 8 }}>
                    "{item.headline}"
                  </div>

                  {/* Action buttons — expand OR go to site */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => setExpandedReview(expandedReview === item.id ? null : item.id)}
                      style={{
                        flex: 1, padding: "5px 0",
                        backgroundColor: expandedReview === item.id ? "#f0f0f0" : "#fff",
                        border: `1px solid ${LINE}`, borderRadius: 4,
                        fontSize: 10, fontFamily: MONO, fontWeight: 600,
                        cursor: "pointer", color: "#1a1a1a",
                      }}
                    >
                      {expandedReview === item.id ? "▾ Collapse" : "▸ Review Here"}
                    </button>
                    <a href="#" onClick={e => e.preventDefault()} style={{
                      flex: 1, padding: "5px 0",
                      backgroundColor: "#1a1a1a",
                      border: "none", borderRadius: 4,
                      fontSize: 10, fontFamily: MONO, fontWeight: 600,
                      cursor: "pointer", color: "#fff",
                      textDecoration: "none", textAlign: "center",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      Open on Site →
                    </a>
                  </div>
                </div>

                {/* Expanded review panel */}
                {expandedReview === item.id && (
                  <div style={{
                    padding: "12px 14px", backgroundColor: "#fafafa",
                    borderTop: `1px solid ${LINE}`,
                  }}>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9, color: DIM, fontFamily: MONO, textTransform: "uppercase", marginBottom: 3 }}>Reasoning provided</div>
                      <div style={{ fontSize: 12, lineHeight: 1.5, color: "#555", fontFamily: BODY }}>
                        The study only examined 40 hive colonies in a single county over 3 months. The 40% figure is based on this limited sample, not a national survey. The pesticide in question has been studied in 12 larger trials with mixed results.
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9, color: DIM, fontFamily: MONO, textTransform: "uppercase", marginBottom: 3 }}>Evidence</div>
                      <a href="#" onClick={e => e.preventDefault()} style={{ fontSize: 11, color: "#2980B9", textDecoration: "none", fontFamily: MONO, display: "block" }}>
                        nature.com/articles/s41586-025-07891
                      </a>
                    </div>

                    {/* Voting */}
                    <div style={{ fontSize: 9, color: DIM, fontFamily: MONO, textTransform: "uppercase", marginBottom: 6 }}>Your vote</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      <button style={{
                        flex: 1, padding: "8px 0",
                        backgroundColor: "#fff", border: `1px solid ${AFF}`,
                        borderRadius: 4, fontSize: 11, fontWeight: 600,
                        color: AFF, cursor: "pointer",
                      }}>
                        ✓ Approve
                      </button>
                      <button style={{
                        flex: 1, padding: "8px 0",
                        backgroundColor: "#fff", border: `1px solid ${CORR}`,
                        borderRadius: 4, fontSize: 11, fontWeight: 600,
                        color: CORR, cursor: "pointer",
                      }}>
                        ✗ Reject
                      </button>
                    </div>
                    <div>
                      <FieldLabel>Note (optional)</FieldLabel>
                      <TextArea placeholder="Add a note about your vote..." rows={2} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ FOOTER ═══ */}
      <div style={{
        padding: "7px 14px", borderTop: `1px solid ${LINE}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        backgroundColor: "#fafafa", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 12 }}>👑</span>
          <span style={{ fontSize: 11, color: "#666" }}>@thekingofamerica</span>
        </div>
        <div style={{ fontSize: 9.5, fontFamily: MONO, color: DIM, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ backgroundColor: "#f0f0f0", padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 600, color: "#777", border: "1px solid #e0e0e0" }}>APPRENTICE</span>
          <span>100.4</span>
        </div>
      </div>
    </div>
  );
}

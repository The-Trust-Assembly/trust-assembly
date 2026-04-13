import React, { useState } from "react";

// ---- Design tokens ----
const C = {
  navy: "#1B2A4A",
  linen: "#F0EDE6",
  vellum: "#FDFBF5",
  gold: "#B8963E",
  goldLight: "#D4B96A",
  error: "#C44D4D",
  success: "#4A8C5C",
  text: "#2C2C2C",
  textMuted: "#6B6B6B",
  border: "#D4D0C8",
  ward: "#6B4C9A",
};

const SERIF = "'Source Serif 4', Georgia, serif";
const HEADING = "'EB Garamond', Georgia, serif";
const MONO = "'IBM Plex Mono', monospace";

// ---- Scales of Justice icon (base64) ----
const SCALES_ICON = "data:image/png;base64,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";

// ---- Mock data ----

const MOCK_AGENTS = [
  {
    id: "onetime",
    name: "One-Time Agent",
    type: "onetime",
    domain: "",
    color: C.gold,
    initials: "1",
    reputation: 0,
    runs: 0,
    status: "onetime",
    username: "",
    authenticated: false,
  },
  {
    id: "agent-alpha",
    name: "Alpha",
    type: "sentinel",
    domain: "Legal & Policy",
    color: "#4A6FA5",
    initials: "AL",
    reputation: 847,
    runs: 24,
    status: "active",
    username: "agent-alpha",
    authenticated: true,
  },
  {
    id: "agent-herald",
    name: "Greenwald Phantom",
    type: "phantom",
    domain: "Press & Media",
    color: "#8B5E3C",
    initials: "GP",
    reputation: 612,
    runs: 15,
    status: "idle",
    username: "greenwald-phantom",
    authenticated: true,
    substackUrl: "https://greenwald.substack.com",
  },
  {
    id: "agent-ward",
    name: "My Ward",
    type: "ward",
    domain: "Personal Defense",
    color: "#6B4C9A",
    initials: "WD",
    reputation: 340,
    runs: 42,
    status: "idle",
    username: "ward-defense",
    authenticated: true,
    monitoredEntities: ["Acme Corp", "Jane Doe CEO"],
  },
  {
    id: "agent-clarity",
    name: "Clarity",
    type: "sentinel",
    domain: "Science & Health",
    color: "#2E7D6F",
    initials: "CL",
    reputation: 203,
    runs: 6,
    status: "idle",
    username: "clarity-sci",
    authenticated: true,
  },
  {
    id: "agent-new",
    name: "New Agent",
    type: null,
    domain: "Unconfigured",
    color: "#D4D0C8",
    initials: "+",
    reputation: 0,
    runs: 0,
    status: "setup",
    username: "",
    authenticated: false,
  },
];

const ASSEMBLY_ICONS = {
  open:         { bg: "#E8EAF6", fg: "#3949AB", border: "#C5CAE9" },
  regional:     { bg: "#FFF3E0", fg: "#E65100", border: "#FFE0B2" },
  professional: { bg: "#E0F2F1", fg: "#00695C", border: "#B2DFDB" },
};

function getAssemblyInitials(name) {
  return name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const MOCK_ASSEMBLIES = [
  { id: "org-gp", name: "General Public", member_count: 1247, category: "open" },
  { id: "org-ohio", name: "Ohio Assembly", member_count: 89, category: "regional" },
  { id: "org-law", name: "Legal Assembly", member_count: 203, category: "professional" },
  { id: "org-press", name: "Press & Media Assembly", member_count: 412, category: "professional" },
  { id: "org-sci", name: "Science & Health Assembly", member_count: 178, category: "professional" },
  { id: "org-calif", name: "California Assembly", member_count: 156, category: "regional" },
  { id: "org-edu", name: "Education Assembly", member_count: 94, category: "professional" },
  { id: "org-intl", name: "International Observers", member_count: 531, category: "open" },
];

const SCOPE_PRESETS = [
  { label: "Top article", value: "single" },
  { label: "Top 3", value: "top3" },
  { label: "Top 10", value: "top10" },
  { label: "First 5 pages", value: "pages5" },
  { label: "As many as possible", value: "max" },
  { label: "Last 30 days", value: "30d" },
];

// Ward queue mock data
const MOCK_WARD_QUEUE = {
  corrections: [
    {
      id: "wc1", status: "pending", flaggedAt: "2 hours ago",
      article: { headline: "Acme Corp Faces Massive Layoffs Amid Financial Turmoil", url: "https://example.com/acme-layoffs", source: "TechDaily" },
      mention: "The article states Acme Corp laid off 2,000 employees, but the actual number was 200 \u2014 a contractor reduction, not layoffs of full-time staff.",
      reasoning: "The article inflates the number by 10x and mischaracterizes contractor non-renewals as layoffs. Acme Corp's SEC filing from last week confirms 200 contractor positions ended.",
      confidence: "high",
      evidence: "SEC 8-K filing, March 2026; Acme Corp press release",
    },
    {
      id: "wc2", status: "pending", flaggedAt: "6 hours ago",
      article: { headline: "CEO Under Fire for Controversial Offshore Investments", url: "https://example.com/ceo-offshore", source: "Financial Herald" },
      mention: "Claims Jane Doe CEO holds undisclosed offshore accounts. The investments referenced are fully disclosed in public financial filings.",
      reasoning: "The article implies concealment, but these holdings appear in the CEO's publicly filed financial disclosures. The framing is misleading.",
      confidence: "medium",
      evidence: "Public financial disclosure forms; company proxy statement",
    },
    {
      id: "wc3", status: "pending", flaggedAt: "1 day ago",
      article: { headline: "Acme's New Product Fails Safety Standards", url: "https://example.com/acme-safety", source: "Consumer Watch" },
      mention: "States the product failed UL certification. The product passed UL certification in February 2026; the article appears to reference an outdated draft report.",
      reasoning: "The UL certification was granted Feb 12, 2026. The article cites a preliminary review from November 2025 that was superseded.",
      confidence: "high",
      evidence: "UL certification database listing; updated test report",
    },
  ],
  affirmations: [
    {
      id: "wa1", status: "pending", flaggedAt: "3 hours ago",
      article: { headline: "Acme Corp Leads Industry in Carbon Reduction Goals", url: "https://example.com/acme-carbon", source: "GreenBiz" },
      mention: "Accurately reports Acme Corp's 40% carbon reduction since 2020 and its Science Based Targets initiative commitment.",
      reasoning: "The figures match Acme's independently audited sustainability report. Worth affirming to strengthen this accurate narrative.",
      confidence: "high",
      evidence: "Acme Corp 2025 ESG Report (audited); SBTi commitment letter",
    },
    {
      id: "wa2", status: "pending", flaggedAt: "1 day ago",
      article: { headline: "How Acme's Open Source Initiative Changed the Industry", url: "https://example.com/acme-oss", source: "DevWeekly" },
      mention: "Correctly attributes the open-source framework to Acme's engineering team and accurately describes adoption metrics.",
      reasoning: "All claims verified against GitHub repository data and Acme's public engineering blog posts.",
      confidence: "high",
      evidence: "GitHub repository stats; Acme engineering blog",
    },
  ],
};

// ---- Icon primitives ----

const AssemblyIcon = ({ assembly, size = 24 }) => {
  const scheme = ASSEMBLY_ICONS[assembly.category] || ASSEMBLY_ICONS.open;
  const initials = getAssemblyInitials(assembly.name);
  return (
    <span style={{
      width: size, height: size, borderRadius: 4,
      background: scheme.bg, border: "1.5px solid " + scheme.border,
      color: scheme.fg, display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontFamily: HEADING, fontWeight: 700, fontSize: size * 0.42, flexShrink: 0, lineHeight: 1,
    }}>{initials}</span>
  );
};

const AgentIcon = ({ agent, size = 32, showStatus = false }) => (
  <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
    {agent.type === "onetime" ? (
      <img src={SCALES_ICON} alt="Scales" style={{
        width: size, height: size, borderRadius: "50%",
        objectFit: "cover", border: "2px solid " + C.gold,
      }} />
    ) : (
      <span style={{
        width: size, height: size, borderRadius: "50%",
        background: agent.status === "setup" ? "transparent" : agent.color,
        color: agent.status === "setup" ? C.textMuted : "white",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: HEADING, fontWeight: 700,
        fontSize: agent.status === "setup" ? size * 0.5 : size * 0.38,
        lineHeight: 1,
        border: agent.status === "setup" ? "2px dashed " + C.textMuted : "2px solid " + agent.color,
      }}>{agent.initials}</span>
    )}
    {showStatus && agent.status === "active" && (
      <span style={{
        position: "absolute", bottom: -1, right: -1,
        width: size * 0.32, height: size * 0.32, borderRadius: "50%",
        background: C.success, border: "2px solid white",
      }} />
    )}
  </span>
);

// ---- UI primitives ----

const Button = ({ variant = "primary", onClick, disabled, style, children }) => {
  const base = {
    fontFamily: HEADING, fontSize: 16, padding: "10px 24px",
    border: "none", borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.2s ease", opacity: disabled ? 0.6 : 1,
  };
  const variants = {
    primary: { background: C.navy, color: C.vellum },
    gold: { background: C.gold, color: "white" },
    outline: { background: "transparent", border: "1px solid " + C.navy, color: C.navy },
    ward: { background: C.ward, color: "white" },
  };
  return <button style={{ ...base, ...variants[variant], ...style }} onClick={onClick} disabled={disabled}>{children}</button>;
};

const Card = ({ style, children, onClick }) => (
  <div onClick={onClick} style={{
    background: "white", border: "1px solid " + C.border, borderRadius: 8,
    padding: 20, marginBottom: 16, cursor: onClick ? "pointer" : "default", ...style,
  }}>{children}</div>
);

const inputStyle = {
  fontFamily: SERIF, fontSize: 15, padding: "10px 14px",
  border: "1px solid " + C.border, borderRadius: 4,
  background: "white", color: C.text, width: "100%", outline: "none", boxSizing: "border-box",
};

const Label = ({ children }) => (
  <label style={{
    display: "block", fontFamily: HEADING, fontSize: 15, fontWeight: 600,
    color: C.navy, marginBottom: 6,
  }}>{children}</label>
);

// ---- Agent Tab Bar ----
const AgentTabBar = ({ activeAgentId, onSelect, agents }) => {
  const [hoveredId, setHoveredId] = useState(null);
  const agentList = agents || MOCK_AGENTS;
  const typeLabels = { onetime: "One-Time", sentinel: "Sentinel", phantom: "Phantom", ward: "Ward" };

  return (
    <div style={{
      display: "flex", alignItems: "stretch", background: C.navy,
      borderRadius: "10px 10px 0 0", padding: "0 6px", overflow: "hidden",
    }}>
      {agentList.map((agent, idx) => {
        const active = agent.id === activeAgentId;
        const hovered = hoveredId === agent.id;
        const showDivider = idx > 0;
        const divider = showDivider ? (
          <span key={"div-" + agent.id} style={{
            width: 1, alignSelf: "center", height: 22,
            background: C.gold, opacity: 0.35, flexShrink: 0,
          }} />
        ) : null;

        if (active) {
          return (
            <React.Fragment key={agent.id}>
              {divider}
              <button style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 18px", marginTop: 4, border: "none", borderBottom: "none",
                background: C.linen, cursor: "default", borderRadius: "8px 8px 0 0",
                whiteSpace: "nowrap", position: "relative", zIndex: 2,
                boxShadow: "0 -2px 6px rgba(0,0,0,0.1)",
              }}>
                <span style={{
                  position: "absolute", top: 0, left: 8, right: 8, height: 3,
                  borderRadius: "0 0 2px 2px", background: C.gold,
                }} />
                <AgentIcon agent={agent} size={26} showStatus />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontFamily: HEADING, fontSize: 14, fontWeight: 600, color: C.navy, lineHeight: 1.2 }}>
                    {agent.name}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, lineHeight: 1.2 }}>
                    {agent.status === "setup" ? "setup" : agent.type === "onetime" ? "Quick fact-check" : (typeLabels[agent.type] || "") + " \u00b7 " + agent.domain}
                  </div>
                </div>
                {agent.status !== "setup" && agent.type !== "onetime" && (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.gold, marginLeft: 4 }}>
                    {"\u2605"} {agent.reputation}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={agent.id}>
            {divider}
            <div style={{ position: "relative", display: "flex", alignItems: "stretch" }}
              onMouseEnter={() => setHoveredId(agent.id)}
              onMouseLeave={() => setHoveredId(null)}>
              <button onClick={() => onSelect(agent.id)} style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "10px 12px", border: "none", borderBottom: "3px solid transparent",
                background: hovered ? "rgba(255,255,255,0.08)" : "transparent",
                cursor: "pointer", borderRadius: "6px 6px 0 0", transition: "background 0.15s ease",
              }}>
                <span style={{ opacity: hovered ? 0.9 : 0.5, transition: "opacity 0.15s ease", display: "flex" }}>
                  <AgentIcon agent={agent} size={26} />
                </span>
              </button>
              {hovered && (
                <div style={{
                  position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
                  marginTop: 4, background: C.navy, border: "1px solid " + C.gold + "55",
                  borderRadius: 6, padding: "8px 12px", whiteSpace: "nowrap", zIndex: 60,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)", pointerEvents: "none",
                }}>
                  <div style={{ fontFamily: HEADING, fontSize: 13, fontWeight: 600, color: "white", lineHeight: 1.2, marginBottom: 2 }}>
                    {agent.name}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.2 }}>
                    {agent.status === "setup" ? "Click to set up"
                      : agent.type === "onetime" ? "Quick fact-check"
                      : (typeLabels[agent.type] || "") + " \u00b7 " + agent.domain + " \u00b7 \u2605 " + agent.reputation}
                  </div>
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ---- Assembly Multi-Select ----
const AssemblySelector = ({ selectedIds, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  const filtered = MOCK_ASSEMBLIES.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));
  const catLabels = { open: "Open", regional: "Regional", professional: "Professional" };
  const grouped = {};
  filtered.forEach((a) => { const cat = a.category || "other"; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(a); });
  function toggle(id) { if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id)); else onChange([...selectedIds, id]); }
  function remove(id, e) { e.stopPropagation(); onChange(selectedIds.filter((x) => x !== id)); }
  const selectedAssemblies = MOCK_ASSEMBLIES.filter((a) => selectedIds.includes(a.id));
  const totalMembers = selectedAssemblies.reduce((sum, a) => sum + a.member_count, 0);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={() => !disabled && setOpen(!open)} style={{
        ...inputStyle, minHeight: 42, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
        cursor: disabled ? "not-allowed" : "pointer", padding: "6px 10px",
        background: disabled ? "#f5f5f5" : "white",
        borderColor: open ? C.gold : C.border,
        boxShadow: open ? "0 0 0 2px rgba(184,150,62,0.2)" : "none",
      }}>
        {selectedAssemblies.length === 0 && <span style={{ color: C.textMuted, fontSize: 14 }}>Select assemblies...</span>}
        {selectedAssemblies.map((a) => (
          <span key={a.id} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: C.navy, color: C.vellum, padding: "3px 8px 3px 4px",
            borderRadius: 14, fontSize: 12, fontFamily: HEADING, fontWeight: 500, whiteSpace: "nowrap",
          }}>
            <AssemblyIcon assembly={a} size={18} />{a.name}
            <span onClick={(e) => remove(a.id, e)} style={{
              cursor: "pointer", marginLeft: 1, width: 16, height: 16, borderRadius: "50%",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, background: "rgba(255,255,255,0.2)",
            }}>{"\u2715"}</span>
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: C.textMuted, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>{"\u25bc"}</span>
      </div>
      {selectedAssemblies.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: C.textMuted }}>
          <span><strong style={{ fontFamily: MONO, color: C.text }}>{selectedAssemblies.length}</strong> assembl{selectedAssemblies.length === 1 ? "y" : "ies"} selected</span>
          <span><strong style={{ fontFamily: MONO, color: C.text }}>{totalMembers.toLocaleString()}</strong> total jurors</span>
        </div>
      )}
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
          background: "white", border: "1px solid " + C.border, borderRadius: 8,
          boxShadow: "0 8px 24px rgba(27,42,74,0.12), 0 2px 8px rgba(0,0,0,0.08)", zIndex: 50, overflow: "hidden",
        }}>
          {MOCK_ASSEMBLIES.length > 4 && (
            <div style={{ padding: "10px 12px 6px", borderBottom: "1px solid " + C.border }}>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter assemblies..." autoFocus
                style={{ ...inputStyle, fontSize: 13, padding: "7px 10px", background: C.linen, border: "none", borderRadius: 6 }} />
            </div>
          )}
          <div style={{ maxHeight: 280, overflowY: "auto", padding: "6px 0" }}>
            {Object.entries(grouped).map(([cat, assemblies]) => (
              <div key={cat}>
                <div style={{ padding: "8px 14px 4px", fontSize: 11, fontFamily: MONO, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{catLabels[cat] || cat}</div>
                {assemblies.map((a) => {
                  const checked = selectedIds.includes(a.id);
                  return (
                    <div key={a.id} onClick={() => toggle(a.id)} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer",
                      background: checked ? "rgba(184,150,62,0.07)" : "transparent",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = checked ? "rgba(184,150,62,0.13)" : C.linen)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = checked ? "rgba(184,150,62,0.07)" : "transparent")}>
                      <span style={{ width: 18, height: 18, borderRadius: 4, border: "2px solid " + (checked ? C.gold : C.border), background: checked ? C.gold : "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "white", fontSize: 12, fontWeight: 700 }}>{checked && "\u2713"}</span>
                      <AssemblyIcon assembly={a} size={22} />
                      <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontFamily: HEADING, fontWeight: 600, color: C.navy, lineHeight: 1.3 }}>{a.name}</div></div>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textMuted, flexShrink: 0 }}>{a.member_count.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: 16, textAlign: "center", color: C.textMuted, fontSize: 13 }}>No match</div>}
          </div>
          <div style={{ padding: "8px 12px", borderTop: "1px solid " + C.border, display: "flex", justifyContent: "space-between", background: C.linen }}>
            <button onClick={() => { if (selectedIds.length === MOCK_ASSEMBLIES.length) onChange([]); else onChange(MOCK_ASSEMBLIES.map((a) => a.id)); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: HEADING, fontWeight: 600, color: C.gold, padding: "4px 0" }}>
              {selectedIds.length === MOCK_ASSEMBLIES.length ? "Deselect all" : "Select all"}
            </button>
            <button onClick={() => setOpen(false)} style={{ background: C.navy, color: C.vellum, border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: HEADING, fontWeight: 600, padding: "5px 14px" }}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- One-Time Agent Onboarding ----
const OneTimeOnboarding = ({ onReview, userState = "no_account" }) => {
  // userState: "no_account" | "has_account_no_agents" | "has_account_has_agents"
  const [step, setStep] = useState("welcome"); // welcome, register, confirm, choose, ready
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [chosenType, setChosenType] = useState(null); // "sentinel" | "ward" | "phantom"

  // Ward one-time config
  const [wardEntities, setWardEntities] = useState("");
  const [wardDuration, setWardDuration] = useState("24h");

  // Phantom one-time config
  const [phantomUrls, setPhantomUrls] = useState("");

  const oneTimeTypes = [
    {
      type: "sentinel",
      icon: "\u{1f6e1}\u{fe0f}",
      title: "One-Time Sentinel",
      tagline: "Fact-check a topic right now",
      what: "Enter a thesis or topic. The AI scans the web for articles, analyzes them for factual accuracy, and lets you submit corrections or affirmations to an Assembly.",
      benefits: ["No commitment \u2014 single run, single topic", "Full review and editing before submission", "Results credited to your email automatically"],
      limitations: ["No ongoing monitoring \u2014 one scan and done", "No reputation building", "Must manually re-run if new articles appear"],
      upgrade: "A full Sentinel runs continuously, builds reputation in a domain, and lets you track topics over time.",
    },
    {
      type: "ward",
      icon: "\u{1f6e1}",
      title: "One-Time Ward",
      tagline: "Monitor your reputation temporarily",
      what: "Enter the names or entities you want protected. The Ward scans the web for a time window you choose and flags articles that mention you \u2014 sorting them into suggested corrections and affirmations.",
      benefits: ["Try reputation monitoring without commitment", "Choose your monitoring window (24h to 7 days)", "See both corrections and affirmations in one queue"],
      limitations: ["Monitoring stops after your chosen window", "No continuous defense \u2014 new mentions after the window are missed", "Limited scan depth vs. a full Ward"],
      upgrade: "A full Ward monitors 24/7, builds a history of your coverage, and catches inaccuracies as they appear.",
    },
    {
      type: "phantom",
      icon: "\u{1f47b}",
      title: "One-Time Phantom",
      tagline: "Analyze specific articles for extraction",
      what: "Paste links to specific articles or a Substack author's recent posts. The Phantom analyzes each piece and identifies claims eligible for submission as corrections or affirmations.",
      benefits: ["Analyze specific pieces you already know about", "Batch-process multiple articles at once", "No feed subscription required"],
      limitations: ["No ongoing feed monitoring", "Only processes the links you provide", "Won't catch new posts after this run"],
      upgrade: "A full Phantom watches a feed in real-time, automatically scanning every new post as it's published. Named after the author it monitors.",
    },
  ];

  if (step === "welcome") {
    return (
      <div>
        <div style={{ textAlign: "center", padding: "20px 0 28px" }}>
          <img src={SCALES_ICON} alt="Trust Assembly" style={{ width: 72, height: 72, borderRadius: 12, marginBottom: 12 }} />
          <h2 style={{ fontFamily: HEADING, color: C.navy, fontSize: 28, margin: "0 0 8px" }}>
            Trust Assembly One-Time Agent
          </h2>
          <p style={{ fontSize: 16, color: C.textMuted, maxWidth: 540, margin: "0 auto", lineHeight: 1.7 }}>
            {userState === "no_account" && (
              <>No account yet? Register at <a href="https://trustassembly.org" target="_blank" rel="noopener noreferrer" style={{ color: C.gold, fontWeight: 600, textDecoration: "underline" }}>trustassembly.org</a> for a full account, or try a one-time fact-check below.</>
            )}
            {userState === "has_account_no_agents" && (
              <>You're logged in but have no AI agents configured. You can still fact-check, correct, and affirm — no AI agent required. Or set up your first agent with the <strong style={{ color: C.navy }}>+</strong> tab above.</>
            )}
            {userState === "has_account_has_agents" && (
              <>Quick fact-check — no agent needed. Or switch to one of your agents above.</>
            )}
          </p>
        </div>

        {/* Three one-time agent type cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
          {oneTimeTypes.map((ot) => {
            const selected = chosenType === ot.type;
            return (
              <div
                key={ot.type}
                onClick={() => setChosenType(ot.type)}
                style={{
                  padding: "20px 24px",
                  borderRadius: 10,
                  border: selected ? "2px solid " + C.gold : "2px solid " + C.border,
                  background: selected ? C.gold + "08" : "white",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "start", gap: 16 }}>
                  <span style={{ fontSize: 28, flexShrink: 0, marginTop: 2 }}>{ot.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontFamily: HEADING, fontSize: 19, fontWeight: 700, color: C.navy }}>{ot.title}</span>
                      {selected && <span style={{ color: C.gold, fontSize: 18, fontWeight: 700 }}>{"\u2713"}</span>}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.gold, marginBottom: 8 }}>{ot.tagline}</div>
                    <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6, marginBottom: 12 }}>{ot.what}</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontFamily: HEADING, fontSize: 12, fontWeight: 600, color: C.success, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>What you get</div>
                        {ot.benefits.map((b, i) => (
                          <div key={i} style={{ fontSize: 12, color: C.text, lineHeight: 1.6, display: "flex", gap: 6, marginBottom: 2 }}>
                            <span style={{ color: C.success, flexShrink: 0 }}>{"\u2713"}</span>{b}
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontFamily: HEADING, fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Limitations</div>
                        {ot.limitations.map((l, i) => (
                          <div key={i} style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, display: "flex", gap: 6, marginBottom: 2 }}>
                            <span style={{ flexShrink: 0 }}>{"\u2014"}</span>{l}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{
                      fontSize: 12, color: C.navy, background: C.linen, padding: "8px 12px",
                      borderRadius: 6, borderLeft: "3px solid " + C.gold, lineHeight: 1.5,
                    }}>
                      <strong style={{ fontFamily: HEADING }}>Upgrade path:</strong> {ot.upgrade}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: "center" }}>
          <Button variant="gold" onClick={() => {
            if (userState === "no_account") setStep("register");
            else if (chosenType === "sentinel") setStep("ready");
            else setStep("configure");
          }} disabled={!chosenType}
            style={{ fontSize: 18, padding: "14px 40px", opacity: chosenType ? 1 : 0.5 }}>
            {chosenType ? "Continue with " + oneTimeTypes.find((t) => t.type === chosenType).title : "Select a mode above"}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "register") {
    return (
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <h2 style={{ fontFamily: HEADING, color: C.navy, fontSize: 24, textAlign: "center", marginBottom: 4 }}>
          Quick Registration
        </h2>
        <p style={{ fontSize: 14, color: C.textMuted, textAlign: "center", marginBottom: 24, lineHeight: 1.6 }}>
          We just need your email to credit your submissions. You can claim your full account later.
        </p>
        <Card style={{ borderColor: C.gold, borderWidth: 2 }}>
          <div style={{ marginBottom: 16 }}>
            <Label>Email Address</Label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <Label>Create Password</Label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              placeholder="Choose a password" style={inputStyle} />
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
              You'll use this to claim your account and submissions later.
            </div>
          </div>
          <Button variant="gold" onClick={() => setStep("confirm")} disabled={!email || !pw}
            style={{ width: "100%", fontSize: 16, padding: "12px 0" }}>
            Send Confirmation Code
          </Button>
        </Card>
        <button onClick={() => setStep("welcome")} style={{
          display: "block", margin: "16px auto 0", background: "none", border: "none",
          cursor: "pointer", fontSize: 13, color: C.textMuted, fontFamily: HEADING,
        }}>{"\u2190"} Back</button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <h2 style={{ fontFamily: HEADING, color: C.navy, fontSize: 24, textAlign: "center", marginBottom: 4 }}>
          Confirm Your Email
        </h2>
        <p style={{ fontSize: 14, color: C.textMuted, textAlign: "center", marginBottom: 24, lineHeight: 1.6 }}>
          We sent a 6-digit code to <strong style={{ color: C.navy }}>{email}</strong>
        </p>
        <Card style={{ borderColor: C.gold, borderWidth: 2 }}>
          <div style={{ marginBottom: 20 }}>
            <Label>Confirmation Code</Label>
            <input type="text" value={code} onChange={(e) => { setCode(e.target.value); setCodeError(false); }}
              placeholder="000000" maxLength={6}
              style={{ ...inputStyle, fontFamily: MONO, fontSize: 24, textAlign: "center", letterSpacing: 8, padding: "14px" }} />
            {codeError && <div style={{ fontSize: 13, color: C.error, marginTop: 6 }}>Invalid code. Please try again.</div>}
          </div>
          <Button variant="gold" onClick={() => { if (code.length === 6) setStep(chosenType === "sentinel" ? "ready" : "configure"); else setCodeError(true); }}
            disabled={code.length < 6} style={{ width: "100%", fontSize: 16, padding: "12px 0" }}>
            Verify & Continue
          </Button>
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button onClick={() => {}} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: C.gold, fontFamily: HEADING, fontWeight: 600 }}>Resend code</button>
          </div>
        </Card>
        <button onClick={() => setStep("register")} style={{
          display: "block", margin: "16px auto 0", background: "none", border: "none",
          cursor: "pointer", fontSize: 13, color: C.textMuted, fontFamily: HEADING,
        }}>{"\u2190"} Back</button>
      </div>
    );
  }

  // Configure step for Ward and Phantom
  if (step === "configure") {
    return (
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{
          background: C.success + "15", border: "1px solid " + C.success + "40",
          borderRadius: 8, padding: "10px 16px", marginBottom: 24,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ color: C.success, fontSize: 16 }}>{"\u2713"}</span>
          <span style={{ fontSize: 13, color: C.navy }}>Verified as <strong>{email}</strong></span>
        </div>

        {chosenType === "ward" && (
          <>
            <h2 style={{ fontFamily: HEADING, color: C.navy, fontSize: 24, textAlign: "center", marginBottom: 4 }}>
              Configure Your One-Time Ward
            </h2>
            <p style={{ fontSize: 14, color: C.textMuted, textAlign: "center", marginBottom: 24, lineHeight: 1.6 }}>
              Tell us who to protect and for how long. The Ward will scan for mentions and flag what it finds.
            </p>
            <Card style={{ borderLeft: "4px solid " + C.ward }}>
              <div style={{ marginBottom: 16 }}>
                <Label>Who or what should we monitor?</Label>
                <textarea value={wardEntities} onChange={(e) => setWardEntities(e.target.value)}
                  placeholder={"e.g., Acme Corp, Jane Doe CEO, Project Atlas\n\nEnter names, organizations, or topics \u2014 one per line or comma-separated."}
                  style={{ ...inputStyle, minHeight: 80, fontSize: 14, resize: "vertical" }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <Label>Monitoring Window</Label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { value: "24h", label: "24 hours" },
                    { value: "3d", label: "3 days" },
                    { value: "7d", label: "7 days" },
                  ].map((opt) => (
                    <span key={opt.value} onClick={() => setWardDuration(opt.value)}
                      style={{
                        fontFamily: MONO, fontSize: 13, padding: "8px 16px",
                        background: wardDuration === opt.value ? C.ward : C.linen,
                        color: wardDuration === opt.value ? "white" : C.text,
                        border: "1px solid " + (wardDuration === opt.value ? C.ward : C.border),
                        borderRadius: 6, cursor: "pointer", userSelect: "none",
                      }}>
                      {opt.label}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>
                  After this window, monitoring stops. Upgrade to a full Ward for continuous protection.
                </div>
              </div>
              <Button variant="ward" onClick={() => setStep("ready")} disabled={!wardEntities}
                style={{ width: "100%", fontSize: 16, padding: "12px 0" }}>
                Start Monitoring
              </Button>
            </Card>
          </>
        )}

        {chosenType === "phantom" && (
          <>
            <h2 style={{ fontFamily: HEADING, color: C.navy, fontSize: 24, textAlign: "center", marginBottom: 4 }}>
              Configure Your One-Time Phantom
            </h2>
            <p style={{ fontSize: 14, color: C.textMuted, textAlign: "center", marginBottom: 24, lineHeight: 1.6 }}>
              Paste the article URLs or Substack links you want analyzed. The Phantom will extract and evaluate each one.
            </p>
            <Card style={{ borderLeft: "4px solid #8B5E3C" }}>
              <div style={{ marginBottom: 16 }}>
                <Label>Article URLs</Label>
                <textarea value={phantomUrls} onChange={(e) => setPhantomUrls(e.target.value)}
                  placeholder={"Paste article URLs, one per line:\n\nhttps://example.substack.com/p/first-article\nhttps://example.substack.com/p/second-article\nhttps://example.com/news/some-story"}
                  style={{ ...inputStyle, minHeight: 120, fontSize: 13, fontFamily: MONO, resize: "vertical", lineHeight: 1.8 }} />
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                  {phantomUrls.split("\n").filter((l) => l.trim().startsWith("http")).length} URLs detected
                </div>
              </div>
              <Button variant="primary" onClick={() => setStep("ready")}
                disabled={!phantomUrls.trim()}
                style={{ width: "100%", fontSize: 16, padding: "12px 0", background: "#8B5E3C" }}>
                Analyze Articles
              </Button>
            </Card>
          </>
        )}

        <button onClick={() => setStep("confirm")} style={{
          display: "block", margin: "16px auto 0", background: "none", border: "none",
          cursor: "pointer", fontSize: 13, color: C.textMuted, fontFamily: HEADING,
        }}>{"\u2190"} Back</button>
      </div>
    );
  }

  // step === "ready" -> route to appropriate experience
  const emailBanner = (
    <div style={{
      background: C.success + "15", border: "1px solid " + C.success + "40",
      borderRadius: 8, padding: "12px 16px", marginBottom: 20,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ color: C.success, fontSize: 18 }}>{"\u2713"}</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>Email confirmed!</span>
        <span style={{ fontSize: 13, color: C.textMuted, marginLeft: 8 }}>
          Submissions credited to {email}
        </span>
      </div>
      <span style={{
        fontFamily: MONO, fontSize: 11, background: C.linen, padding: "4px 10px",
        borderRadius: 4, color: C.textMuted,
      }}>
        {chosenType === "sentinel" ? "One-Time Sentinel" : chosenType === "ward" ? "One-Time Ward \u00b7 " + wardDuration : "One-Time Phantom"}
      </span>
    </div>
  );

  if (chosenType === "ward") {
    const wardAgent = { ...MOCK_AGENTS[0], name: "One-Time Ward", type: "ward", color: C.ward, initials: "OW", domain: "Personal Defense", monitoredEntities: wardEntities.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean), reputation: 0, runs: 0 };
    return <div>{emailBanner}<WardDashboard agent={wardAgent} onReview={onReview} /></div>;
  }

  if (chosenType === "phantom") {
    // Show the phantom results as a review-ready state
    return (
      <div>
        {emailBanner}
        <Card style={{ borderLeft: "4px solid #8B5E3C", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>{"\u{1f47b}"}</span>
            <h3 style={{ fontFamily: HEADING, color: C.navy, margin: 0, fontSize: 18 }}>Phantom Analysis Complete</h3>
          </div>
          <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
            Analyzed {phantomUrls.split("\n").filter((l) => l.trim().startsWith("http")).length} articles.
            Found 3 submissions and 2 vault entries ready for your review.
          </p>
          <Button variant="gold" onClick={onReview} style={{ fontSize: 16, padding: "10px 24px" }}>
            Review Submissions
          </Button>
        </Card>
      </div>
    );
  }

  // Default: sentinel
  return <div>{emailBanner}<Dashboard onReview={onReview} agent={MOCK_AGENTS[0]} /></div>;
};

// ---- Dashboard (Sentinel / One-Time) ----
const Dashboard = ({ onReview, agent }) => {
  const [thesis, setThesis] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [who, setWho] = useState(""); const [what, setWhat] = useState("");
  const [when_, setWhen] = useState(""); const [where_, setWhere] = useState("");
  const [why, setWhy] = useState("");
  const [activePreset, setActivePreset] = useState(0);
  const [selectedOrgIds, setSelectedOrgIds] = useState(["org-gp"]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("idle");

  // Keyword step
  const [keywords, setKeywords] = useState([]);
  const [showKeywords, setShowKeywords] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [generatingKeywords, setGeneratingKeywords] = useState(false);

  function generateKeywords() {
    setGeneratingKeywords(true);
    // Mock: Sonnet would generate these from the thesis
    setTimeout(() => {
      setKeywords([
        "Afroman defamation lawsuit ruling",
        "Afroman First Amendment protected speech",
        "Adams County deputies defamation dismissed",
        "Afroman music video lawsuit outcome",
        "court ruling protected speech vs factual accuracy",
        "Afroman wins lawsuit misconduct",
        "defamation case free speech defense music",
      ]);
      setShowKeywords(true);
      setGeneratingKeywords(false);
    }, 1200);
  }

  function removeKeyword(idx) { setKeywords(keywords.filter((_, i) => i !== idx)); }
  function addKeyword() {
    if (newKeyword.trim()) {
      setKeywords([...keywords, newKeyword.trim()]);
      setNewKeyword("");
    }
  }

  function startMockRun() {
    setRunning(true); setStage("searching"); setProgress(8);
    setTimeout(() => { setStage("filtering"); setProgress(25); }, 900);
    setTimeout(() => { setStage("fetching"); setProgress(45); }, 1800);
    setTimeout(() => { setStage("analyzing"); setProgress(70); }, 2700);
    setTimeout(() => { setStage("synthesizing"); setProgress(90); }, 3600);
    setTimeout(() => { setStage("ready"); setProgress(100); setRunning(false); }, 4500);
  }
  const stageMessages = {
    searching: "Searching Google with your keywords...",
    filtering: "Filtering results for relevance (Haiku)...",
    fetching: "Fetching full article contents...",
    analyzing: "Analyzing articles for factual accuracy (Sonnet)...",
    synthesizing: "Synthesizing findings across articles...",
    ready: "Ready for review.",
  };

  const stageCosts = {
    searching: "Google Search API",
    filtering: "Haiku 4.5 \u00b7 ~$0.01",
    fetching: "Network only",
    analyzing: "Sonnet 4.6 \u00b7 ~$0.07",
    synthesizing: "Sonnet 4.6 \u00b7 ~$0.02",
  };

  return (
    <div>
      {agent.type !== "onetime" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, padding: "12px 16px", background: "white", borderRadius: 8, border: "1px solid " + C.border }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <AgentIcon agent={agent} size={36} showStatus />
            <div>
              <div style={{ fontFamily: HEADING, fontWeight: 600, fontSize: 16, color: C.navy }}>{agent.type === "phantom" ? agent.name : "Agent " + agent.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textMuted }}>
                {agent.type === "phantom" ? "Phantom" : "Sentinel"} {"\u00b7"} {agent.domain} {"\u00b7"} {"\u2605"} {agent.reputation} {"\u00b7"} {agent.runs} runs
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, fontSize: 13, color: C.textMuted }}>
            <span>Today: <strong style={{ fontFamily: MONO }}>$0.00</strong></span>
            <span>Month: <strong style={{ fontFamily: MONO }}>$4.72</strong></span>
            <span>Total: <strong style={{ fontFamily: MONO }}>$38.15</strong></span>
          </div>
        </div>
      )}
      <Card style={{ borderColor: C.gold, borderWidth: 2 }}>
        <h3 style={{ fontFamily: HEADING, color: C.navy, marginBottom: 16, margin: 0, marginBlockEnd: 16 }}>What should we fact-check?</h3>
        <div style={{ marginBottom: 12 }}>
          <Label>What do you think is important to correct or affirm in the public understanding?</Label>
          <textarea value={thesis} onChange={(e) => setThesis(e.target.value)}
            placeholder="e.g., Many articles conflate the court finding the songs were protected speech with the factual claims in them being true."
            style={{ ...inputStyle, minHeight: 70, fontSize: 14, resize: "vertical" }} disabled={running || showKeywords} />
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>This guides the AI's analysis \u2014 it will test your thesis across all articles it finds.</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowDetails(!showDetails)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0", fontFamily: HEADING, fontSize: 14, fontWeight: 600, color: C.gold, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ transform: showDetails ? "rotate(90deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>{"\u25b6"}</span>
            Details \u2014 Who, What, When, Where, Why
          </button>
          {showDetails && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", marginBottom: 12 }}>
                <div><Label>Who</Label><input type="text" value={who} onChange={(e) => setWho(e.target.value)} placeholder="e.g., Afroman, Adams County deputies" style={inputStyle} disabled={running || showKeywords} /></div>
                <div><Label>What</Label><input type="text" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="e.g., Defamation lawsuit over music videos" style={inputStyle} disabled={running || showKeywords} /></div>
                <div><Label>When</Label><input type="text" value={when_} onChange={(e) => setWhen(e.target.value)} placeholder="e.g., March 2026" style={inputStyle} disabled={running || showKeywords} /></div>
                <div><Label>Where</Label><input type="text" value={where_} onChange={(e) => setWhere(e.target.value)} placeholder="e.g., Adams County, Ohio" style={inputStyle} disabled={running || showKeywords} /></div>
              </div>
              <div><Label>Why is this story important?</Label><input type="text" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g., Sets precedent for free speech vs defamation" style={inputStyle} disabled={running || showKeywords} /></div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <Label>Search scope</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {SCOPE_PRESETS.map((preset, i) => {
                const active = activePreset === i;
                return <span key={i} onClick={() => !running && !showKeywords && setActivePreset(i)} style={{ fontFamily: MONO, fontSize: 12, padding: "4px 12px", background: active ? C.navy : C.linen, color: active ? "white" : C.text, border: "1px solid " + (active ? C.navy : C.border), borderRadius: 16, cursor: running || showKeywords ? "not-allowed" : "pointer", userSelect: "none" }}>{preset.label}</span>;
              })}
            </div>
          </div>
          <div style={{ minWidth: 280 }}>
            <Label>Assemblies</Label>
            <AssemblySelector selectedIds={selectedOrgIds} onChange={setSelectedOrgIds} disabled={running || showKeywords} />
          </div>
        </div>
        <div style={{ background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 12, lineHeight: 1.6, color: "#5D4037" }}>
          <strong>Note:</strong> The AI follows evidence it finds, not the framing you provide. Results may not agree with your conclusions.
        </div>

        {/* Step 1: Generate Keywords button */}
        {!showKeywords && (
          <Button variant="primary" onClick={generateKeywords} disabled={generatingKeywords || !thesis.trim()}
            style={{ width: "100%", fontSize: 18, padding: "12px 0" }}>
            {generatingKeywords ? "Generating keywords..." : "Generate Search Keywords"}
          </Button>
        )}
      </Card>

      {/* Keyword preview/edit step */}
      {showKeywords && !running && stage === "idle" && (
        <Card style={{ borderLeft: "4px solid " + C.gold }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h3 style={{ fontFamily: HEADING, color: C.navy, margin: 0, fontSize: 17 }}>Search Keywords</h3>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                Generated by Sonnet from your thesis. Edit, add, or remove before searching.
              </div>
            </div>
            <button onClick={() => { setShowKeywords(false); setKeywords([]); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: C.textMuted, fontFamily: HEADING }}>
              {"\u2190"} Edit thesis
            </button>
          </div>

          {/* Keyword chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {keywords.map((kw, i) => (
              <span key={i} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: C.navy, color: C.vellum, padding: "6px 10px 6px 14px",
                borderRadius: 20, fontSize: 13, fontFamily: MONO,
              }}>
                {kw}
                <span onClick={() => removeKeyword(i)} style={{
                  cursor: "pointer", width: 18, height: 18, borderRadius: "50%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, background: "rgba(255,255,255,0.2)",
                }}>{"\u2715"}</span>
              </span>
            ))}
          </div>

          {/* Add keyword input */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input type="text" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addKeyword(); }}
              placeholder="Add a keyword..."
              style={{ ...inputStyle, flex: 1, fontSize: 13, fontFamily: MONO, padding: "8px 12px" }} />
            <Button variant="outline" onClick={addKeyword} disabled={!newKeyword.trim()}
              style={{ fontSize: 13, padding: "8px 16px" }}>Add</Button>
          </div>

          {/* Cost estimate */}
          <div style={{
            background: C.linen, borderRadius: 6, padding: "10px 14px", marginBottom: 16,
            fontSize: 12, color: C.textMuted, lineHeight: 1.7,
          }}>
            <strong style={{ color: C.navy }}>Estimated cost for this run:</strong>{" "}
            {keywords.length} keywords {"\u00d7"} Google Search, then Haiku filters results (~$0.01), Sonnet analyzes matches (~$0.09).{" "}
            <strong style={{ fontFamily: MONO, color: C.navy }}>~$0.10-0.15 total</strong>
          </div>

          <Button variant="gold" onClick={startMockRun} disabled={keywords.length === 0}
            style={{ width: "100%", fontSize: 18, padding: "12px 0" }}>
            Search with {keywords.length} Keyword{keywords.length !== 1 ? "s" : ""}
          </Button>
        </Card>
      )}

      {/* Pipeline progress */}
      {stage !== "idle" && stage !== "ready" && (
        <Card style={{ borderLeft: "4px solid " + C.gold }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{thesis ? (thesis.length > 60 ? thesis.substring(0, 60) + "..." : thesis) : "Demo run"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textMuted }}>
              {keywords.length} keywords {"\u00b7"} {stage === "searching" ? "searching..." : "28 results"} {"\u00b7"} {["filtering","fetching","analyzing","synthesizing"].includes(stage) ? (stage === "filtering" ? "filtering..." : "5 relevant") : ""}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{stageMessages[stage]}</div>
          <div style={{ fontSize: 11, fontFamily: MONO, color: C.textMuted, marginBottom: 8 }}>{stageCosts[stage]}</div>
          <div style={{ width: "100%", height: 8, background: C.linen, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: progress + "%", background: C.gold, borderRadius: 4, transition: "width 0.3s ease" }} />
          </div>
        </Card>
      )}
      {stage === "ready" && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontFamily: HEADING, color: C.navy, marginBottom: 12 }}>Ready for Review</h3>
          <Card style={{ borderLeft: "4px solid " + C.success }} onClick={onReview}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{thesis ? (thesis.length > 70 ? thesis.substring(0, 70) + "..." : thesis) : "Demo run"}</span>
              <Button variant="gold" style={{ fontSize: 13, padding: "6px 16px" }}>Review</Button>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 14, color: C.textMuted }}>
              <span style={{ fontFamily: MONO }}>3 submissions</span>
              <span style={{ fontFamily: MONO, color: C.gold }}>2 vault entries</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// ---- Ward Dashboard ----
const WardDashboard = ({ agent, onReview }) => {
  const [corrections, setCorrections] = useState(MOCK_WARD_QUEUE.corrections);
  const [affirmations, setAffirmations] = useState(MOCK_WARD_QUEUE.affirmations);
  const [lane, setLane] = useState("corrections");
  const [expandedId, setExpandedId] = useState(null);

  function dismissItem(id, type) {
    if (type === "corrections") setCorrections((prev) => prev.filter((c) => c.id !== id));
    else setAffirmations((prev) => prev.filter((a) => a.id !== id));
  }

  const items = lane === "corrections" ? corrections : affirmations;
  const laneColor = lane === "corrections" ? C.error : C.success;

  const confBadge = {
    high: { background: "#D4EDDA", color: "#155724" },
    medium: { background: "#FFF3CD", color: "#856404" },
    low: { background: "#E8E8E8", color: "#555" },
  };

  return (
    <div>
      {/* Agent card */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, padding: "12px 16px", background: "white", borderRadius: 8, border: "1px solid " + C.border }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AgentIcon agent={agent} size={36} showStatus />
          <div>
            <div style={{ fontFamily: HEADING, fontWeight: 600, fontSize: 16, color: C.navy }}>{agent.name}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textMuted }}>
              Ward {"\u00b7"} {agent.domain} {"\u00b7"} {"\u2605"} {agent.reputation} {"\u00b7"} {agent.runs} runs
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: C.textMuted }}>
          Monitoring: <strong style={{ color: C.navy }}>{(agent.monitoredEntities || []).join(", ")}</strong>
        </div>
      </div>

      {/* Status banner */}
      <div style={{
        background: C.ward + "10", border: "1px solid " + C.ward + "30", borderRadius: 8,
        padding: "14px 18px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>{"\u{1f6e1}"}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>Ward is actively monitoring</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>
              Last scan: 14 minutes ago {"\u00b7"} 847 articles checked this month
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 20, color: C.error }}>{corrections.length}</div>
            <div style={{ color: C.textMuted, fontSize: 11 }}>corrections</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 20, color: C.success }}>{affirmations.length}</div>
            <div style={{ color: C.textMuted, fontSize: 11 }}>affirmations</div>
          </div>
        </div>
      </div>

      {/* Lane tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid " + C.border }}>
        {[
          { key: "corrections", label: "Suggested Corrections", count: corrections.length, color: C.error },
          { key: "affirmations", label: "Suggested Affirmations", count: affirmations.length, color: C.success },
        ].map((t) => (
          <button key={t.key} onClick={() => setLane(t.key)} style={{
            padding: "10px 24px", fontSize: 15, border: "none", background: "none",
            cursor: "pointer", fontFamily: HEADING, fontWeight: 600,
            color: lane === t.key ? C.navy : C.textMuted,
            borderBottom: lane === t.key ? "3px solid " + t.color : "3px solid transparent",
            marginBottom: -2, display: "flex", alignItems: "center", gap: 8,
          }}>
            {t.label}
            <span style={{
              fontFamily: MONO, fontSize: 12, background: lane === t.key ? t.color : C.border,
              color: lane === t.key ? "white" : C.textMuted,
              padding: "2px 8px", borderRadius: 10, fontWeight: 600,
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Queue items */}
      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.textMuted }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{lane === "corrections" ? "\u2713" : "\u{1f50d}"}</div>
          <div style={{ fontSize: 15 }}>No {lane === "corrections" ? "corrections" : "affirmations"} pending</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>The Ward is still monitoring. New items will appear here.</div>
        </div>
      )}

      {items.map((item) => {
        const expanded = expandedId === item.id;
        return (
          <Card key={item.id} style={{
            borderLeft: "4px solid " + laneColor, padding: 0, overflow: "hidden",
          }}>
            {/* Header row - always visible */}
            <div onClick={() => setExpandedId(expanded ? null : item.id)} style={{
              padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "start", gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted }}>{item.article.source}</span>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{"\u00b7"}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted }}>{item.flaggedAt}</span>
                  <span style={{
                    marginLeft: "auto", fontFamily: MONO, fontSize: 11, padding: "2px 8px",
                    borderRadius: 10, fontWeight: 500, ...confBadge[item.confidence],
                  }}>{item.confidence}</span>
                </div>
                <div style={{ fontFamily: HEADING, fontSize: 16, fontWeight: 600, color: C.navy, lineHeight: 1.3, marginBottom: 6 }}>
                  {item.article.headline}
                </div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                  {item.mention}
                </div>
              </div>
              <span style={{
                fontSize: 12, color: C.textMuted, flexShrink: 0, marginTop: 4,
                transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s",
              }}>{"\u25bc"}</span>
            </div>

            {/* Expanded detail */}
            {expanded && (
              <div style={{ padding: "0 18px 18px", borderTop: "1px solid " + C.border }}>
                <div style={{ padding: "14px 0" }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: HEADING, fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 4 }}>Ward's Reasoning</div>
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, background: C.linen, padding: "10px 14px", borderRadius: 6 }}>{item.reasoning}</div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: HEADING, fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 4 }}>Evidence</div>
                    <div style={{ fontSize: 12, fontFamily: MONO, color: C.textMuted, lineHeight: 1.6 }}>{item.evidence}</div>
                  </div>
                  <div style={{ fontSize: 12, fontFamily: MONO, color: C.textMuted, marginBottom: 14 }}>
                    Source: <a href={item.article.url} style={{ color: C.navy }}>{item.article.url}</a>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Button variant={lane === "corrections" ? "primary" : "gold"} onClick={onReview} style={{ fontSize: 14, padding: "8px 20px" }}>
                      Create Submission
                    </Button>
                    <Button variant="outline" onClick={() => dismissItem(item.id, lane)} style={{ fontSize: 14, padding: "8px 20px" }}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};

// ---- Mock review batch ----
const MOCK_BATCH = {
  narrative: "Across three articles covering the defamation suit, all conflate the First Amendment ruling (that the songs were protected speech) with the factual accuracy of claims made in them. The court did not rule on whether the officers actually did what the songs allege \u2014 only that the songs were protected artistic expression.",
  submissions: [
    { id: "s1", approved: true, url: "https://example.com/afroman-wins-lawsuit", headline: "Afroman Wins Defamation Suit, Proving Police Misconduct",
      analysis: { verdict: "correction", confidence: "high", originalHeadline: "Afroman Wins Defamation Suit, Proving Police Misconduct", replacement: "Court Rules Afroman's Songs Are Protected Speech, Dismisses Deputies' Defamation Claim",
        reasoning: "The headline conflates a First Amendment ruling with a factual finding. The court did not rule that the officers committed misconduct \u2014 it ruled that the songs, regardless of their accuracy, were protected artistic expression.",
        evidence: [{ description: "Court ruling emphasizes protected speech", url: "https://example.com/ruling-pdf" }, { description: "Legal analysis distinguishing the two issues", url: "https://example.com/law-review" }], inlineEdits: [] } },
    { id: "s2", approved: true, url: "https://example.com/music-video-verdict", headline: "Deputies Lose Lawsuit Over Afroman Music Videos",
      analysis: { verdict: "affirmation", confidence: "high", originalHeadline: "Deputies Lose Lawsuit Over Afroman Music Videos",
        reasoning: "This headline is accurate. It describes the legal outcome without making claims about the truth of the underlying allegations.",
        evidence: [{ description: "Matches court docket entry", url: "https://example.com/docket" }], inlineEdits: [] } },
    { id: "s3", approved: false, url: "https://example.com/rapper-exposes-cops", headline: "Rapper Exposes Corrupt Cops, Court Agrees",
      analysis: { verdict: "correction", confidence: "medium", originalHeadline: "Rapper Exposes Corrupt Cops, Court Agrees", replacement: "Court Protects Rapper's Speech; Does Not Rule on Accuracy of Claims",
        reasoning: "The phrase \"court agrees\" is false \u2014 the court made no finding about whether the deputies were corrupt.",
        evidence: [{ description: "Ruling does not address factual claims", url: "https://example.com/ruling-pdf" }], inlineEdits: [] } },
  ],
  vaultEntries: [
    { id: "v1", approved: true, entry: { type: "argument", content: "Protected speech \u2260 factually true claims. A court ruling that speech is protected under the First Amendment is not a finding about the accuracy of the underlying statements." } },
    { id: "v2", approved: true, entry: { type: "vault", assertion: "Adams County deputies were not criminally convicted of any misconduct related to the music videos.", evidence: "Court records show no criminal proceedings; the lawsuit was a civil defamation claim only." } },
  ],
};

// ---- Submission Editor ----
const SubmissionEditor = ({ submission, onUpdate }) => {
  const a = submission.analysis;
  function setAnalysis(patch) { onUpdate({ ...submission, analysis: { ...a, ...patch } }); }
  function updateEvidence(i, field, value) { const next = [...a.evidence]; next[i] = { ...next[i], [field]: value }; setAnalysis({ evidence: next }); }
  function addEvidence() { setAnalysis({ evidence: [...a.evidence, { description: "", url: "" }] }); }
  function removeEvidence(i) { setAnalysis({ evidence: a.evidence.filter((_, idx) => idx !== i) }); }
  const confBadge = { high: { background: "#D4EDDA", color: "#155724" }, medium: { background: "#FFF3CD", color: "#856404" }, low: { background: "#E8E8E8", color: "#555" } };

  return (
    <div style={{ opacity: submission.approved ? 1 : 0.5, transition: "opacity 0.2s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ color: C.navy, fontSize: 13, fontFamily: MONO, wordBreak: "break-all" }}>{submission.url}</span>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
          <input type="checkbox" checked={submission.approved} onChange={() => onUpdate({ ...submission, approved: !submission.approved })} style={{ width: 18, height: 18, accentColor: C.gold }} />
          {submission.approved ? "Approved" : "Excluded"}
        </label>
      </div>
      <div style={{ marginBottom: 20 }}>
        <Label>Verdict</Label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {["correction", "affirmation", "skip"].map((v) => <Button key={v} variant={a.verdict === v ? "primary" : "outline"} onClick={() => setAnalysis({ verdict: v })} style={{ fontSize: 13, padding: "6px 16px" }}>{v}</Button>)}
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, padding: "3px 10px", borderRadius: 12, fontWeight: 500, ...confBadge[a.confidence] }}>{a.confidence}</span>
        </div>
      </div>
      <div style={{ marginBottom: 20 }}><Label>Original Headline</Label><div style={{ padding: "10px 14px", background: C.linen, borderRadius: 4, fontSize: 15 }}>{a.originalHeadline}</div></div>
      {a.verdict === "correction" && <div style={{ marginBottom: 20 }}><Label>Corrected Headline</Label><input type="text" value={a.replacement || ""} onChange={(e) => setAnalysis({ replacement: e.target.value })} style={inputStyle} /></div>}
      <div style={{ marginBottom: 20 }}>
        <Label>Reasoning</Label>
        <textarea value={a.reasoning} onChange={(e) => setAnalysis({ reasoning: e.target.value })} style={{ ...inputStyle, minHeight: 100, resize: "vertical" }} />
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{a.reasoning.length}/2000 characters</div>
      </div>
      <div>
        <Label>Evidence</Label>
        {a.evidence.map((ev, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input type="text" placeholder="Description" value={ev.description} onChange={(e) => updateEvidence(i, "description", e.target.value)} style={{ ...inputStyle, flex: 2 }} />
            <input type="text" placeholder="URL" value={ev.url || ""} onChange={(e) => updateEvidence(i, "url", e.target.value)} style={{ ...inputStyle, flex: 1, fontFamily: MONO, fontSize: 12 }} />
            <Button variant="outline" onClick={() => removeEvidence(i)} style={{ padding: "6px 10px", fontSize: 12, color: C.error }}>{"\u2715"}</Button>
          </div>
        ))}
        <Button variant="outline" onClick={addEvidence} style={{ fontSize: 13, padding: "4px 12px" }}>+ Add Evidence</Button>
      </div>
    </div>
  );
};

// ---- Vault Entry Editor ----
const VaultEntryEditor = ({ ve, onUpdate }) => {
  const typeColors = { vault: C.navy, argument: C.success, translation: C.gold };
  const typeLabels = { vault: "Standing Correction", argument: "Argument", translation: "Translation" };
  return (
    <Card style={{ opacity: ve.approved ? 1 : 0.5, borderLeft: "4px solid " + typeColors[ve.entry.type], padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{typeLabels[ve.entry.type]}</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
          <input type="checkbox" checked={ve.approved} onChange={() => onUpdate({ ...ve, approved: !ve.approved })} style={{ width: 16, height: 16, accentColor: C.gold }} />
          {ve.approved ? "Include" : "Exclude"}
        </label>
      </div>
      {ve.entry.type === "vault" && (<><div style={{ marginBottom: 10 }}><Label>Factual Assertion</Label><textarea value={ve.entry.assertion || ""} onChange={(e) => onUpdate({ ...ve, entry: { ...ve.entry, assertion: e.target.value } })} style={{ ...inputStyle, minHeight: 60, fontSize: 14, resize: "vertical" }} /></div><div><Label>Evidence</Label><textarea value={ve.entry.evidence || ""} onChange={(e) => onUpdate({ ...ve, entry: { ...ve.entry, evidence: e.target.value } })} style={{ ...inputStyle, minHeight: 60, fontSize: 14, resize: "vertical" }} /></div></>)}
      {ve.entry.type === "argument" && (<div><Label>Argument / Logical Framework</Label><textarea value={ve.entry.content || ""} onChange={(e) => onUpdate({ ...ve, entry: { ...ve.entry, content: e.target.value } })} style={{ ...inputStyle, minHeight: 80, fontSize: 14, resize: "vertical" }} /></div>)}
    </Card>
  );
};

// ---- Review Screen ----
const ReviewScreen = ({ onBack, onSubmitted }) => {
  const [submissions, setSubmissions] = useState(MOCK_BATCH.submissions);
  const [vaultEntries, setVaultEntries] = useState(MOCK_BATCH.vaultEntries);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedOrgIds, setSelectedOrgIds] = useState(["org-gp"]);
  const [tab, setTab] = useState("submissions");
  const [showConfirm, setShowConfirm] = useState(false);
  const approvedCount = submissions.filter((s) => s.approved && s.analysis.verdict !== "skip").length;
  const approvedVaultCount = vaultEntries.filter((v) => v.approved).length;
  function updateSubmission(i, s) { const next = [...submissions]; next[i] = s; setSubmissions(next); }
  function updateVault(i, v) { const next = [...vaultEntries]; next[i] = v; setVaultEntries(next); }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: HEADING, color: C.navy, margin: 0, marginBottom: 4 }}>Review Submissions</h2>
          <span style={{ color: C.textMuted, fontSize: 14 }}>{submissions.length} submissions {"\u00b7"} {vaultEntries.length} vault entries</span>
        </div>
        <Button variant="outline" onClick={onBack} style={{ fontSize: 13 }}>{"\u2190"} Back</Button>
      </div>
      <div style={{ background: C.linen, padding: "14px 18px", borderRadius: 6, marginBottom: 20, borderLeft: "4px solid " + C.gold, fontStyle: "italic", fontSize: 15, lineHeight: 1.7 }}>
        <strong style={{ fontStyle: "normal" }}>Narrative: </strong>{MOCK_BATCH.narrative}
      </div>
      <div style={{ marginBottom: 20 }}><Label>Submit to Assemblies</Label><AssemblySelector selectedIds={selectedOrgIds} onChange={setSelectedOrgIds} /></div>
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid " + C.border }}>
        {["submissions", "vault"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 24px", fontSize: 15, border: "none", background: "none", cursor: "pointer", fontFamily: HEADING, fontWeight: 600, color: tab === t ? C.navy : C.textMuted, borderBottom: tab === t ? "3px solid " + C.gold : "3px solid transparent", marginBottom: -2 }}>
            {t === "submissions" ? "Submissions (" + submissions.length + ")" : "Vault (" + vaultEntries.length + ")"}
          </button>
        ))}
      </div>
      {tab === "submissions" && (
        <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
          <div style={{ width: 280, flexShrink: 0 }}>
            {submissions.map((sub, i) => {
              const vBadge = { correction: { background: "#F8D7DA", color: "#721C24" }, affirmation: { background: "#D4EDDA", color: "#155724" }, skip: { background: "#E8E8E8", color: "#555" } };
              return (<Card key={sub.id} onClick={() => setSelectedIndex(i)} style={{ padding: 12, marginBottom: 8, borderColor: i === selectedIndex ? C.gold : C.border, borderWidth: i === selectedIndex ? 2 : 1, opacity: sub.approved ? 1 : 0.5 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>{sub.headline.length > 60 ? sub.headline.substring(0, 60) + "..." : sub.headline}</div>
                <span style={{ fontFamily: MONO, fontSize: 12, padding: "3px 10px", borderRadius: 12, fontWeight: 500, ...vBadge[sub.analysis.verdict] }}>{sub.analysis.verdict}</span>
              </Card>);
            })}
          </div>
          <div style={{ flex: 1 }}><Card style={{ padding: 24 }}><SubmissionEditor submission={submissions[selectedIndex]} onUpdate={(s) => updateSubmission(selectedIndex, s)} /></Card></div>
        </div>
      )}
      {tab === "vault" && (<div style={{ marginBottom: 24 }}><p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>Shared facts, arguments, and translations. Edit once \u2014 applies everywhere.</p>{vaultEntries.map((ve, i) => <VaultEntryEditor key={ve.id} ve={ve} onUpdate={(v) => updateVault(i, v)} />)}</div>)}
      <div style={{ position: "sticky", bottom: 0, padding: "16px 0", marginTop: 16, background: C.vellum, borderTop: "2px solid " + C.gold, display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: C.textMuted, flex: 1 }}>{approvedCount} submissions + {approvedVaultCount} vault {"\u2192"} {selectedOrgIds.length} assembl{selectedOrgIds.length === 1 ? "y" : "ies"}</span>
        <Button variant="gold" onClick={() => setShowConfirm(true)} disabled={(approvedCount === 0 && approvedVaultCount === 0) || selectedOrgIds.length === 0} style={{ fontSize: 16, padding: "10px 28px" }}>Submit Approved ({approvedCount + approvedVaultCount})</Button>
      </div>
      {showConfirm && (
        <div onClick={() => setShowConfirm(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(27,42,74,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12, padding: "32px 36px", maxWidth: 520, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontFamily: HEADING, color: C.navy, marginTop: 0, marginBottom: 16 }}>Before you submit</h3>
            <p style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}>Your submissions will enter the Trust Assembly jury review process. Randomly selected members will evaluate each submission for accuracy, newsworthiness, and quality.</p>
            <p style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}><strong>Even if these arguments appear correct to you \u2014 even if they will be proven true in the course of time \u2014 we cannot guarantee that juries will approve them.</strong> The jury process is adversarial by design.</p>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: C.textMuted, marginBottom: 24 }}>Submissions that are rejected but later vindicated earn the Cassandra bonus.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <Button variant="outline" onClick={() => setShowConfirm(false)}>Go Back</Button>
              <Button variant="gold" onClick={() => { setShowConfirm(false); onSubmitted(); }} style={{ fontSize: 16, padding: "10px 28px" }}>I understand \u2014 Submit</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Settings Screen ----
const SettingsScreen = ({ agent }) => {
  const [username, setUsername] = useState(agent.username || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(agent.authenticated || false);
  const [agentType, setAgentType] = useState(agent.type || null);
  const [domainFocus, setDomainFocus] = useState(agent.status !== "setup" ? agent.domain : "");
  const [substackUrl, setSubstackUrl] = useState(agent.substackUrl || "");
  const [phantomName, setPhantomName] = useState(agent.type === "phantom" ? agent.name : "");
  const [monitoredEntities, setMonitoredEntities] = useState((agent.monitoredEntities || []).join(", "));
  const [reasoningPrompt, setReasoningPrompt] = useState(
    agent.id === "agent-alpha" ? "You are a legal fact-checker. Prioritize primary sources: court documents, official filings, and statutory text. Distinguish carefully between legal rulings on procedural/constitutional grounds versus rulings on factual merits."
    : agent.id === "agent-herald" ? "Monitor this author's publication. Flag any factual claims that could be submitted as corrections or affirmations. Focus on verifiable claims, not opinion."
    : agent.id === "agent-ward" ? "Monitor all mentions of the protected entities. Flag factual inaccuracies for correction and accurate positive coverage for affirmation. Prioritize high-reach publications. Ignore opinion pieces unless they contain verifiable factual claims."
    : ""
  );
  const [costLimit, setCostLimit] = useState("25.00");

  function derivePhantomName(url) { try { const m = url.match(/https?:\/\/([^.]+)\.substack\.com/); if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1) + " Phantom"; } catch(e){} return ""; }
  function handleSubstackChange(url) { setSubstackUrl(url); const d = derivePhantomName(url); if (d) setPhantomName(d); }

  const typeDescriptions = {
    sentinel: { title: "Sentinel", icon: "\u{1f6e1}\u{fe0f}", tagline: "Broad coverage across the internet", description: "Scans widely across news sources. You manually initiate fact-check runs on topics you care about." },
    phantom: { title: "Phantom", icon: "\u{1f47b}", tagline: "Automated feed monitoring", description: "Monitors a Substack feed and automatically scans new posts. Named after the author it watches." },
    ward: { title: "Ward", icon: "\u{1f6e1}", tagline: "Reputation defense", description: "Monitors mentions of you or your organization across the internet and flags inaccuracies for correction or accurate coverage for affirmation." },
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, padding: "16px 20px", background: "white", borderRadius: 8, border: "1px solid " + C.border }}>
        <AgentIcon agent={agent} size={48} showStatus />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: HEADING, fontWeight: 600, fontSize: 20, color: C.navy }}>{agent.status === "setup" ? "Set Up New Agent" : "Configure: " + agent.name}</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textMuted }}>
            {agent.status === "setup" ? "Register with your Trust Assembly credentials" : (typeDescriptions[agent.type]?.title || "") + " \u00b7 " + agent.domain}
          </div>
        </div>
      </div>

      {/* Auth */}
      <Card style={{ borderLeft: "4px solid " + C.navy }}>
        <h3 style={{ fontFamily: HEADING, color: C.navy, margin: "0 0 4px", fontSize: 18 }}>Trust Assembly Account</h3>
        <p style={{ fontSize: 13, color: C.textMuted, marginTop: 0, marginBottom: 14, lineHeight: 1.6 }}>Enter the credentials from when you registered this agent.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}>
          <div><Label>Agent Username</Label><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g., agent-alpha" style={{ ...inputStyle, fontFamily: MONO }} disabled={isAuthenticated} /></div>
          <div><Label>Password</Label><div style={{ position: "relative" }}><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isAuthenticated ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "Enter password"} style={{ ...inputStyle, fontFamily: MONO, paddingRight: 40 }} disabled={isAuthenticated} /><button onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: C.textMuted }}>{showPassword ? "Hide" : "Show"}</button></div></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isAuthenticated ? (<><span style={{ fontFamily: MONO, fontSize: 13, color: C.success, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.success, display: "inline-block" }} />Authenticated as {username}</span><button onClick={() => { setIsAuthenticated(false); setPassword(""); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.error, fontFamily: HEADING, fontWeight: 600 }}>Disconnect</button></>)
          : (<Button variant="primary" onClick={() => setIsAuthenticated(true)} disabled={!username || !password} style={{ fontSize: 14, padding: "8px 20px" }}>Authenticate</Button>)}
        </div>
      </Card>

      {/* Type */}
      <Card style={{ borderLeft: "4px solid " + C.gold }}>
        <h3 style={{ fontFamily: HEADING, color: C.navy, margin: "0 0 4px", fontSize: 18 }}>Agent Type</h3>
        <p style={{ fontSize: 13, color: C.textMuted, marginTop: 0, marginBottom: 16, lineHeight: 1.6 }}>Choose how this agent operates.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          {["sentinel", "phantom", "ward"].map((type) => {
            const info = typeDescriptions[type]; const selected = agentType === type;
            return (<div key={type} onClick={() => setAgentType(type)} style={{ padding: "16px 14px", borderRadius: 8, border: selected ? "2px solid " + C.gold : "2px solid " + C.border, background: selected ? C.gold + "0a" : "white", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>{info.icon}</span>
                <div style={{ fontFamily: HEADING, fontSize: 15, fontWeight: 700, color: C.navy }}>{info.title}</div>
                {selected && <span style={{ marginLeft: "auto", color: C.gold, fontSize: 16, fontWeight: 700 }}>{"\u2713"}</span>}
              </div>
              <div style={{ fontSize: 11, fontFamily: MONO, color: C.gold, marginBottom: 4 }}>{info.tagline}</div>
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>{info.description}</div>
            </div>);
          })}
        </div>
        <div><Label>Domain Focus</Label><input type="text" value={domainFocus} onChange={(e) => setDomainFocus(e.target.value)} placeholder="e.g., Legal & Policy, Science & Health" style={inputStyle} /><div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>The domain this agent builds reputation within</div></div>
      </Card>

      {/* Phantom config */}
      {agentType === "phantom" && (
        <Card style={{ borderLeft: "4px solid #8B5E3C" }}>
          <h3 style={{ fontFamily: HEADING, color: C.navy, margin: "0 0 12px", fontSize: 18 }}>{"\u{1f47b}"} Phantom Configuration</h3>
          <div style={{ marginBottom: 16 }}><Label>Substack Feed URL</Label><input type="text" value={substackUrl} onChange={(e) => handleSubstackChange(e.target.value)} placeholder="https://authorname.substack.com" style={{ ...inputStyle, fontFamily: MONO }} /></div>
          <div style={{ marginBottom: 16 }}><Label>Phantom Name</Label><input type="text" value={phantomName} readOnly style={{ ...inputStyle, background: C.linen, fontWeight: 600 }} /><div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>Auto-derived. Format: [Author] Phantom</div></div>
        </Card>
      )}

      {/* Ward config */}
      {agentType === "ward" && (
        <Card style={{ borderLeft: "4px solid " + C.ward }}>
          <h3 style={{ fontFamily: HEADING, color: C.navy, margin: "0 0 4px", fontSize: 18 }}>{"\u{1f6e1}"} Ward Configuration</h3>
          <p style={{ fontSize: 13, color: C.textMuted, marginTop: 0, marginBottom: 14, lineHeight: 1.6 }}>Define the entities this Ward protects. It will monitor the web for mentions and flag inaccuracies or accurate coverage.</p>
          <div style={{ marginBottom: 16 }}>
            <Label>Monitored Entities</Label>
            <textarea value={monitoredEntities} onChange={(e) => setMonitoredEntities(e.target.value)} placeholder="e.g., Acme Corp, Jane Doe CEO, Project Atlas" style={{ ...inputStyle, minHeight: 80, fontSize: 14, resize: "vertical" }} />
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>Comma-separated names, organizations, or topics to monitor</div>
          </div>
        </Card>
      )}

      {/* Reasoning */}
      <Card style={{ borderLeft: "4px solid " + C.success }}>
        <h3 style={{ fontFamily: HEADING, color: C.navy, margin: "0 0 4px", fontSize: 18 }}>Reasoning Instructions</h3>
        <p style={{ fontSize: 13, color: C.textMuted, marginTop: 0, marginBottom: 14, lineHeight: 1.6 }}>
          {agentType === "ward" ? "How should this Ward evaluate mentions? What counts as an inaccuracy worth flagging vs. normal editorial latitude?"
          : agentType === "phantom" ? "How should this Phantom evaluate posts for submission eligibility?"
          : "A persistent prompt shaping how this agent analyzes articles and reaches verdicts."}
        </p>
        <textarea value={reasoningPrompt} onChange={(e) => setReasoningPrompt(e.target.value)}
          placeholder={agentType === "ward" ? "e.g., Flag factual errors about our products, financial figures, or executive statements. Ignore opinion pieces unless they contain verifiable false claims. Prioritize publications with over 100k monthly readers."
          : agentType === "phantom" ? "e.g., Flag verifiable factual claims. Skip opinion and speculation. Cross-reference against primary sources."
          : "e.g., What standards of evidence should it apply? What sources should it prioritize?"}
          style={{ ...inputStyle, minHeight: 140, fontSize: 14, resize: "vertical", lineHeight: 1.7 }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>{reasoningPrompt.length}/4000</span>
          <span style={{ fontSize: 12, fontFamily: MONO, color: reasoningPrompt.length > 0 ? C.success : C.textMuted }}>{reasoningPrompt.length > 0 ? "\u2713 Active" : "Not set"}</span>
        </div>
      </Card>

      {/* Limits */}
      <Card style={{ borderLeft: "4px solid " + C.border }}>
        <h3 style={{ fontFamily: HEADING, color: C.navy, margin: "0 0 16px", fontSize: 18 }}>Limits</h3>
        <div style={{ maxWidth: 300 }}><Label>Monthly Spend Limit ($)</Label><input type="text" value={costLimit} onChange={(e) => setCostLimit(e.target.value)} style={{ ...inputStyle, fontFamily: MONO }} /><div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>Agent pauses when reached</div></div>
      </Card>

      {/* Save */}
      <div style={{ position: "sticky", bottom: 0, padding: "16px 0", marginTop: 8, background: C.vellum, borderTop: "2px solid " + C.gold, display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
        <span style={{ fontSize: 13, color: C.textMuted, flex: 1 }}>{agent.status === "setup" ? "Complete setup to activate" : "Changes apply to future runs"}</span>
        <Button variant="outline" style={{ fontSize: 14 }}>Discard</Button>
        <Button variant="gold" style={{ fontSize: 16, padding: "10px 28px" }}>{agent.status === "setup" ? "Create Agent" : "Save Settings"}</Button>
      </div>
    </div>
  );
};

// ---- App shell ----
const TrustAssemblyAgentPreview = () => {
  const [activeAgentId, setActiveAgentId] = useState("onetime");
  const [page, setPage] = useState("dashboard");
  // Demo toggle for user states
  const [userState, setUserState] = useState("has_account_has_agents"); // "no_account" | "has_account_no_agents" | "has_account_has_agents"

  const activeAgent = MOCK_AGENTS.find((a) => a.id === activeAgentId) || MOCK_AGENTS[0];

  // Filter visible agents based on user state
  const visibleAgents = userState === "has_account_has_agents"
    ? MOCK_AGENTS
    : MOCK_AGENTS.filter((a) => a.type === "onetime" || a.status === "setup");

  return (
    <div style={{ fontFamily: SERIF, background: C.vellum, color: C.text, minHeight: "100vh", lineHeight: 1.6 }}>
      {/* Demo state toggle — remove in production */}
      <div style={{
        background: "#333", padding: "8px 16px", display: "flex", alignItems: "center", gap: 12,
        fontSize: 12, fontFamily: MONO, color: "#aaa",
      }}>
        <span>Demo state:</span>
        {[
          { v: "no_account", l: "No Account" },
          { v: "has_account_no_agents", l: "Account, No Agents" },
          { v: "has_account_has_agents", l: "Account + Agents" },
        ].map((s) => (
          <button key={s.v} onClick={() => { setUserState(s.v); setActiveAgentId("onetime"); setPage("dashboard"); }}
            style={{
              background: userState === s.v ? C.gold : "#555", color: "white",
              border: "none", borderRadius: 4, padding: "4px 10px", cursor: "pointer",
              fontSize: 11, fontFamily: MONO,
            }}>{s.l}</button>
        ))}
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 32px" }}>
        <AgentTabBar activeAgentId={activeAgentId} onSelect={(id) => {
          if (!visibleAgents.find((a) => a.id === id)) return;
          setActiveAgentId(id);
          const sel = MOCK_AGENTS.find((a) => a.id === id);
          setPage(sel && sel.status === "setup" ? "settings" : "dashboard");
        }} agents={visibleAgents} />
        <div style={{ padding: "24px 0" }}>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 20, borderBottom: "2px solid " + C.gold, marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <img src={SCALES_ICON} alt="Trust Assembly" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
              <div>
                <h1 style={{ fontFamily: HEADING, color: C.navy, fontSize: 28, margin: 0, letterSpacing: 0.5 }}>Trust Assembly Agent</h1>
                <div style={{ fontSize: 14, color: C.textMuted, fontStyle: "italic" }}>Truth Will Out.</div>
              </div>
            </div>
            {activeAgent.type !== "onetime" && (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span onClick={() => setPage("dashboard")} style={{ color: C.navy, cursor: "pointer", fontSize: 15, fontFamily: HEADING, padding: "4px 10px", borderRadius: 4, background: page === "dashboard" ? C.linen : "transparent", borderBottom: page === "dashboard" ? "2px solid " + C.gold : "2px solid transparent" }}>Dashboard</span>
                <span onClick={() => setPage("settings")} style={{ color: C.navy, cursor: "pointer", fontSize: 15, fontFamily: HEADING, padding: "4px 10px", borderRadius: 4, background: page === "settings" ? C.linen : "transparent", borderBottom: page === "settings" ? "2px solid " + C.gold : "2px solid transparent" }}>Settings</span>
              </div>
            )}
          </header>

          {activeAgent.type === "onetime" && <OneTimeOnboarding onReview={() => setPage("review")} userState={userState} />}
          {activeAgent.type === "ward" && page === "dashboard" && <WardDashboard agent={activeAgent} onReview={() => setPage("review")} />}
          {activeAgent.type !== "onetime" && activeAgent.type !== "ward" && page === "dashboard" && <Dashboard onReview={() => setPage("review")} agent={activeAgent} />}
          {page === "review" && <ReviewScreen onBack={() => setPage("dashboard")} onSubmitted={() => setPage("dashboard")} />}
          {page === "settings" && activeAgent.type !== "onetime" && <SettingsScreen agent={activeAgent} />}
        </div>
      </div>
    </div>
  );
};

export default TrustAssemblyAgentPreview;

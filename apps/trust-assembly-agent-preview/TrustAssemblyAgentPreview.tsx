// Trust Assembly Agent — Preview File
// ------------------------------------
// Self-contained React component for Claude's preview environment.
// No external dependencies beyond React. Drop into a project and render
// <TrustAssemblyAgentPreview /> to see the full mocked flow.
//
// Screens included in Part 1:
//   - App shell (header + nav)
//   - Dashboard (topic form + mocked active run + ready-for-review card)
//
// Part 2 will add Review and Settings. Part 3 adds Setup/onboarding.

import React, { useState } from "react";

// ---- Design tokens (matches the desktop app exactly) ----
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
};

const SERIF = "'Source Serif 4', Georgia, serif";
const HEADING = "'EB Garamond', Georgia, serif";
const MONO = "'IBM Plex Mono', monospace";

// ---- Mock data ----
const MOCK_ACCOUNTS = [
  { accountId: "agent-alpha", taUsername: "agent-alpha", isDefault: true, authStatus: "authenticated" },
];

const MOCK_ASSEMBLIES = [
  { id: "org-gp", name: "General Public", member_count: 1247 },
  { id: "org-ohio", name: "Ohio Assembly", member_count: 89 },
  { id: "org-law", name: "Legal Assembly", member_count: 203 },
];

const SCOPE_PRESETS = [
  { label: "Top article", value: "single" },
  { label: "Top 3", value: "top3" },
  { label: "Top 10", value: "top10" },
  { label: "First 5 pages", value: "pages5" },
  { label: "As many as possible", value: "max" },
  { label: "Last 30 days", value: "30d" },
];

// ---- Small UI primitives ----
const Button: React.FC<{
  variant?: "primary" | "gold" | "outline";
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ variant = "primary", onClick, disabled, style, children }) => {
  const base: React.CSSProperties = {
    fontFamily: HEADING,
    fontSize: 16,
    padding: "10px 24px",
    border: "none",
    borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.2s ease",
    opacity: disabled ? 0.6 : 1,
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: C.navy, color: C.vellum },
    gold: { background: C.gold, color: "white" },
    outline: { background: "transparent", border: `1px solid ${C.navy}`, color: C.navy },
  };
  return (
    <button style={{ ...base, ...variants[variant], ...style }} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
};

const Card: React.FC<{ style?: React.CSSProperties; children: React.ReactNode; onClick?: () => void }> = ({
  style,
  children,
  onClick,
}) => (
  <div
    onClick={onClick}
    style={{
      background: "white",
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: 20,
      marginBottom: 16,
      cursor: onClick ? "pointer" : "default",
      ...style,
    }}
  >
    {children}
  </div>
);

const inputStyle: React.CSSProperties = {
  fontFamily: SERIF,
  fontSize: 15,
  padding: "10px 14px",
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  background: "white",
  color: C.text,
  width: "100%",
  outline: "none",
};

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label
    style={{
      display: "block",
      fontFamily: HEADING,
      fontSize: 15,
      fontWeight: 600,
      color: C.navy,
      marginBottom: 6,
    }}
  >
    {children}
  </label>
);

// ---- Dashboard ----
type DashboardProps = {
  onReview: () => void;
};

const Dashboard: React.FC<DashboardProps> = ({ onReview }) => {
  const [thesis, setThesis] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [when_, setWhen] = useState("");
  const [where_, setWhere] = useState("");
  const [why, setWhy] = useState("");
  const [activePreset, setActivePreset] = useState(0);
  const [selectedOrg, setSelectedOrg] = useState("org-gp");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"idle" | "searching" | "fetching" | "analyzing" | "synthesizing" | "ready">("idle");

  function startMockRun() {
    setRunning(true);
    setStage("searching");
    setProgress(10);
    // Simulate pipeline stages
    setTimeout(() => {
      setStage("fetching");
      setProgress(35);
    }, 900);
    setTimeout(() => {
      setStage("analyzing");
      setProgress(65);
    }, 1800);
    setTimeout(() => {
      setStage("synthesizing");
      setProgress(90);
    }, 2700);
    setTimeout(() => {
      setStage("ready");
      setProgress(100);
      setRunning(false);
    }, 3600);
  }

  const stageMessages: Record<string, string> = {
    searching: "Searching for articles...",
    fetching: "Fetching article contents...",
    analyzing: "Analyzing articles for factual accuracy...",
    synthesizing: "Synthesizing findings across articles...",
    ready: "Ready for review.",
  };

  return (
    <div>
      {/* Usage summary */}
      <div style={{ display: "flex", gap: 24, marginBottom: 20, fontSize: 13, color: C.textMuted }}>
        <span>
          Today: <strong style={{ fontFamily: MONO }}>$0.00</strong>
        </span>
        <span>
          This month: <strong style={{ fontFamily: MONO }}>$4.72</strong>
        </span>
        <span>
          All time: <strong style={{ fontFamily: MONO }}>$38.15</strong> (24 runs)
        </span>
      </div>

      {/* Topic card */}
      <Card style={{ borderColor: C.gold, borderWidth: 2 }}>
        <h3 style={{ fontFamily: HEADING, color: C.navy, marginBottom: 16, margin: 0, marginBlockEnd: 16 }}>
          What should we fact-check?
        </h3>

        <div style={{ marginBottom: 12 }}>
          <Label>What do you think is important to correct or affirm in the public understanding?</Label>
          <textarea
            value={thesis}
            onChange={(e) => setThesis(e.target.value)}
            placeholder="e.g., Many articles conflate the court finding the songs were protected speech with the factual claims in them being true."
            style={{ ...inputStyle, minHeight: 70, fontSize: 14, resize: "vertical" }}
            disabled={running}
          />
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
            This guides the AI's analysis — it will test your thesis across all articles it finds.
          </div>
        </div>

        {/* Collapsible WWWWW */}
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 0",
              fontFamily: HEADING,
              fontSize: 14,
              fontWeight: 600,
              color: C.gold,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                transform: showDetails ? "rotate(90deg)" : "none",
                transition: "transform 0.2s",
                display: "inline-block",
              }}
            >
              ▶
            </span>
            Details — Who, What, When, Where, Why
          </button>
          {showDetails && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", marginBottom: 12 }}>
                <div>
                  <Label>Who</Label>
                  <input
                    type="text"
                    value={who}
                    onChange={(e) => setWho(e.target.value)}
                    placeholder="e.g., Afroman, Adams County deputies"
                    style={inputStyle}
                    disabled={running}
                  />
                </div>
                <div>
                  <Label>What</Label>
                  <input
                    type="text"
                    value={what}
                    onChange={(e) => setWhat(e.target.value)}
                    placeholder="e.g., Defamation lawsuit over music videos"
                    style={inputStyle}
                    disabled={running}
                  />
                </div>
                <div>
                  <Label>When</Label>
                  <input
                    type="text"
                    value={when_}
                    onChange={(e) => setWhen(e.target.value)}
                    placeholder="e.g., March 2026"
                    style={inputStyle}
                    disabled={running}
                  />
                </div>
                <div>
                  <Label>Where</Label>
                  <input
                    type="text"
                    value={where_}
                    onChange={(e) => setWhere(e.target.value)}
                    placeholder="e.g., Adams County, Ohio"
                    style={inputStyle}
                    disabled={running}
                  />
                </div>
              </div>
              <div>
                <Label>Why is this story important?</Label>
                <input
                  type="text"
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  placeholder="e.g., Sets precedent for free speech vs defamation"
                  style={inputStyle}
                  disabled={running}
                />
              </div>
            </div>
          )}
        </div>

        {/* Scope + assembly row */}
        <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <Label>Search scope</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {SCOPE_PRESETS.map((preset, i) => {
                const active = activePreset === i;
                return (
                  <span
                    key={i}
                    onClick={() => !running && setActivePreset(i)}
                    style={{
                      fontFamily: MONO,
                      fontSize: 12,
                      padding: "4px 12px",
                      background: active ? C.navy : C.linen,
                      color: active ? "white" : C.text,
                      border: `1px solid ${active ? C.navy : C.border}`,
                      borderRadius: 16,
                      cursor: running ? "not-allowed" : "pointer",
                      userSelect: "none",
                    }}
                  >
                    {preset.label}
                  </span>
                );
              })}
            </div>
          </div>
          <div style={{ minWidth: 180 }}>
            <Label>Assembly</Label>
            <select
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              disabled={running}
              style={inputStyle}
            >
              {MOCK_ASSEMBLIES.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.member_count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Warning */}
        <div
          style={{
            background: "#FFF8E1",
            border: "1px solid #FFE082",
            borderRadius: 6,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 12,
            lineHeight: 1.6,
            color: "#5D4037",
          }}
        >
          <strong>Note:</strong> The AI follows evidence it finds, not the framing you provide. Results may not
          agree with your conclusions. Provide strong counter-evidence above as links or notes.
        </div>

        <Button
          variant="primary"
          onClick={startMockRun}
          disabled={running}
          style={{ width: "100%", fontSize: 18, padding: "12px 0" }}
        >
          {running ? "Running..." : "Run Fact-Check"}
        </Button>
      </Card>

      {/* Active run */}
      {stage !== "idle" && stage !== "ready" && (
        <Card style={{ borderLeft: `4px solid ${C.gold}` }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {thesis ? (thesis.length > 60 ? thesis.substring(0, 60) + "..." : thesis) : "Demo run"}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textMuted }}>
              3 found · 2 fetched · 1 analyzed
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{stageMessages[stage]}</div>
          <div
            style={{
              width: "100%",
              height: 8,
              background: C.linen,
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: C.gold,
                borderRadius: 4,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </Card>
      )}

      {/* Ready for review */}
      {stage === "ready" && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontFamily: HEADING, color: C.navy, marginBottom: 12 }}>Ready for Review</h3>
          <Card style={{ borderLeft: `4px solid ${C.success}` }} onClick={onReview}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                {thesis ? (thesis.length > 70 ? thesis.substring(0, 70) + "..." : thesis) : "Demo run"}
              </span>
              <Button variant="gold" style={{ fontSize: 13, padding: "6px 16px" }}>
                Review
              </Button>
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

// ---- App shell ----
const TrustAssemblyAgentPreview: React.FC = () => {
  const [page, setPage] = useState<"dashboard" | "review">("dashboard");

  return (
    <div
      style={{
        fontFamily: SERIF,
        background: C.vellum,
        color: C.text,
        minHeight: "100vh",
        lineHeight: 1.6,
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 32px" }}>
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 20,
            borderBottom: `2px solid ${C.gold}`,
            marginBottom: 32,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                background: C.navy,
                color: C.gold,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: HEADING,
                fontWeight: 700,
                fontSize: 22,
              }}
            >
              TA
            </div>
            <div>
              <h1 style={{ fontFamily: HEADING, color: C.navy, fontSize: 28, margin: 0, letterSpacing: 0.5 }}>
                Trust Assembly Agent
              </h1>
              <div style={{ fontSize: 14, color: C.textMuted, fontStyle: "italic" }}>Truth Will Out.</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span
              onClick={() => setPage("dashboard")}
              style={{
                color: C.navy,
                cursor: "pointer",
                fontSize: 15,
                fontFamily: HEADING,
                padding: "4px 10px",
                borderRadius: 4,
                background: page === "dashboard" ? C.linen : "transparent",
                borderBottom: page === "dashboard" ? `2px solid ${C.gold}` : "2px solid transparent",
              }}
            >
              Dashboard
            </span>
            <span
              style={{
                color: C.textMuted,
                fontSize: 15,
                fontFamily: HEADING,
                padding: "4px 10px",
              }}
            >
              Settings
            </span>
          </div>
        </header>

        {/* Page content */}
        {page === "dashboard" && <Dashboard onReview={() => setPage("review")} />}
        {page === "review" && (
          <div>
            <h2 style={{ fontFamily: HEADING, color: C.navy }}>Review Page (coming in Part 2)</h2>
            <p style={{ color: C.textMuted }}>
              In the next chunk I'll add the submission editor, vault entry editor, and submit confirmation
              dialog. For now, go back to the dashboard to see the pipeline animation.
            </p>
            <Button variant="outline" onClick={() => setPage("dashboard")}>
              ← Back to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrustAssemblyAgentPreview;

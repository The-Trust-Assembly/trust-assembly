// Trust Assembly Agent — Preview File
// ------------------------------------
// Self-contained React component for Claude's preview environment.
// No external dependencies beyond React. Drop into a project and render
// <TrustAssemblyAgentPreview /> to see the full mocked flow.
//
// Screens included:
//   Part 1: App shell + Dashboard (topic form + mocked pipeline)
//   Part 2: Review screen (submission editor, vault editor, submit dialog)
//
// Part 3 will add Setup/onboarding + Settings.

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

// ---- Mock review batch ----
const MOCK_BATCH = {
  narrative:
    "Across three articles covering the defamation suit, all conflate the First Amendment ruling (that the songs were protected speech) with the factual accuracy of claims made in them. The court did not rule on whether the officers actually did what the songs allege — only that the songs were protected artistic expression.",
  submissions: [
    {
      id: "s1",
      approved: true,
      url: "https://example.com/afroman-wins-lawsuit",
      headline: "Afroman Wins Defamation Suit, Proving Police Misconduct",
      analysis: {
        verdict: "correction" as const,
        confidence: "high" as const,
        originalHeadline: "Afroman Wins Defamation Suit, Proving Police Misconduct",
        replacement: "Court Rules Afroman's Songs Are Protected Speech, Dismisses Deputies' Defamation Claim",
        reasoning:
          "The headline conflates a First Amendment ruling with a factual finding. The court did not rule that the officers committed misconduct — it ruled that the songs, regardless of their accuracy, were protected artistic expression. The deputies' defamation claim was dismissed on speech grounds, not on the merits of the underlying accusations.",
        evidence: [
          {
            description: "Court ruling emphasizes protected speech, not fact-finding",
            url: "https://example.com/ruling-pdf",
          },
          { description: "Legal analysis distinguishing the two issues", url: "https://example.com/law-review" },
        ],
        inlineEdits: [],
      },
    },
    {
      id: "s2",
      approved: true,
      url: "https://example.com/music-video-verdict",
      headline: "Deputies Lose Lawsuit Over Afroman Music Videos",
      analysis: {
        verdict: "affirmation" as const,
        confidence: "high" as const,
        originalHeadline: "Deputies Lose Lawsuit Over Afroman Music Videos",
        reasoning:
          "This headline is accurate. It describes the legal outcome (deputies lost their lawsuit) without making claims about the truth of the underlying allegations in the songs.",
        evidence: [{ description: "Matches court docket entry", url: "https://example.com/docket" }],
        inlineEdits: [],
      },
    },
    {
      id: "s3",
      approved: false,
      url: "https://example.com/rapper-exposes-cops",
      headline: "Rapper Exposes Corrupt Cops, Court Agrees",
      analysis: {
        verdict: "correction" as const,
        confidence: "medium" as const,
        originalHeadline: "Rapper Exposes Corrupt Cops, Court Agrees",
        replacement: "Court Protects Rapper's Speech; Does Not Rule on Accuracy of Claims",
        reasoning:
          'The phrase "court agrees" is false — the court made no finding about whether the deputies were corrupt. The court only ruled that Afroman\'s songs were protected speech regardless of their factual accuracy.',
        evidence: [{ description: "Ruling does not address factual claims", url: "https://example.com/ruling-pdf" }],
        inlineEdits: [],
      },
    },
  ],
  vaultEntries: [
    {
      id: "v1",
      approved: true,
      entry: {
        type: "argument" as const,
        content:
          "Protected speech ≠ factually true claims. A court ruling that speech is protected under the First Amendment is not a finding about the accuracy of the underlying statements.",
      },
    },
    {
      id: "v2",
      approved: true,
      entry: {
        type: "vault" as const,
        assertion: "Adams County deputies were not criminally convicted of any misconduct related to the music videos.",
        evidence: "Court records show no criminal proceedings; the lawsuit was a civil defamation claim only.",
      },
    },
  ],
};

// ---- Submission Editor ----
type SubmissionEditorProps = {
  submission: typeof MOCK_BATCH.submissions[number];
  onUpdate: (s: typeof MOCK_BATCH.submissions[number]) => void;
};

const SubmissionEditor: React.FC<SubmissionEditorProps> = ({ submission, onUpdate }) => {
  const a = submission.analysis;
  function setAnalysis(patch: Partial<typeof a>) {
    onUpdate({ ...submission, analysis: { ...a, ...patch } });
  }
  function updateEvidence(i: number, field: "description" | "url", value: string) {
    const next = [...a.evidence];
    next[i] = { ...next[i], [field]: value };
    setAnalysis({ evidence: next });
  }
  function addEvidence() {
    setAnalysis({ evidence: [...a.evidence, { description: "", url: "" }] });
  }
  function removeEvidence(i: number) {
    setAnalysis({ evidence: a.evidence.filter((_, idx) => idx !== i) });
  }

  const confBadge: Record<string, React.CSSProperties> = {
    high: { background: "#D4EDDA", color: "#155724" },
    medium: { background: "#FFF3CD", color: "#856404" },
    low: { background: "#E8E8E8", color: "#555" },
  };

  return (
    <div style={{ opacity: submission.approved ? 1 : 0.5, transition: "opacity 0.2s" }}>
      {/* URL + approve */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ color: C.navy, fontSize: 13, fontFamily: MONO, wordBreak: "break-all" }}>
          {submission.url}
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={submission.approved}
            onChange={() => onUpdate({ ...submission, approved: !submission.approved })}
            style={{ width: 18, height: 18, accentColor: C.gold }}
          />
          {submission.approved ? "Approved" : "Excluded"}
        </label>
      </div>

      {/* Verdict */}
      <div style={{ marginBottom: 20 }}>
        <Label>Verdict</Label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {(["correction", "affirmation", "skip"] as const).map((v) => (
            <Button
              key={v}
              variant={a.verdict === v ? "primary" : "outline"}
              onClick={() => setAnalysis({ verdict: v })}
              style={{ fontSize: 13, padding: "6px 16px" }}
            >
              {v}
            </Button>
          ))}
          <span
            style={{
              marginLeft: "auto",
              fontFamily: MONO,
              fontSize: 12,
              padding: "3px 10px",
              borderRadius: 12,
              fontWeight: 500,
              ...confBadge[a.confidence],
            }}
          >
            {a.confidence}
          </span>
        </div>
      </div>

      {/* Original headline */}
      <div style={{ marginBottom: 20 }}>
        <Label>Original Headline</Label>
        <div style={{ padding: "10px 14px", background: C.linen, borderRadius: 4, fontSize: 15 }}>
          {a.originalHeadline}
        </div>
      </div>

      {/* Replacement */}
      {a.verdict === "correction" && (
        <div style={{ marginBottom: 20 }}>
          <Label>Corrected Headline</Label>
          <input
            type="text"
            value={a.replacement || ""}
            onChange={(e) => setAnalysis({ replacement: e.target.value })}
            style={inputStyle}
          />
        </div>
      )}

      {/* Reasoning */}
      <div style={{ marginBottom: 20 }}>
        <Label>Reasoning</Label>
        <textarea
          value={a.reasoning}
          onChange={(e) => setAnalysis({ reasoning: e.target.value })}
          style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
        />
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
          {a.reasoning.length}/2000 characters
        </div>
      </div>

      {/* Evidence */}
      <div>
        <Label>Evidence</Label>
        {a.evidence.map((ev, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              placeholder="Description"
              value={ev.description}
              onChange={(e) => updateEvidence(i, "description", e.target.value)}
              style={{ ...inputStyle, flex: 2 }}
            />
            <input
              type="text"
              placeholder="URL"
              value={ev.url || ""}
              onChange={(e) => updateEvidence(i, "url", e.target.value)}
              style={{ ...inputStyle, flex: 1, fontFamily: MONO, fontSize: 12 }}
            />
            <Button
              variant="outline"
              onClick={() => removeEvidence(i)}
              style={{ padding: "6px 10px", fontSize: 12, color: C.error }}
            >
              ✕
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={addEvidence} style={{ fontSize: 13, padding: "4px 12px" }}>
          + Add Evidence
        </Button>
      </div>
    </div>
  );
};

// ---- Vault Entry Editor ----
type VaultEntry = typeof MOCK_BATCH.vaultEntries[number];

const VaultEntryEditor: React.FC<{
  ve: VaultEntry;
  onUpdate: (v: VaultEntry) => void;
}> = ({ ve, onUpdate }) => {
  const typeColors: Record<string, string> = {
    vault: C.navy,
    argument: C.success,
    translation: C.gold,
  };
  const typeLabels: Record<string, string> = {
    vault: "Standing Correction",
    argument: "Argument",
    translation: "Translation",
  };

  return (
    <Card
      style={{
        opacity: ve.approved ? 1 : 0.5,
        borderLeft: `4px solid ${typeColors[ve.entry.type]}`,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{typeLabels[ve.entry.type]}</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={ve.approved}
            onChange={() => onUpdate({ ...ve, approved: !ve.approved })}
            style={{ width: 16, height: 16, accentColor: C.gold }}
          />
          {ve.approved ? "Include" : "Exclude"}
        </label>
      </div>

      {ve.entry.type === "vault" && (
        <>
          <div style={{ marginBottom: 10 }}>
            <Label>Factual Assertion</Label>
            <textarea
              value={ve.entry.assertion || ""}
              onChange={(e) => onUpdate({ ...ve, entry: { ...ve.entry, assertion: e.target.value } })}
              style={{ ...inputStyle, minHeight: 60, fontSize: 14, resize: "vertical" }}
            />
          </div>
          <div>
            <Label>Evidence</Label>
            <textarea
              value={ve.entry.evidence || ""}
              onChange={(e) => onUpdate({ ...ve, entry: { ...ve.entry, evidence: e.target.value } })}
              style={{ ...inputStyle, minHeight: 60, fontSize: 14, resize: "vertical" }}
            />
          </div>
        </>
      )}

      {ve.entry.type === "argument" && (
        <div>
          <Label>Argument / Logical Framework</Label>
          <textarea
            value={ve.entry.content || ""}
            onChange={(e) => onUpdate({ ...ve, entry: { ...ve.entry, content: e.target.value } })}
            style={{ ...inputStyle, minHeight: 80, fontSize: 14, resize: "vertical" }}
          />
        </div>
      )}
    </Card>
  );
};

// ---- Review Screen ----
const ReviewScreen: React.FC<{ onBack: () => void; onSubmitted: () => void }> = ({ onBack, onSubmitted }) => {
  const [submissions, setSubmissions] = useState(MOCK_BATCH.submissions);
  const [vaultEntries, setVaultEntries] = useState(MOCK_BATCH.vaultEntries);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>(["org-gp"]);
  const [tab, setTab] = useState<"submissions" | "vault">("submissions");
  const [showConfirm, setShowConfirm] = useState(false);

  const approvedCount = submissions.filter((s) => s.approved && s.analysis.verdict !== "skip").length;
  const approvedVaultCount = vaultEntries.filter((v) => v.approved).length;

  function toggleOrg(orgId: string) {
    setSelectedOrgIds((prev) =>
      prev.includes(orgId) ? prev.filter((id) => id !== orgId) : [...prev, orgId]
    );
  }

  function updateSubmission(i: number, s: typeof submissions[number]) {
    const next = [...submissions];
    next[i] = s;
    setSubmissions(next);
  }

  function updateVault(i: number, v: VaultEntry) {
    const next = [...vaultEntries];
    next[i] = v;
    setVaultEntries(next);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: HEADING, color: C.navy, margin: 0, marginBottom: 4 }}>Review Submissions</h2>
          <span style={{ color: C.textMuted, fontSize: 14 }}>
            {submissions.length} submissions · {vaultEntries.length} vault entries
          </span>
        </div>
        <Button variant="outline" onClick={onBack} style={{ fontSize: 13 }}>
          ← Back
        </Button>
      </div>

      {/* Narrative */}
      <div
        style={{
          background: C.linen,
          padding: "14px 18px",
          borderRadius: 6,
          marginBottom: 20,
          borderLeft: `4px solid ${C.gold}`,
          fontStyle: "italic",
          fontSize: 15,
          lineHeight: 1.7,
        }}
      >
        <strong style={{ fontStyle: "normal" }}>Narrative: </strong>
        {MOCK_BATCH.narrative}
      </div>

      {/* Assembly chips */}
      <div style={{ marginBottom: 20 }}>
        <Label>Submit to Assemblies</Label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {MOCK_ASSEMBLIES.map((org) => {
            const selected = selectedOrgIds.includes(org.id);
            return (
              <span
                key={org.id}
                onClick={() => toggleOrg(org.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: 13,
                  background: selected ? C.navy : C.linen,
                  color: selected ? "white" : C.text,
                  border: `1px solid ${selected ? C.navy : C.border}`,
                  userSelect: "none",
                }}
              >
                {selected ? "✓ " : ""}
                {org.name}
              </span>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `2px solid ${C.border}` }}>
        {(["submissions", "vault"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 24px",
              fontSize: 15,
              border: "none",
              background: "none",
              cursor: "pointer",
              fontFamily: HEADING,
              fontWeight: 600,
              color: tab === t ? C.navy : C.textMuted,
              borderBottom: tab === t ? `3px solid ${C.gold}` : "3px solid transparent",
              marginBottom: -2,
            }}
          >
            {t === "submissions" ? `Submissions (${submissions.length})` : `Vault Entries (${vaultEntries.length})`}
          </button>
        ))}
      </div>

      {/* Submissions tab */}
      {tab === "submissions" && (
        <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
          <div style={{ width: 280, flexShrink: 0 }}>
            {submissions.map((sub, i) => {
              const vBadge: Record<string, React.CSSProperties> = {
                correction: { background: "#F8D7DA", color: "#721C24" },
                affirmation: { background: "#D4EDDA", color: "#155724" },
                skip: { background: "#E8E8E8", color: "#555" },
              };
              return (
                <Card
                  key={sub.id}
                  onClick={() => setSelectedIndex(i)}
                  style={{
                    padding: 12,
                    marginBottom: 8,
                    borderColor: i === selectedIndex ? C.gold : C.border,
                    borderWidth: i === selectedIndex ? 2 : 1,
                    opacity: sub.approved ? 1 : 0.5,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>
                    {sub.headline.length > 60 ? sub.headline.substring(0, 60) + "..." : sub.headline}
                  </div>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 12,
                      padding: "3px 10px",
                      borderRadius: 12,
                      fontWeight: 500,
                      ...vBadge[sub.analysis.verdict],
                    }}
                  >
                    {sub.analysis.verdict}
                  </span>
                </Card>
              );
            })}
          </div>

          <div style={{ flex: 1 }}>
            <Card style={{ padding: 24 }}>
              <SubmissionEditor
                submission={submissions[selectedIndex]}
                onUpdate={(s) => updateSubmission(selectedIndex, s)}
              />
            </Card>
          </div>
        </div>
      )}

      {/* Vault tab */}
      {tab === "vault" && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>
            Shared facts, arguments, and translations that apply across all articles. Edit once — applies everywhere.
          </p>
          {vaultEntries.map((ve, i) => (
            <VaultEntryEditor key={ve.id} ve={ve} onUpdate={(v) => updateVault(i, v)} />
          ))}
        </div>
      )}

      {/* Sticky submit bar */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          padding: "16px 0",
          marginTop: 16,
          background: C.vellum,
          borderTop: `2px solid ${C.gold}`,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 13, color: C.textMuted, flex: 1 }}>
          {approvedCount} submissions + {approvedVaultCount} vault → {selectedOrgIds.length}{" "}
          assembl{selectedOrgIds.length === 1 ? "y" : "ies"}
        </span>
        <Button
          variant="gold"
          onClick={() => setShowConfirm(true)}
          disabled={(approvedCount === 0 && approvedVaultCount === 0) || selectedOrgIds.length === 0}
          style={{ fontSize: 16, padding: "10px 28px" }}
        >
          Submit Approved ({approvedCount + approvedVaultCount})
        </Button>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <div
          onClick={() => setShowConfirm(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(27, 42, 74, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: 12,
              padding: "32px 36px",
              maxWidth: 520,
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontFamily: HEADING, color: C.navy, marginTop: 0, marginBottom: 16 }}>
              Before you submit
            </h3>
            <p style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}>
              Your submissions will enter the Trust Assembly jury review process. Randomly selected members of
              your Assembly will evaluate each submission for accuracy, newsworthiness, and quality.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}>
              <strong>
                Even if these arguments appear correct to you — even if they will be proven true in the course of
                time — we cannot guarantee that juries will approve them.
              </strong>{" "}
              The jury process is adversarial by design.
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: C.textMuted, marginBottom: 24 }}>
              Submissions that are rejected but later vindicated earn the Cassandra bonus.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <Button variant="outline" onClick={() => setShowConfirm(false)}>
                Go Back
              </Button>
              <Button
                variant="gold"
                onClick={() => {
                  setShowConfirm(false);
                  onSubmitted();
                }}
                style={{ fontSize: 16, padding: "10px 28px" }}
              >
                I understand — Submit
              </Button>
            </div>
          </div>
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
          <ReviewScreen onBack={() => setPage("dashboard")} onSubmitted={() => setPage("dashboard")} />
        )}
      </div>
    </div>
  );
};

export default TrustAssemblyAgentPreview;

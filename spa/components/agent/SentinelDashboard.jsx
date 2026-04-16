import React, { useState, useEffect } from "react";

// Trust Assembly Agent — Sentinel dashboard
// -------------------------------------------
// Main workspace for a Sentinel agent. Flow:
//   1. User types a thesis (and optionally who/what/when/where/why)
//   2. Click "Generate Keywords" → POST /api/agent/keywords → editable chips
//   3. User adds/removes keywords, sees live cost estimate
//   4. Click "Search with N Keywords" → POST /api/agent/run →
//      POST /api/agent/process/[id] (fire-and-forget)
//   5. Run appears in Recent Runs list, auto-polls for status updates
//   6. When status='ready', user clicks Review → AgentReviewPanel
//
// Stage B: The keyword step uses the mock /api/agent/keywords endpoint
// (mechanical extraction). Stage C will replace it with a real Sonnet
// call that generates 7–15 genuinely useful keywords.

const SCOPE_PRESETS = [
  { label: "Top article", value: "single" },
  { label: "Top 3", value: "top3" },
  { label: "Top 10", value: "top10" },
  { label: "First 5 pages", value: "pages5" },
  { label: "As many as possible", value: "max" },
  { label: "Last 30 days", value: "30d" },
];

const STATUS_COLORS = {
  queued: "var(--text-muted)",
  searching: "var(--gold)",
  filtering: "var(--gold)",
  fetching: "var(--gold)",
  analyzing: "var(--gold)",
  synthesizing: "var(--gold)",
  ready: "var(--green)",
  submitting: "var(--gold)",
  completed: "var(--green)",
  failed: "var(--red)",
  cancelled: "var(--text-muted)",
};

function fmtTimestamp(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SentinelDashboard({ agent, onReview }) {
  const [thesis, setThesis] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [when_, setWhen] = useState("");
  const [where_, setWhere] = useState("");
  const [why, setWhy] = useState("");
  const [activePreset, setActivePreset] = useState(0);

  // Keyword step
  const [keywords, setKeywords] = useState([]);
  const [showKeywords, setShowKeywords] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [generatingKeywords, setGeneratingKeywords] = useState(false);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [recentRuns, setRecentRuns] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  async function loadRecentRuns() {
    try {
      const res = await fetch("/api/agent/runs?limit=20");
      if (res.ok) {
        const data = await res.json();
        setRecentRuns(data.runs || []);
      }
    } catch {}
    finally {
      setLoadingRuns(false);
    }
  }

  useEffect(() => {
    loadRecentRuns();
  }, []);

  // Poll while any run is in a non-terminal state
  useEffect(() => {
    const ACTIVE = ["queued", "searching", "filtering", "fetching", "analyzing", "synthesizing", "submitting"];
    const hasActive = recentRuns.some((r) => ACTIVE.includes(r.status));
    if (!hasActive) return;
    const interval = setInterval(loadRecentRuns, 3000);
    return () => clearInterval(interval);
  }, [recentRuns]);

  async function handleGenerateKeywords() {
    if (!thesis.trim()) {
      setError("Please enter a thesis first.");
      return;
    }
    setError("");
    setGeneratingKeywords(true);
    try {
      const res = await fetch("/api/agent/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis: thesis.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setKeywords(data.keywords || []);
        setShowKeywords(true);
      } else {
        setError(data.error || "Failed to generate keywords.");
      }
    } catch (e) {
      setError(e.message || "Network error.");
    } finally {
      setGeneratingKeywords(false);
    }
  }

  function removeKeyword(i) {
    setKeywords(keywords.filter((_, idx) => idx !== i));
  }

  function addKeyword() {
    const k = newKeyword.trim();
    if (k && !keywords.includes(k)) {
      setKeywords([...keywords, k]);
      setNewKeyword("");
    }
  }

  async function handleRun() {
    if (keywords.length === 0) {
      setError("Add at least one keyword.");
      return;
    }
    setError("");
    setMessage("");
    setRunning(true);

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thesis: thesis.trim(),
          scope: SCOPE_PRESETS[activePreset].value,
          keywords: keywords,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // Fire-and-forget pipeline kickoff
        fetch(`/api/agent/process/${data.runId}`, { method: "POST" }).catch(() => {});
        setMessage(`Run started (${data.runId.substring(0, 8)}…). Watch progress below.`);
        // Reset form
        setThesis("");
        setShowKeywords(false);
        setKeywords([]);
        loadRecentRuns();
      } else {
        setError(data.error || "Failed to start run.");
      }
    } catch (e) {
      setError(e.message || "Network error.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 24px" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 className="ta-section-head">
          {agent?.name || "Sentinel"}
          {agent?.domain && (
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-muted)", marginLeft: 10 }}>
              · {agent.domain}
            </span>
          )}
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Enter a thesis, review the generated keywords, and run a fact-check across the open web.
        </p>
      </div>

      {/* Thesis form */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "2px solid var(--gold)",
          borderRadius: 8,
          padding: "20px 24px",
          marginBottom: 20,
        }}
      >
        <label
          style={{
            display: "block",
            fontFamily: "var(--serif)",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text)",
            marginBottom: 6,
          }}
        >
          What do you think is important to correct or affirm in the public understanding?
        </label>
        <textarea
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          disabled={running || showKeywords}
          placeholder="e.g., Many articles conflate the court's First Amendment ruling with a factual finding about the underlying allegations."
          style={{
            width: "100%",
            minHeight: 90,
            padding: "10px 12px",
            fontFamily: "var(--serif)",
            fontSize: 13,
            border: "1px solid var(--border)",
            borderRadius: 4,
            background: "var(--bg)",
            color: "var(--text)",
            resize: "vertical",
          }}
        />

        {/* Keyword step */}
        {!showKeywords && (
          <button
            className="ta-btn-primary"
            onClick={handleGenerateKeywords}
            disabled={generatingKeywords || !thesis.trim()}
            style={{ width: "100%", marginTop: 14, fontSize: 14, padding: "10px 0" }}
          >
            {generatingKeywords ? "Generating keywords…" : "Generate Keywords →"}
          </button>
        )}

        {showKeywords && (
          <>
            <div style={{ marginTop: 16 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--serif)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text)",
                  marginBottom: 6,
                }}
              >
                Search Keywords{" "}
                <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                  ({keywords.length} · click ✕ to remove)
                </span>
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {keywords.map((k, i) => (
                  <span
                    key={`${k}-${i}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      fontSize: 12,
                      fontFamily: "var(--mono)",
                      color: "var(--text)",
                    }}
                  >
                    {k}
                    <button
                      onClick={() => removeKeyword(i)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: 13,
                        padding: 0,
                        lineHeight: 1,
                      }}
                      aria-label={`Remove ${k}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>

              {/* Add keyword input */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addKeyword();
                    }
                  }}
                  placeholder="Add a keyword and press Enter"
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    background: "var(--bg)",
                    color: "var(--text)",
                  }}
                />
                <button
                  type="button"
                  className="ta-btn-secondary"
                  onClick={addKeyword}
                  disabled={!newKeyword.trim()}
                  style={{ fontSize: 12, padding: "6px 14px" }}
                >
                  Add
                </button>
              </div>
            </div>

            {/* Scope presets */}
            <div style={{ marginTop: 12 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--serif)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text)",
                  marginBottom: 6,
                }}
              >
                Search Scope
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {SCOPE_PRESETS.map((p, i) => {
                  const active = activePreset === i;
                  return (
                    <span
                      key={p.value}
                      onClick={() => !running && setActivePreset(i)}
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        padding: "4px 12px",
                        background: active ? "var(--text)" : "var(--bg)",
                        color: active ? "var(--card-bg)" : "var(--text)",
                        border: `1px solid ${active ? "var(--text)" : "var(--border)"}`,
                        borderRadius: 14,
                        cursor: running ? "not-allowed" : "pointer",
                        userSelect: "none",
                      }}
                    >
                      {p.label}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Submit row */}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="ta-btn-secondary"
                onClick={() => {
                  setShowKeywords(false);
                  setKeywords([]);
                }}
                disabled={running}
                style={{ fontSize: 13 }}
              >
                ← Edit Thesis
              </button>
              <button
                className="ta-btn-primary"
                onClick={handleRun}
                disabled={running || keywords.length === 0}
                style={{ flex: 1, fontSize: 14, padding: "10px 0" }}
              >
                {running
                  ? "Starting…"
                  : `Search with ${keywords.length} Keyword${keywords.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(196, 77, 77, 0.1)",
              border: "1px solid var(--red)",
              borderRadius: 4,
              color: "var(--red)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {message && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(74, 140, 92, 0.1)",
              border: "1px solid var(--green)",
              borderRadius: 4,
              color: "var(--green)",
              fontSize: 13,
            }}
          >
            {message}
          </div>
        )}
      </div>

      {/* Recent runs */}
      <div style={{ marginTop: 24 }}>
        <h3
          style={{
            fontFamily: "var(--serif)",
            fontSize: 16,
            fontWeight: 600,
            color: "var(--text)",
            marginBottom: 10,
          }}
        >
          Recent Runs
        </h3>
        {loadingRuns ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13, fontStyle: "italic" }}>Loading…</div>
        ) : recentRuns.length === 0 ? (
          <div
            style={{
              padding: "16px 20px",
              background: "var(--card-bg)",
              border: "1px dashed var(--border)",
              borderRadius: 6,
              color: "var(--text-muted)",
              fontSize: 13,
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            No runs yet. Start one above.
          </div>
        ) : (
          recentRuns.map((run) => (
            <div
              key={run.id}
              style={{
                padding: "12px 16px",
                marginBottom: 8,
                background: "var(--card-bg)",
                border: "1px solid var(--border)",
                borderLeft: `4px solid ${STATUS_COLORS[run.status] || "var(--text-muted)"}`,
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 4,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, flex: 1 }}>
                  {run.thesis.length > 100 ? run.thesis.substring(0, 100) + "…" : run.thesis}
                </div>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: "var(--bg)",
                    color: STATUS_COLORS[run.status] || "var(--text-muted)",
                    border: `1px solid ${STATUS_COLORS[run.status] || "var(--border)"}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {run.status}
                </span>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
                <span>{fmtTimestamp(run.created_at)}</span>
                {run.articles_found > 0 && (
                  <span>
                    {run.articles_found} found · {run.articles_fetched} fetched · {run.articles_analyzed} analyzed
                  </span>
                )}
                {run.estimated_cost_usd > 0 && (
                  <span style={{ fontFamily: "var(--mono)" }}>${Number(run.estimated_cost_usd).toFixed(2)}</span>
                )}
              </div>
              {run.stage_message &&
                run.status !== "ready" &&
                run.status !== "failed" &&
                run.status !== "cancelled" &&
                run.status !== "completed" && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                    {run.stage_message}
                  </div>
                )}
              {run.progress_pct > 0 && run.progress_pct < 100 && (
                <div
                  style={{
                    marginTop: 6,
                    height: 4,
                    background: "var(--bg)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${run.progress_pct}%`,
                      background: STATUS_COLORS[run.status] || "var(--gold)",
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              )}
              {run.error_message && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--red)" }}>{run.error_message}</div>
              )}
              {run.status === "ready" && (
                <div style={{ marginTop: 8 }}>
                  <button
                    className="ta-btn-primary"
                    onClick={() => onReview && onReview(run.id)}
                    style={{ fontSize: 11, padding: "5px 14px" }}
                  >
                    Review &amp; Submit →
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

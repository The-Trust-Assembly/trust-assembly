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

const PLATFORM_OPTIONS = [
  { id: "news", label: "News / Web", sitePrefix: null, tip: "Searches the open web. Best for news articles, blogs, and public reports." },
  { id: "twitter", label: "Twitter / X", sitePrefix: "site:x.com", tip: "Searches public tweets and threads. Replies and quote tweets may not appear. Private/protected accounts are excluded." },
  { id: "youtube", label: "YouTube", sitePrefix: "site:youtube.com", tip: "Finds video pages by title and description. Cannot analyze the video itself — only the page text, title, and description are checked." },
  { id: "reddit", label: "Reddit", sitePrefix: "site:reddit.com", tip: "Searches public posts and comments. Best for threads with factual claims. Some subreddits restrict indexing." },
  { id: "wikipedia", label: "Wikipedia", sitePrefix: "site:wikipedia.org", tip: "Searches Wikipedia articles. Useful for cross-referencing factual claims against the encyclopedia." },
  { id: "substack", label: "Substack", sitePrefix: "site:substack.com", tip: "Searches public Substack posts. Paywalled content behind the fold won't be extracted." },
  { id: "medium", label: "Medium", sitePrefix: "site:medium.com", tip: "Searches public Medium articles. Metered/paywalled posts may only return partial content." },
  { id: "facebook", label: "Facebook", sitePrefix: "site:facebook.com", tip: "Limited — most Facebook content requires login. Only public pages and posts are searchable." },
];

const SCOPE_PRESETS = [
  { label: "Quick (3 articles)", value: "quick", credits: 1 },
  { label: "Standard (5 articles)", value: "standard", credits: 2 },
  { label: "Deep (8 articles)", value: "deep", credits: 4 },
  { label: "Comprehensive (12 articles)", value: "comprehensive", credits: 8 },
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

const ACTIVE_STATUSES = new Set(["queued", "searching", "searched", "filtering", "fetching", "fetched", "analyzing", "analyzed", "verifying", "verified", "synthesizing", "submitting"]);

const STAGE_DESCRIPTIONS = {
  queued: "Waiting to start...",
  searching: "Searching the web for relevant articles. This can take 1-2 minutes.",
  filtering: "Scoring search results for relevance...",
  fetching: "Downloading and extracting article content...",
  analyzing: "Reading each article and checking facts (30-60 sec per article). You can leave this page — it runs in the background.",
  synthesizing: "Cross-referencing findings across all articles...",
  submitting: "Filing your approved submissions...",
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
  const lsKey = (k) => `ta-agent-sentinel-${agent?.id || "default"}-${k}`;
  const lsGet = (k, fallback) => { try { return localStorage.getItem(lsKey(k)) || fallback; } catch { return fallback; } };

  const [thesis, setThesis] = useState(() => lsGet("thesis", ""));
  const [showDetails, setShowDetails] = useState(false);
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [when_, setWhen] = useState("");
  const [where_, setWhere] = useState("");
  const [why, setWhy] = useState("");
  const [activePreset, setActivePreset] = useState(0);
  const [platforms, setPlatforms] = useState(new Set(["news"]));

  // Keyword step
  const [keywords, setKeywords] = useState(() => {
    try { return JSON.parse(localStorage.getItem(lsKey("keywords")) || "[]"); } catch { return []; }
  });
  const [showKeywords, setShowKeywords] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [generatingKeywords, setGeneratingKeywords] = useState(false);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [recentRuns, setRecentRuns] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  useEffect(() => { try { localStorage.setItem(lsKey("thesis"), thesis); } catch {} }, [thesis]);
  useEffect(() => { try { localStorage.setItem(lsKey("keywords"), JSON.stringify(keywords)); } catch {} }, [keywords]);

  async function retryRun(runId) {
    try {
      const res = await fetch(`/api/agent/step/${runId}`, { method: "POST" });
      if (res.ok) loadRecentRuns();
    } catch {}
  }

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
    const ACTIVE = ["queued", "searching", "searched", "filtering", "fetching", "fetched", "analyzing", "analyzed", "verifying", "verified", "synthesizing", "submitting"];
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

    // Build platform-prefixed keywords
    const platformKeywords = [];
    for (const p of PLATFORM_OPTIONS) {
      if (!platforms.has(p.id)) continue;
      for (const kw of keywords) {
        platformKeywords.push(p.sitePrefix ? `${p.sitePrefix} ${kw}` : kw);
      }
    }

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thesis: thesis.trim(),
          scope: SCOPE_PRESETS[activePreset].value,
          keywords: platformKeywords.length > 0 ? platformKeywords : keywords,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // Fire-and-forget pipeline kickoff
        fetch(`/api/agent/step/${data.runId}`, { method: "POST" }).catch(() => {});
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
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
                    flex: "1 1 200px", minWidth: 0,
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
                      {p.label}{p.credits ? <span style={{ opacity: 0.7 }}> · {p.credits} cr</span> : ""}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Platform selector */}
            <div style={{ marginTop: 12 }}>
              <label
                style={{
                  display: "block", fontFamily: "var(--serif)", fontSize: 13,
                  fontWeight: 600, color: "var(--text)", marginBottom: 6,
                }}
              >
                Search Platforms
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {PLATFORM_OPTIONS.map((p) => {
                  const active = platforms.has(p.id);
                  return (
                    <span
                      key={p.id}
                      title={p.tip}
                      onClick={() => {
                        if (running) return;
                        const next = new Set(platforms);
                        if (active && next.size > 1) next.delete(p.id);
                        else next.add(p.id);
                        setPlatforms(next);
                      }}
                      style={{
                        fontFamily: "var(--mono)", fontSize: 11,
                        padding: "4px 12px",
                        background: active ? "var(--text)" : "var(--bg)",
                        color: active ? "var(--card-bg)" : "var(--text)",
                        border: `1px solid ${active ? "var(--text)" : "var(--border)"}`,
                        borderRadius: 14, cursor: running ? "not-allowed" : "pointer",
                        userSelect: "none",
                      }}
                    >
                      {p.label}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Platform tips */}
            {platforms.size > 0 && (
              <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6 }}>
                {PLATFORM_OPTIONS.filter((p) => platforms.has(p.id)).map((p) => (
                  <div key={p.id}><strong>{p.label}:</strong> {p.tip}</div>
                ))}
              </div>
            )}

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
          recentRuns.map((run) => {
            const isActive = ACTIVE_STATUSES.has(run.status);
            return (
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                    {run.thesis.length > 100 ? run.thesis.substring(0, 100) + "..." : run.thesis}
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2, cursor: "pointer" }}
                    onClick={() => navigator.clipboard?.writeText(run.id)}
                    title="Click to copy run ID"
                  >
                    {run.id.substring(0, 8)}...
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "var(--mono)", fontSize: 10, padding: "2px 8px",
                    borderRadius: 10, background: "var(--bg)",
                    color: STATUS_COLORS[run.status] || "var(--text-muted)",
                    border: `1px solid ${STATUS_COLORS[run.status] || "var(--border)"}`,
                    whiteSpace: "nowrap",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}
                >
                  {isActive && (
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: "var(--gold)",
                      animation: "pulse-dot 1.5s ease-in-out infinite",
                    }} />
                  )}
                  {run.status}
                </span>
              </div>
              {isActive && (
                <div style={{
                  padding: "8px 12px", marginTop: 4, marginBottom: 4,
                  background: "var(--bg)", borderRadius: 4,
                  border: "1px solid var(--border)",
                }}>
                  <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500, marginBottom: 2 }}>
                    {STAGE_DESCRIPTIONS[run.status] || run.stage_message || "Processing..."}
                  </div>
                  {run.stage_message && STAGE_DESCRIPTIONS[run.status] !== run.stage_message && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{run.stage_message}</div>
                  )}
                  {run.progress_pct > 0 && (
                    <div style={{ marginTop: 6, height: 4, background: "var(--card-bg)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${run.progress_pct}%`,
                        background: "var(--gold)",
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--mono)" }}>
                    {run.progress_pct || 0}% complete
                    {run.articles_found > 0 && ` · ${run.articles_found} found`}
                    {run.articles_fetched > 0 && ` · ${run.articles_fetched} fetched`}
                    {run.articles_analyzed > 0 && ` · ${run.articles_analyzed} analyzed`}
                    {run.estimated_cost_usd > 0 && ` · $${Number(run.estimated_cost_usd).toFixed(2)}`}
                  </div>
                </div>
              )}
              {!isActive && (
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
                  <span>{fmtTimestamp(run.created_at)}</span>
                  {run.articles_found > 0 && (
                    <span>{run.articles_found} found · {run.articles_fetched} fetched · {run.articles_analyzed} analyzed</span>
                  )}
                  {run.estimated_cost_usd > 0 && (
                    <span style={{ fontFamily: "var(--mono)" }}>${Number(run.estimated_cost_usd).toFixed(2)}</span>
                  )}
                </div>
              )}
              {run.error_message && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--red)" }}>
                  {run.error_message}
                  <button
                    className="ta-btn-secondary"
                    onClick={() => retryRun(run.id)}
                    style={{ fontSize: 10, padding: "3px 10px", marginLeft: 8 }}
                  >
                    Retry
                  </button>
                </div>
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
            );
          })
        )}
      </div>
    </div>
  );
}

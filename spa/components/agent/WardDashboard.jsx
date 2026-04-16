import React, { useState, useEffect, useCallback } from "react";

// Trust Assembly Agent — Ward dashboard
// ----------------------------------------
// Main workspace for a Ward (reputation defense) agent. Two sections:
//
//   1. Top: Monitored Entities list + "Scan Now" button
//   2. Bottom: Two-lane queue (Corrections | Affirmations) from recent runs
//
// The Ward auto-generates keywords from entity names and runs the
// standard Sentinel pipeline (search → filter → fetch → analyze →
// synthesize). The two-lane queue splits results by verdict.

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

const CONFIDENCE_COLORS = {
  high: "var(--green)",
  medium: "var(--gold)",
  low: "var(--text-muted)",
};

function fmtTimestamp(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function WardDashboard({ agent, onReview }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("corrections"); // corrections | affirmations
  const [expandedId, setExpandedId] = useState(null);

  const [recentRuns, setRecentRuns] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  const config = agent.config || {};
  const entities = Array.isArray(config.monitoredEntities) ? config.monitoredEntities : [];

  async function loadRecentRuns() {
    try {
      const res = await fetch("/api/agent/runs?limit=20");
      if (res.ok) {
        const data = await res.json();
        setRecentRuns(data.runs || []);
      }
    } catch {} finally {
      setLoadingRuns(false);
    }
  }

  useEffect(() => {
    loadRecentRuns();
  }, []);

  // Poll while any run is active
  useEffect(() => {
    const ACTIVE = ["queued", "searching", "filtering", "fetching", "analyzing", "synthesizing", "submitting"];
    const hasActive = recentRuns.some((r) => ACTIVE.includes(r.status));
    if (!hasActive) return;
    const interval = setInterval(loadRecentRuns, 3000);
    return () => clearInterval(interval);
  }, [recentRuns]);

  async function handleScan() {
    if (entities.length === 0) {
      setError("No monitored entities configured. Go to Settings to add entities.");
      return;
    }
    setError("");
    setMessage("");
    setScanning(true);

    try {
      const res = await fetch(`/api/agent/ward/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(
          `Scan started (${data.runId.substring(0, 8)}...). Monitoring ${data.entities} entities with ${data.keywords} keywords.`
        );
        loadRecentRuns();
      } else {
        setError(data.error || "Failed to start scan.");
      }
    } catch (e) {
      setError(e.message || "Network error.");
    } finally {
      setScanning(false);
    }
  }

  // Extract submissions from the most recent completed run's batch
  // and split by verdict for the two-lane queue
  const latestReadyRun = recentRuns.find((r) => r.status === "ready" || r.status === "completed");
  const batch = latestReadyRun?.batch || null;
  const submissions = batch?.submissions || [];
  const corrections = submissions.filter((s) => s.analysis?.verdict === "correction");
  const affirmations = submissions.filter((s) => s.analysis?.verdict === "affirmation");
  const queueItems = activeTab === "corrections" ? corrections : affirmations;

  // Active run (in-progress)
  const ACTIVE_STATUSES = ["queued", "searching", "filtering", "fetching", "analyzing", "synthesizing"];
  const activeRun = recentRuns.find((r) => ACTIVE_STATUSES.includes(r.status));

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h2 className="ta-section-head">
          {agent.name}
          {agent.domain && (
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-muted)", marginLeft: 10 }}>
              · {agent.domain}
            </span>
          )}
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Monitoring {entities.length} entit{entities.length === 1 ? "y" : "ies"} for corrections and affirmations.
        </p>
      </div>

      {/* Monitored entities + scan button */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "2px solid var(--ward)",
          borderRadius: 8,
          padding: "20px 24px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <label
              style={{
                display: "block",
                fontFamily: "var(--serif)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: 8,
              }}
            >
              Monitored Entities
            </label>
            {entities.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
                No entities configured. Go to Settings to add entities to watch.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {entities.map((entity, i) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-block",
                      padding: "4px 12px",
                      background: "var(--bg)",
                      border: "1px solid var(--ward)",
                      borderRadius: 14,
                      fontSize: 12,
                      fontFamily: "var(--mono)",
                      color: "var(--text)",
                    }}
                  >
                    {entity}
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            className="ta-btn-primary"
            onClick={handleScan}
            disabled={scanning || entities.length === 0}
            style={{
              fontSize: 14,
              padding: "10px 24px",
              flexShrink: 0,
              background: "var(--ward)",
            }}
          >
            {scanning ? "Starting..." : "Scan Now"}
          </button>
        </div>

        {/* Active run progress */}
        {activeRun && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "var(--bg)",
              borderRadius: 6,
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                Scan in progress
              </span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: "var(--card-bg)",
                  color: STATUS_COLORS[activeRun.status] || "var(--text-muted)",
                  border: `1px solid ${STATUS_COLORS[activeRun.status] || "var(--border)"}`,
                }}
              >
                {activeRun.status}
              </span>
            </div>
            {activeRun.stage_message && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                {activeRun.stage_message}
              </div>
            )}
            {activeRun.progress_pct > 0 && activeRun.progress_pct < 100 && (
              <div style={{ marginTop: 6, height: 4, background: "var(--card-bg)", borderRadius: 2, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${activeRun.progress_pct}%`,
                    background: "var(--ward)",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            )}
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: 12, padding: "10px 14px",
              background: "rgba(196, 77, 77, 0.1)", border: "1px solid var(--red)",
              borderRadius: 4, color: "var(--red)", fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {message && (
          <div
            style={{
              marginTop: 12, padding: "10px 14px",
              background: "rgba(74, 140, 92, 0.1)", border: "1px solid var(--green)",
              borderRadius: 4, color: "var(--green)", fontSize: 13,
            }}
          >
            {message}
          </div>
        )}
      </div>

      {/* Two-Lane Queue */}
      <div style={{ marginTop: 24 }}>
        <h3
          style={{
            fontFamily: "var(--serif)",
            fontSize: 16,
            fontWeight: 600,
            color: "var(--text)",
            marginBottom: 12,
          }}
        >
          Results Queue
        </h3>

        {/* Tab toggle */}
        <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid var(--border)" }}>
          <button
            onClick={() => setActiveTab("corrections")}
            style={{
              padding: "8px 20px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "var(--serif)",
              fontSize: 14,
              fontWeight: activeTab === "corrections" ? 600 : 400,
              color: activeTab === "corrections" ? "var(--red)" : "var(--text-muted)",
              borderBottom: activeTab === "corrections" ? "2px solid var(--red)" : "2px solid transparent",
              marginBottom: -2,
              transition: "color 0.15s",
            }}
          >
            Corrections
            {corrections.length > 0 && (
              <span
                style={{
                  marginLeft: 6, padding: "1px 7px", borderRadius: 10,
                  fontSize: 10, fontFamily: "var(--mono)",
                  background: activeTab === "corrections" ? "var(--red)" : "var(--bg)",
                  color: activeTab === "corrections" ? "white" : "var(--text-muted)",
                }}
              >
                {corrections.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("affirmations")}
            style={{
              padding: "8px 20px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "var(--serif)",
              fontSize: 14,
              fontWeight: activeTab === "affirmations" ? 600 : 400,
              color: activeTab === "affirmations" ? "var(--green)" : "var(--text-muted)",
              borderBottom: activeTab === "affirmations" ? "2px solid var(--green)" : "2px solid transparent",
              marginBottom: -2,
              transition: "color 0.15s",
            }}
          >
            Affirmations
            {affirmations.length > 0 && (
              <span
                style={{
                  marginLeft: 6, padding: "1px 7px", borderRadius: 10,
                  fontSize: 10, fontFamily: "var(--mono)",
                  background: activeTab === "affirmations" ? "var(--green)" : "var(--bg)",
                  color: activeTab === "affirmations" ? "white" : "var(--text-muted)",
                }}
              >
                {affirmations.length}
              </span>
            )}
          </button>
        </div>

        {/* Queue items */}
        {loadingRuns ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13, fontStyle: "italic" }}>Loading...</div>
        ) : !batch ? (
          <div
            style={{
              padding: "24px 20px", background: "var(--card-bg)",
              border: "1px dashed var(--border)", borderRadius: 6,
              color: "var(--text-muted)", fontSize: 13, fontStyle: "italic", textAlign: "center",
            }}
          >
            No scan results yet. Click "Scan Now" above to start monitoring.
          </div>
        ) : queueItems.length === 0 ? (
          <div
            style={{
              padding: "24px 20px", background: "var(--card-bg)",
              border: "1px dashed var(--border)", borderRadius: 6,
              color: "var(--text-muted)", fontSize: 13, fontStyle: "italic", textAlign: "center",
            }}
          >
            {activeTab === "corrections"
              ? "No corrections found in the latest scan. Your entities' coverage looks accurate."
              : "No affirmations found in the latest scan. Try scanning with broader scope."}
          </div>
        ) : (
          queueItems.map((item) => {
            const expanded = expandedId === item.id;
            const analysis = item.analysis || {};
            const accentColor = activeTab === "corrections" ? "var(--red)" : "var(--green)";

            return (
              <div
                key={item.id}
                style={{
                  marginBottom: 8,
                  background: "var(--card-bg)",
                  border: "1px solid var(--border)",
                  borderLeft: `4px solid ${accentColor}`,
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                {/* Collapsed header */}
                <div
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  style={{
                    padding: "12px 16px",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: "var(--text)" }}>
                        {item.headline}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {item.url ? new URL(item.url).hostname.replace("www.", "") : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                      {analysis.confidence && (
                        <span
                          style={{
                            fontFamily: "var(--mono)", fontSize: 10,
                            padding: "2px 8px", borderRadius: 10,
                            background: "var(--bg)",
                            color: CONFIDENCE_COLORS[analysis.confidence] || "var(--text-muted)",
                            border: `1px solid ${CONFIDENCE_COLORS[analysis.confidence] || "var(--border)"}`,
                          }}
                        >
                          {analysis.confidence}
                        </span>
                      )}
                      <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
                        {expanded ? "−" : "+"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div
                    style={{
                      padding: "0 16px 16px",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    {/* Reasoning */}
                    {analysis.reasoning && (
                      <div
                        style={{
                          marginTop: 12, padding: "12px 14px",
                          background: "var(--bg)", borderRadius: 6,
                          borderLeft: `3px solid ${accentColor}`,
                        }}
                      >
                        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" }}>
                          Ward's Reasoning
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text)" }}>
                          {analysis.reasoning}
                        </div>
                      </div>
                    )}

                    {/* Replacement headline (corrections only) */}
                    {analysis.replacement && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" }}>
                          Suggested Headline
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                          {analysis.replacement}
                        </div>
                      </div>
                    )}

                    {/* Evidence */}
                    {analysis.evidence && analysis.evidence.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" }}>
                          Evidence
                        </div>
                        {analysis.evidence.map((ev, i) => (
                          <div key={i} style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5, marginBottom: 4 }}>
                            {ev.description}
                            {ev.url && (
                              <a
                                href={ev.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ marginLeft: 6, fontSize: 11, color: "var(--ward)" }}
                              >
                                [source]
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Article link */}
                    {item.url && (
                      <div style={{ marginTop: 10 }}>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 12, color: "var(--ward)" }}
                        >
                          View original article →
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Review button for the whole run */}
        {latestReadyRun && latestReadyRun.status === "ready" && submissions.length > 0 && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button
              className="ta-btn-primary"
              onClick={() => onReview && onReview(latestReadyRun.id)}
              style={{ fontSize: 14, padding: "10px 28px" }}
            >
              Review All {submissions.length} Submission{submissions.length === 1 ? "" : "s"} →
            </button>
          </div>
        )}
      </div>

      {/* Scan history */}
      {recentRuns.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3
            style={{
              fontFamily: "var(--serif)", fontSize: 14, fontWeight: 600,
              color: "var(--text-muted)", marginBottom: 8,
            }}
          >
            Scan History
          </h3>
          {recentRuns.slice(0, 5).map((run) => (
            <div
              key={run.id}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 12px", marginBottom: 4,
                background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 4,
                fontSize: 12,
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>{fmtTimestamp(run.created_at)}</span>
              <span
                style={{
                  fontFamily: "var(--mono)", fontSize: 10, padding: "2px 8px", borderRadius: 10,
                  color: STATUS_COLORS[run.status] || "var(--text-muted)",
                  border: `1px solid ${STATUS_COLORS[run.status] || "var(--border)"}`,
                }}
              >
                {run.status}
              </span>
              {run.estimated_cost_usd > 0 && (
                <span style={{ fontFamily: "var(--mono)", color: "var(--text-muted)" }}>
                  ${Number(run.estimated_cost_usd).toFixed(2)}
                </span>
              )}
              {run.status === "ready" && (
                <button
                  className="ta-btn-secondary"
                  onClick={() => onReview && onReview(run.id)}
                  style={{ fontSize: 10, padding: "3px 10px" }}
                >
                  Review
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

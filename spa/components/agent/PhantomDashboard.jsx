import React, { useState, useEffect, useCallback } from "react";

// Trust Assembly Agent — Phantom dashboard
// -------------------------------------------
// Main workspace for a Phantom (Substack feed) agent. Flow:
//   1. Load feed from GET /api/agent/feed/[id]
//   2. User sees list of recent posts, selects which to analyze
//   3. Click "Analyze N Posts" → POST /api/agent/feed/[id]
//      → creates a run with scope='phantom-feed' + postUrls in context
//      → pipeline: fetch → analyze → synthesize (skips search/filter)
//   4. Run appears in Recent Runs with live status polling
//   5. When ready, user clicks Review → AgentReviewPanel

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

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtTimestamp(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function PhantomDashboard({ agent, onReview }) {
  const [feed, setFeed] = useState(null);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [selectedUrls, setSelectedUrls] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [recentRuns, setRecentRuns] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    setFeedError("");
    try {
      const res = await fetch(`/api/agent/feed/${agent.id}`);
      const data = await res.json();
      if (res.ok) {
        setFeed(data.feed);
      } else {
        setFeedError(data.error || "Failed to load feed.");
      }
    } catch (e) {
      setFeedError(e.message || "Network error.");
    } finally {
      setLoadingFeed(false);
    }
  }, [agent.id]);

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
    loadFeed();
    loadRecentRuns();
  }, [loadFeed]);

  // Poll while any run is active
  useEffect(() => {
    const ACTIVE = ["queued", "searching", "filtering", "fetching", "analyzing", "synthesizing", "submitting"];
    const hasActive = recentRuns.some((r) => ACTIVE.includes(r.status));
    if (!hasActive) return;
    const interval = setInterval(loadRecentRuns, 3000);
    return () => clearInterval(interval);
  }, [recentRuns]);

  function togglePost(url) {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function selectAll() {
    if (!feed?.posts) return;
    if (selectedUrls.size === feed.posts.length) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(feed.posts.map((p) => p.url)));
    }
  }

  async function handleScan() {
    if (selectedUrls.size === 0) {
      setError("Select at least one post to analyze.");
      return;
    }
    setError("");
    setMessage("");
    setScanning(true);

    try {
      const res = await fetch(`/api/agent/feed/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postUrls: Array.from(selectedUrls),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(
          `Scan started (${data.runId.substring(0, 8)}...). Analyzing ${data.postCount} post${data.postCount === 1 ? "" : "s"}.`
        );
        setSelectedUrls(new Set());
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

  const config = agent.config || {};

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 24px" }}>
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
          Monitoring{" "}
          <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
            {config.substackUrl || "no feed configured"}
          </span>
        </p>
      </div>

      {/* Feed posts */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "2px solid #8B5E3C",
          borderRadius: 8,
          padding: "20px 24px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <label
            style={{
              fontFamily: "var(--serif)",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            Recent Posts
            {feed && (
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>
                ({feed.posts.length} from {feed.feedTitle || "feed"})
              </span>
            )}
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {feed?.posts?.length > 0 && (
              <button
                className="ta-btn-secondary"
                onClick={selectAll}
                disabled={scanning}
                style={{ fontSize: 11, padding: "4px 10px" }}
              >
                {selectedUrls.size === feed.posts.length ? "Deselect All" : "Select All"}
              </button>
            )}
            <button
              className="ta-btn-secondary"
              onClick={loadFeed}
              disabled={loadingFeed}
              style={{ fontSize: 11, padding: "4px 10px" }}
            >
              {loadingFeed ? "Refreshing..." : "Refresh Feed"}
            </button>
          </div>
        </div>

        {loadingFeed && !feed && (
          <div style={{ color: "var(--text-muted)", fontSize: 13, fontStyle: "italic", padding: "12px 0" }}>
            Loading feed...
          </div>
        )}

        {feedError && (
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(196, 77, 77, 0.1)",
              border: "1px solid var(--red)",
              borderRadius: 4,
              color: "var(--red)",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {feedError}
          </div>
        )}

        {feed && feed.posts.length === 0 && (
          <div
            style={{
              padding: "16px 20px",
              background: "var(--bg)",
              border: "1px dashed var(--border)",
              borderRadius: 6,
              color: "var(--text-muted)",
              fontSize: 13,
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            No posts found in the feed. The author may not have published recently.
          </div>
        )}

        {feed && feed.posts.length > 0 && (
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {feed.posts.map((post) => {
              const selected = selectedUrls.has(post.url);
              return (
                <div
                  key={post.url}
                  onClick={() => !scanning && togglePost(post.url)}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "10px 12px",
                    marginBottom: 4,
                    background: selected ? "rgba(139, 94, 60, 0.06)" : "var(--bg)",
                    border: `1px solid ${selected ? "#8B5E3C" : "var(--border)"}`,
                    borderRadius: 6,
                    cursor: scanning ? "not-allowed" : "pointer",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  {/* Checkbox */}
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      border: `2px solid ${selected ? "#8B5E3C" : "var(--border)"}`,
                      background: selected ? "#8B5E3C" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 2,
                      color: "white",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {selected && "✓"}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "var(--serif)",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text)",
                        lineHeight: 1.4,
                        marginBottom: 2,
                      }}
                    >
                      {post.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {post.summary}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--mono)" }}>
                      {post.author && `${post.author} · `}
                      {fmtDate(post.published)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action bar */}
        {feed && feed.posts.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <button
              className="ta-btn-primary"
              onClick={handleScan}
              disabled={scanning || selectedUrls.size === 0}
              style={{ width: "100%", fontSize: 14, padding: "10px 0" }}
            >
              {scanning
                ? "Starting scan..."
                : selectedUrls.size === 0
                ? "Select posts to analyze"
                : `Analyze ${selectedUrls.size} Post${selectedUrls.size === 1 ? "" : "s"}`}
            </button>
          </div>
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
          Recent Scans
        </h3>
        {loadingRuns ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13, fontStyle: "italic" }}>Loading...</div>
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
            No scans yet. Select posts above and click Analyze.
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, flex: 1 }}>
                  {run.thesis.length > 100 ? run.thesis.substring(0, 100) + "..." : run.thesis}
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
                {run.articles_fetched > 0 && (
                  <span>{run.articles_fetched} fetched · {run.articles_analyzed} analyzed</span>
                )}
                {run.estimated_cost_usd > 0 && (
                  <span style={{ fontFamily: "var(--mono)" }}>${Number(run.estimated_cost_usd).toFixed(2)}</span>
                )}
              </div>
              {run.stage_message && !["ready", "failed", "cancelled", "completed"].includes(run.status) && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                  {run.stage_message}
                </div>
              )}
              {run.progress_pct > 0 && run.progress_pct < 100 && (
                <div style={{ marginTop: 6, height: 4, background: "var(--bg)", borderRadius: 2, overflow: "hidden" }}>
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

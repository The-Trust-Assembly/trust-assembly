import { useState, useEffect } from "react";
import { apiGetDiagnosticReport } from "../../src/lib/api-client";
import { getActionLog, flushLog } from "../lib/action-tracker";

export default function DiagnosticScreen() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hours, setHours] = useState(24);
  const [tab, setTab] = useState("overview");
  const [clientLog, setClientLog] = useState([]);
  const [flushing, setFlushing] = useState(false);
  const [flushMsg, setFlushMsg] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGetDiagnosticReport(hours);
      setReport(data);
    } catch (e) {
      setError(e.message || "Failed to load diagnostic report");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [hours]);

  const refreshClientLog = () => setClientLog(getActionLog());
  useEffect(() => { refreshClientLog(); }, [tab]);

  const handleFlush = async () => {
    setFlushing(true);
    setFlushMsg("");
    const result = await flushLog();
    if (result) {
      setFlushMsg(`Flushed ${result.entryCount} entries (${result.errorCount} errors) to server`);
      refreshClientLog();
    } else {
      setFlushMsg("Nothing to flush or flush failed");
    }
    setFlushing(false);
  };

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "errors", label: "Errors" },
    { key: "data", label: "Data Health" },
    { key: "actions", label: "Action Log" },
    { key: "client", label: "Client Log" },
    { key: "slow", label: "Slow Queries" },
  ];

  const severity = (s) => ({
    critical: { bg: "#FEF2F2", border: "#DC2626", color: "#991B1B" },
    warning: { bg: "#FFFBEB", border: "#D97706", color: "#92400E" },
    info: { bg: "#EFF6FF", border: "#2563EB", color: "#1E40AF" },
  }[s] || { bg: "#F8FAFC", border: "#94A3B8", color: "#475569" });

  if (loading && !report) {
    return <div style={{ padding: 24, textAlign: "center", color: "#64748B" }}>Loading diagnostic report...</div>;
  }

  if (error) {
    return <div className="ta-error">{error}</div>;
  }

  const totalErrors = Array.isArray(report?.recentErrors) ? report.recentErrors.length : 0;
  const criticalIssues = Array.isArray(report?.dataIssues) ? report.dataIssues.filter(i => i.severity === "critical").length : 0;

  return (
    <div>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600, margin: "0 0 8px", color: "var(--navy)" }}>
        Diagnostic Report
      </h2>
      <p style={{ fontSize: 13, color: "var(--stone)", margin: "0 0 16px" }}>
        System health, error tracking, and data validation. Generated {report?.generatedAt ? new Date(report.generatedAt).toLocaleString() : "now"}.
      </p>

      {/* Period selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: "var(--stone)" }}>Period:</span>
        {[1, 6, 24, 72, 168].map(h => (
          <button
            key={h}
            onClick={() => setHours(h)}
            className={hours === h ? "ta-btn-primary" : "ta-btn-secondary"}
            style={{ padding: "4px 10px", fontSize: 11 }}
          >
            {h < 24 ? `${h}h` : `${h / 24}d`}
          </button>
        ))}
        <button onClick={load} className="ta-btn-secondary" style={{ padding: "4px 10px", fontSize: 11, marginLeft: 8 }}>
          Refresh
        </button>
        <button
          onClick={() => {
            try {
              const text = JSON.stringify(report, null, 2);
              navigator.clipboard.writeText(text).then(
                () => alert("Report copied to clipboard"),
                () => {
                  // Fallback for browsers that don't support clipboard API
                  const ta = document.createElement("textarea");
                  ta.value = text;
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand("copy");
                  document.body.removeChild(ta);
                  alert("Report copied to clipboard");
                }
              );
            } catch (e) { alert("Failed to copy: " + e.message); }
          }}
          className="ta-btn-secondary"
          style={{ padding: "4px 10px", fontSize: 11, marginLeft: 4 }}
          disabled={!report}
        >
          Copy Report
        </button>
      </div>

      {/* Status banner */}
      {(totalErrors > 0 || criticalIssues > 0) && (
        <div style={{ background: "#FEF2F2", border: "1px solid #DC2626", borderRadius: 8, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>{criticalIssues > 0 ? "\u{1F6A8}" : "\u26A0\uFE0F"}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#991B1B" }}>
              {criticalIssues > 0 ? `${criticalIssues} critical data issue${criticalIssues > 1 ? "s" : ""} detected` : `${totalErrors} error${totalErrors > 1 ? "s" : ""} in the last ${hours}h`}
            </div>
            <div style={{ fontSize: 12, color: "#B91C1C" }}>
              {criticalIssues > 0 ? "These may cause page crashes for users." : "Check the Errors tab for details."}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E2E8F0", marginBottom: 16 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 14px", fontSize: 12, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? "var(--navy)" : "var(--stone)",
              borderBottom: tab === t.key ? "2px solid var(--navy)" : "2px solid transparent",
              background: "none", border: "none", borderBottomWidth: 2, borderBottomStyle: "solid",
              cursor: "pointer",
            }}
          >
            {t.label}
            {t.key === "errors" && totalErrors > 0 && (
              <span style={{ marginLeft: 4, background: "#DC2626", color: "#fff", fontSize: 9, padding: "1px 5px", borderRadius: 8, fontWeight: 700 }}>{totalErrors}</span>
            )}
            {t.key === "data" && criticalIssues > 0 && (
              <span style={{ marginLeft: 4, background: "#DC2626", color: "#fff", fontSize: 9, padding: "1px 5px", borderRadius: 8, fontWeight: 700 }}>{criticalIssues}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === "overview" && report && (
        <div>
          {/* Table counts */}
          <div className="ta-card">
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: "var(--navy)" }}>Database Overview</h3>
            {report.tableCounts && !report.tableCounts.error ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                {Object.entries(report.tableCounts).map(([key, val]) => (
                  <div key={key} style={{ background: "#F8FAFC", borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--navy)" }}>{String(val)}</div>
                    <div style={{ fontSize: 11, color: "var(--stone)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{key.replace(/_/g, " ")}</div>
                  </div>
                ))}
              </div>
            ) : <div className="ta-error">{report.tableCounts?.error || "No data"}</div>}
          </div>

          {/* Submission distribution */}
          <div className="ta-card">
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: "var(--navy)" }}>Submission Status Distribution</h3>
            {Array.isArray(report.submissionStatusDistribution) ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {report.submissionStatusDistribution.map(r => (
                  <div key={r.status} style={{ background: "#F8FAFC", borderRadius: 6, padding: "8px 12px", border: "1px solid #E2E8F0" }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{r.count}</span>
                    <span style={{ fontSize: 12, color: "var(--stone)", marginLeft: 6 }}>{r.status || "null"}</span>
                  </div>
                ))}
              </div>
            ) : <div className="ta-error">Could not load distribution</div>}
          </div>

        </div>
      )}

      {/* ── Errors Tab ── */}
      {tab === "errors" && report && (
        <div>
          {Array.isArray(report.recentErrors) && report.recentErrors.length > 0 ? (
            report.recentErrors.map((err, i) => (
              <div key={err.id || i} className="ta-card" style={{ borderLeft: "3px solid #DC2626" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#991B1B" }}>{err.action}</span>
                  <span style={{ fontSize: 11, color: "var(--stone)" }}>{new Date(err.createdAt).toLocaleString()}</span>
                </div>
                {err.requestPath && <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 4 }}>{err.requestPath}</div>}
                {err.username && <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 4 }}>User: @{err.username}</div>}
                {err.errorMessage && (
                  <div style={{ background: "#FEF2F2", borderRadius: 4, padding: "8px 10px", fontSize: 12, color: "#991B1B", fontFamily: "var(--mono)", marginBottom: 4, wordBreak: "break-all" }}>
                    {err.errorMessage}
                  </div>
                )}
                {err.errorStack && (
                  <details style={{ fontSize: 11 }}>
                    <summary style={{ cursor: "pointer", color: "var(--stone)" }}>Stack trace</summary>
                    <pre style={{ background: "#1E293B", color: "#E2E8F0", padding: 10, borderRadius: 4, fontSize: 10, overflow: "auto", maxHeight: 200, marginTop: 4 }}>{err.errorStack}</pre>
                  </details>
                )}
                {err.durationMs && <div style={{ fontSize: 11, color: "var(--stone)", marginTop: 4 }}>Duration: {err.durationMs}ms</div>}
              </div>
            ))
          ) : (
            <div style={{ textAlign: "center", padding: 32, color: "var(--stone)" }}>
              No errors in the last {hours}h
            </div>
          )}
        </div>
      )}

      {/* ── Data Health Tab ── */}
      {tab === "data" && report && (
        <div>
          {Array.isArray(report.dataIssues) && report.dataIssues.length > 0 ? (
            report.dataIssues.map((issue, i) => {
              const s = severity(issue.severity);
              return (
                <div key={i} className="ta-card" style={{ borderLeft: `3px solid ${s.border}`, background: s.bg }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: s.color }}>{issue.check.replace(/_/g, " ")}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: s.color, background: `${s.border}22`, padding: "2px 6px", borderRadius: 4 }}>
                      {issue.severity} ({issue.count})
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: s.color, lineHeight: 1.5 }}>{issue.details}</div>
                </div>
              );
            })
          ) : (
            <div style={{ textAlign: "center", padding: 32, color: "var(--evergreen)" }}>
              All data validation checks passed
            </div>
          )}
        </div>
      )}

      {/* ── Action Log Tab (server-side) ── */}
      {tab === "actions" && report && (
        <div>
          <p style={{ fontSize: 12, color: "var(--stone)", marginBottom: 12 }}>
            Aggregated actions from the audit log in the last {hours}h.
          </p>
          {Array.isArray(report.actionSummary) ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E2E8F0" }}>
                  <th style={{ textAlign: "left", padding: "8px 6px", color: "var(--stone)", fontWeight: 600 }}>Action</th>
                  <th style={{ textAlign: "left", padding: "8px 6px", color: "var(--stone)", fontWeight: 600 }}>Entity</th>
                  <th style={{ textAlign: "right", padding: "8px 6px", color: "var(--stone)", fontWeight: 600 }}>Total</th>
                  <th style={{ textAlign: "right", padding: "8px 6px", color: "var(--stone)", fontWeight: 600 }}>OK</th>
                  <th style={{ textAlign: "right", padding: "8px 6px", color: "#DC2626", fontWeight: 600 }}>Errors</th>
                  <th style={{ textAlign: "right", padding: "8px 6px", color: "var(--stone)", fontWeight: 600 }}>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {report.actionSummary.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "6px", fontFamily: "var(--mono)", fontSize: 11 }}>{r.action}</td>
                    <td style={{ padding: "6px", color: "var(--stone)" }}>{r.entity_type}</td>
                    <td style={{ padding: "6px", textAlign: "right", fontWeight: 600 }}>{r.total}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: "var(--evergreen)" }}>{r.successes}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: parseInt(r.errors) > 0 ? "#DC2626" : "var(--stone)", fontWeight: parseInt(r.errors) > 0 ? 700 : 400 }}>{r.errors}</td>
                    <td style={{ padding: "6px", textAlign: "right", fontSize: 10, color: "var(--stone)" }}>{new Date(r.last_seen).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="ta-error">Could not load action summary</div>}
        </div>
      )}

      {/* ── Client Log Tab (in-memory) ── */}
      {tab === "client" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: "var(--stone)", margin: 0 }}>
              In-browser action log ({clientLog.length} entries). Every button click and API call is recorded here.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ta-btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={refreshClientLog}>Refresh</button>
              <button className="ta-btn-primary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={handleFlush} disabled={flushing}>
                {flushing ? "Flushing..." : "Flush to Server"}
              </button>
            </div>
          </div>
          {flushMsg && <div className="ta-success" style={{ marginBottom: 8 }}>{flushMsg}</div>}
          {clientLog.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--stone)" }}>
              No actions recorded yet. Navigate around and click buttons to see entries appear.
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflow: "auto" }}>
              {clientLog.map((entry, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 10px",
                    borderLeft: `3px solid ${entry.ok ? "#059669" : "#DC2626"}`,
                    background: entry.ok ? "#fff" : "#FEF2F2",
                    marginBottom: 4,
                    borderRadius: "0 4px 4px 0",
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: entry.ok ? "var(--navy)" : "#991B1B" }}>
                      {entry.category}:{entry.action}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--stone)" }}>
                      {entry.durationMs ? `${entry.durationMs}ms` : ""} {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  {entry.error && (
                    <div style={{ fontSize: 11, color: "#991B1B", fontFamily: "var(--mono)", marginTop: 2 }}>{entry.error}</div>
                  )}
                  {entry.screen && <span style={{ fontSize: 10, color: "var(--stone)" }}>screen: {entry.screen}</span>}
                  {entry.component && <span style={{ fontSize: 10, color: "var(--stone)", marginLeft: 8 }}>component: {entry.component}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Slow Queries Tab ── */}
      {tab === "slow" && report && (
        <div>
          <p style={{ fontSize: 12, color: "var(--stone)", marginBottom: 12 }}>
            Actions that took longer than 1 second in the last {hours}h.
          </p>
          {Array.isArray(report.slowActions) && report.slowActions.length > 0 ? (
            report.slowActions.map((r, i) => (
              <div key={i} className="ta-card" style={{ borderLeft: "3px solid #D97706" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600 }}>{r.action}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#D97706" }}>{r.duration_ms}ms</span>
                </div>
                {r.request_path && <div style={{ fontSize: 11, color: "var(--stone)" }}>{r.request_path}</div>}
                <div style={{ fontSize: 10, color: "var(--stone)" }}>{new Date(r.created_at).toLocaleString()}</div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: "center", padding: 32, color: "var(--evergreen)" }}>
              No slow actions detected
            </div>
          )}
        </div>
      )}
    </div>
  );
}

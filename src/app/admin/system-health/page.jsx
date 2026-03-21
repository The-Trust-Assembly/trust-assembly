"use client";

import { useState, useCallback } from "react";

const STATUS_COLORS = { green: "#22c55e", yellow: "#eab308", red: "#ef4444" };
const CHAIN_LABELS = {
  account_creation: "Registration",
  login: "Login",
  submission_creation: "Submissions",
  assembly_creation: "Assemblies",
  jury_voting: "Jury Voting",
  submission_visibility: "Visibility",
  review_queue: "Review Queue",
  disputes: "Disputes",
  notifications: "Notifications",
  dispute_resolution: "Dispute Resolution",
  vault_artifacts: "Vault Artifacts",
  stories: "Stories",
};

function formatDebugContext(e) {
  return `ERROR REPORT — ${e.created_at}
Route: ${e.http_method} ${e.api_route}
File: ${e.source_file}
Function: ${e.source_function}
${e.line_context ? `Context: ${e.line_context}\n` : ""}${e.entity_type ? `Entity: ${e.entity_type} [${e.entity_id}]\n` : ""}${e.user_username ? `User: @${e.user_username} [${e.user_id}]\n` : ""}Error: ${e.error_message}
${e.error_stack ? `Stack:\n${e.error_stack}\n` : ""}${e.request_body ? `Request Body: ${JSON.stringify(e.request_body)}\n` : ""}HTTP Status: ${e.http_status}${e.duplicate_count > 0 ? `\nDuplicate Count: ${e.duplicate_count}` : ""}`;
}

const btnStyle = {
  background: "#3b82f6",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const smallBtnStyle = {
  background: "#334155",
  color: "#e2e8f0",
  border: "none",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 11,
  cursor: "pointer",
};

const thStyle = {
  textAlign: "left",
  padding: "8px 12px",
  color: "#94a3b8",
  fontWeight: 600,
};

const tdStyle = {
  padding: "8px 12px",
  color: "#e2e8f0",
};

function StatCard({ label, value, alert }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 8, padding: 16, border: `1px solid ${alert ? "#ef4444" : "#334155"}` }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: alert ? "#ef4444" : "#e2e8f0" }}>{value}</div>
      <div style={{ fontSize: 13, color: "#94a3b8" }}>{label}</div>
    </div>
  );
}

export default function SystemHealthPage() {
  const [report, setReport] = useState(null);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(null);
  const [expandedError, setExpandedError] = useState(null);
  const [diagResult, setDiagResult] = useState(null);

  const getAuthHeaders = useCallback(() => {
    const cookies = document.cookie.split(";").map(c => c.trim());
    const sessionCookie = cookies.find(c => c.startsWith("session="));
    const token = sessionCookie?.split("=")[1];
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading("report");
    try {
      const res = await fetch("/api/admin/reconciliation-report", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReport(data);
    } catch (e) {
      alert(`Failed to fetch report: ${e}`);
    } finally {
      setLoading(null);
    }
  }, [getAuthHeaders]);

  const fetchErrors = useCallback(async () => {
    setLoading("errors");
    try {
      const res = await fetch("/api/admin/errors?resolved=false&limit=100", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setErrors(data.errors);
    } catch (e) {
      alert(`Failed to fetch errors: ${e}`);
    } finally {
      setLoading(null);
    }
  }, [getAuthHeaders]);

  const runDiagnostic = useCallback(async (params = "") => {
    setLoading("diagnostic");
    setDiagResult(null);
    try {
      const res = await fetch(`/api/admin/diag-transactions${params}`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDiagResult(JSON.stringify(data.summary, null, 2));
      await fetchReport();
      await fetchErrors();
    } catch (e) {
      alert(`Diagnostic failed: ${e}`);
    } finally {
      setLoading(null);
    }
  }, [getAuthHeaders, fetchReport, fetchErrors]);

  const resolveError = useCallback(async (errorId) => {
    try {
      const res = await fetch("/api/admin/errors", {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ errorId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setErrors(prev => prev.filter(e => e.id !== errorId));
    } catch (e) {
      alert(`Failed to resolve: ${e}`);
    }
  }, [getAuthHeaders]);

  const exportReport = useCallback(() => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trust-assembly-health-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 1200, margin: "0 auto", padding: 24, color: "#e2e8f0", background: "#0f172a", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Trust Assembly System Health</h1>
      {report && (
        <p style={{ color: "#94a3b8", marginBottom: 24 }}>
          Last report: {new Date(report.generated_at).toLocaleString()} ({report.duration_ms}ms)
        </p>
      )}

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button onClick={fetchReport} disabled={loading !== null} style={btnStyle}>
          {loading === "report" ? "Loading..." : "Run Reconciliation Report"}
        </button>
        <button onClick={() => runDiagnostic()} disabled={loading !== null} style={btnStyle}>
          {loading === "diagnostic" ? "Running..." : "Run Full Diagnostic"}
        </button>
        <button onClick={() => runDiagnostic("?ghostOnly=true")} disabled={loading !== null} style={btnStyle}>
          Run Ghost Tests Only
        </button>
        <button onClick={() => runDiagnostic("?autoRepair=true")} disabled={loading !== null} style={{ ...btnStyle, background: "#dc2626" }}>
          Auto-Repair
        </button>
        <button onClick={fetchErrors} disabled={loading !== null} style={btnStyle}>
          Refresh Errors
        </button>
        {report && (
          <button onClick={exportReport} style={{ ...btnStyle, background: "#6366f1" }}>
            Export Debug Report
          </button>
        )}
      </div>

      {/* Diagnostic Result */}
      {diagResult && (
        <div style={{ background: "#1e293b", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #334155" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Diagnostic Summary</h3>
          <pre style={{ margin: 0, fontSize: 13, overflow: "auto", color: "#94a3b8" }}>{diagResult}</pre>
        </div>
      )}

      {/* Transaction Chain Health Grid */}
      {report && (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Transaction Chain Health</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
            {Object.entries(report.chains).map(([key, chain]) => (
              <div key={key} style={{ background: "#1e293b", borderRadius: 8, padding: 12, border: `2px solid ${STATUS_COLORS[chain.status]}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: STATUS_COLORS[chain.status], display: "inline-block" }} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{CHAIN_LABELS[key] || key}</span>
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  {chain.errors_24h > 0 ? `${chain.errors_24h} error(s) 24h` : "No errors 24h"}
                </div>
                {chain.last_error && (
                  <div style={{ fontSize: 11, color: "#f87171", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {chain.last_error.slice(0, 60)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Error Summary */}
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Error Summary</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
            <StatCard label="24h" value={report.errors.last_24h.total} />
            <StatCard label="7 days" value={report.errors.last_7d.total} />
            <StatCard label="30 days" value={report.errors.last_30d.total} />
            <StatCard label="Unresolved" value={report.errors.unresolved} alert={report.errors.unresolved > 0} />
          </div>

          {/* Recurring Patterns */}
          {report.errors.recurring_patterns.length > 0 && (
            <div style={{ background: "#1e293b", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #f59e0b" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Recurring Error Patterns</h3>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155" }}>
                    <th style={thStyle}>Route</th>
                    <th style={thStyle}>Function</th>
                    <th style={thStyle}>Count</th>
                    <th style={thStyle}>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {report.errors.recurring_patterns.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #1e293b" }}>
                      <td style={tdStyle}>{p.route}</td>
                      <td style={tdStyle}>{p.function}</td>
                      <td style={tdStyle}>{p.count}</td>
                      <td style={tdStyle}>{new Date(p.last_seen).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Reconciliation Details */}
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Reconciliation</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
            <StatCard label="Stuck Submissions" value={report.reconciliation.stuck_submissions.length} alert={report.reconciliation.stuck_submissions.length > 0} />
            <StatCard label="Reputation Drift" value={report.reconciliation.reputation_drift.length} alert={report.reconciliation.reputation_drift.length > 0} />
            <StatCard label="Stuck Vault Entries" value={report.reconciliation.stuck_vault_entries} alert={report.reconciliation.stuck_vault_entries > 0} />
            <StatCard label="Missing Notifications" value={report.reconciliation.missing_notifications} alert={report.reconciliation.missing_notifications > 0} />
            <StatCard label="Incomplete Disputes" value={report.reconciliation.incomplete_disputes} alert={report.reconciliation.incomplete_disputes > 0} />
            <StatCard label="Stuck Stories" value={report.reconciliation.stuck_stories} alert={report.reconciliation.stuck_stories > 0} />
          </div>

          {/* Orphaned Records */}
          <div style={{ background: "#1e293b", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #334155" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Orphaned Records</h3>
            <div style={{ display: "flex", gap: 24, fontSize: 14 }}>
              <span>Org members without history: <strong>{report.reconciliation.orphaned_records.org_members_no_history}</strong></span>
              <span>Submissions without evidence: <strong>{report.reconciliation.orphaned_records.submissions_no_evidence}</strong></span>
              <span>Votes without audit: <strong>{report.reconciliation.orphaned_records.votes_no_audit}</strong></span>
            </div>
          </div>

          {/* Stuck Submissions Detail */}
          {report.reconciliation.stuck_submissions.length > 0 && (
            <div style={{ background: "#1e293b", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #ef4444" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Stuck Submissions</h3>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155" }}>
                    <th style={thStyle}>ID</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Votes</th>
                    <th style={thStyle}>Seats</th>
                  </tr>
                </thead>
                <tbody>
                  {report.reconciliation.stuck_submissions.map((s, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>{s.id.slice(0, 8)}...</td>
                      <td style={tdStyle}>{s.status}</td>
                      <td style={tdStyle}>{s.votes}</td>
                      <td style={tdStyle}>{s.seats}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Error Table */}
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
        Unresolved Errors {errors.length > 0 && <span style={{ color: "#ef4444" }}>({errors.length})</span>}
      </h2>
      {errors.length === 0 && !loading ? (
        <p style={{ color: "#94a3b8" }}>No unresolved errors. Click &quot;Refresh Errors&quot; to load.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", background: "#1e293b", borderRadius: 8 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #334155" }}>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Route</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Message</th>
                <th style={thStyle}>User</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid #1e293b", cursor: "pointer" }}>
                  <td style={tdStyle} onClick={() => setExpandedError(expandedError === e.id ? null : e.id)}>
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td style={tdStyle} onClick={() => setExpandedError(expandedError === e.id ? null : e.id)}>
                    {e.http_method} {e.api_route}
                  </td>
                  <td style={tdStyle} onClick={() => setExpandedError(expandedError === e.id ? null : e.id)}>
                    <span style={{ background: e.error_type === "transaction_error" ? "#dc2626" : e.error_type === "auth_error" ? "#f59e0b" : "#6366f1", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>
                      {e.error_type}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onClick={() => setExpandedError(expandedError === e.id ? null : e.id)}>
                    {e.error_message}
                    {e.duplicate_count > 0 && <span style={{ color: "#f59e0b", marginLeft: 4 }}>({e.duplicate_count}x)</span>}
                  </td>
                  <td style={tdStyle}>{e.user_username || "-"}</td>
                  <td style={tdStyle}>
                    <button onClick={() => navigator.clipboard.writeText(formatDebugContext(e))} style={{ ...smallBtnStyle, marginRight: 4 }}>
                      Copy Debug
                    </button>
                    <button onClick={() => resolveError(e.id)} style={{ ...smallBtnStyle, background: "#22c55e" }}>
                      Resolve
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Expanded Error Detail */}
          {expandedError && errors.find(e => e.id === expandedError) && (
            <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: 16, marginTop: 8 }}>
              <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#94a3b8", margin: 0 }}>
                {formatDebugContext(errors.find(e => e.id === expandedError))}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

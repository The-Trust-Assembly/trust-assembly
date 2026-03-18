import { useState, useEffect } from "react";
import { ADMIN_USERNAME } from "../lib/constants";

const FEEDBACK_STATUS_LABELS = { accepted: "Accepted", roadmapped: "Roadmapped", pending: "Pending", completed: "Completed" };
const FEEDBACK_STATUS_COLORS = { accepted: "#059669", roadmapped: "#7C3AED", pending: "#D97706", completed: "#2563EB" };

export default function FeedbackScreen({ isAdmin, currentUsername }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyStatus, setReplyStatus] = useState("accepted");
  const [replySending, setReplySending] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolveSending, setResolveSending] = useState(false);
  const [diLinkRunning, setDiLinkRunning] = useState(false);
  const [diLinkResult, setDiLinkResult] = useState(null);
  const [recomputeRunning, setRecomputeRunning] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState(null);
  const [repairRunning, setRepairRunning] = useState(false);
  const [repairResult, setRepairResult] = useState(null);
  const [adminFlagRunning, setAdminFlagRunning] = useState(false);
  const [adminFlagResult, setAdminFlagResult] = useState(null);
  const [migrateKvRunning, setMigrateKvRunning] = useState(false);
  const [migrateKvResult, setMigrateKvResult] = useState(null);
  const [purgeKvRunning, setPurgeKvRunning] = useState(false);
  const [purgeKvResult, setPurgeKvResult] = useState(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState(null);

  const load = async () => {
    try {
      const res = await fetch("/api/feedback");
      if (!res.ok) { setError("Failed to load feedback"); setLoading(false); return; }
      const data = await res.json();
      setItems(data.feedback || []);
    } catch (e) {
      setError("Failed to load feedback");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sendReply = async (feedbackId) => {
    if (!replyText.trim()) return;
    setReplySending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId, action: "admin_reply", reply: replyText.trim(), status: replyStatus })
      });
      if (res.ok) { setReplyingTo(null); setReplyText(""); setReplyStatus("accepted"); load(); }
    } catch {}
    setReplySending(false);
  };

  const sendResolution = async (feedbackId, resolution) => {
    setResolveSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId, action: "user_resolution", resolution, note: resolutionNote.trim() || null })
      });
      if (res.ok) { setResolvingId(null); setResolutionNote(""); load(); }
    } catch {}
    setResolveSending(false);
  };

  const runRecomputeStats = async () => {
    setRecomputeRunning(true); setRecomputeResult(null);
    try {
      const res = await fetch("/api/admin/recompute-stats", { method: "POST" });
      const data = await res.json();
      setRecomputeResult(data);
    } catch (e) {
      setRecomputeResult({ success: false, report: [`Error: ${e.message}`] });
    }
    setRecomputeRunning(false);
  };

  const runRepairData = async () => {
    setRepairRunning(true); setRepairResult(null);
    try {
      const res = await fetch("/api/admin/repair-data", { method: "POST" });
      const data = await res.json();
      setRepairResult(data);
    } catch (e) {
      setRepairResult({ success: false, report: [`Error: ${e.message}`] });
    }
    setRepairRunning(false);
  };

  const runForceDILink = async () => {
    setDiLinkRunning(true); setDiLinkResult(null);
    try {
      const res = await fetch("/api/admin/force-di-partner", { method: "POST" });
      const data = await res.json();
      setDiLinkResult(data);
    } catch (e) {
      setDiLinkResult({ success: false, report: [`Error: ${e.message}`] });
    }
    setDiLinkRunning(false);
  };

  const runSetAdminFlag = async () => {
    setAdminFlagRunning(true); setAdminFlagResult(null);
    try {
      const res = await fetch("/api/admin/set-admin-flag", { method: "POST" });
      const data = await res.json();
      setAdminFlagResult(data);
    } catch (e) {
      setAdminFlagResult({ success: false, error: e.message });
    }
    setAdminFlagRunning(false);
  };

  const runMigrateKv = async () => {
    setMigrateKvRunning(true); setMigrateKvResult(null);
    try {
      const res = await fetch("/api/reconcile", { method: "POST" });
      const data = await res.json();
      setMigrateKvResult(data);
    } catch (e) {
      setMigrateKvResult({ success: false, report: [`Error: ${e.message}`] });
    }
    setMigrateKvRunning(false);
  };

  const runPurgeKv = async () => {
    if (!confirm("This will DELETE all KV store records after migration. Continue?")) return;
    setPurgeKvRunning(true); setPurgeKvResult(null);
    try {
      const res = await fetch("/api/reconcile?purge=true", { method: "POST" });
      const data = await res.json();
      setPurgeKvResult(data);
    } catch (e) {
      setPurgeKvResult({ success: false, report: [`Error: ${e.message}`] });
    }
    setPurgeKvRunning(false);
  };

  const runDiagTransactions = async () => {
    setDiagRunning(true); setDiagResult(null);
    try {
      const res = await fetch("/api/admin/diag-transactions", { method: "POST" });
      const data = await res.json();
      setDiagResult(data);
    } catch (e) {
      setDiagResult({ success: false, error: e.message });
    }
    setDiagRunning(false);
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "var(--stone)" }}>Loading feedback...</div>;
  if (error) return <div className="ta-error">{error}</div>;

  return (
    <div>
      {/* Bootstrap Admin Flag — visible to @thekingofamerica even without is_admin */}
      {!isAdmin && currentUsername === ADMIN_USERNAME && (
        <div className="ta-card" style={{ borderLeft: "4px solid #DC2626", marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#DC2626", marginBottom: 10, fontWeight: 700 }}>Admin Bootstrap</div>
          <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 10 }}>Your admin flag is not set in the database. Click below to fix it.</div>
          <button className="ta-btn-primary" onClick={runSetAdminFlag} disabled={adminFlagRunning} style={{ background: "#DC2626", fontSize: 12 }}>
            {adminFlagRunning ? "Setting..." : "Set Admin Flag in Database"}
          </button>
          {adminFlagResult && (
            <div style={{ marginTop: 8, padding: 10, background: adminFlagResult.success ? "#ECFDF5" : "#FEF2F2", borderRadius: 6, fontSize: 11, fontFamily: "var(--mono)" }}>
              {adminFlagResult.success ? adminFlagResult.message : (adminFlagResult.error || "Failed")}
              {adminFlagResult.success && <div style={{ marginTop: 4, color: "var(--stone)" }}>Reload the page to see admin tools.</div>}
            </div>
          )}
        </div>
      )}

      {/* Admin Tools Panel */}
      {isAdmin && (
        <div className="ta-card" style={{ borderLeft: "4px solid var(--sienna)", marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--sienna)", marginBottom: 10, fontWeight: 700 }}>Admin Tools</div>

          {/* Set Admin Flag (already admin but can re-confirm) */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <button className="ta-btn-primary" onClick={runSetAdminFlag} disabled={adminFlagRunning} style={{ background: "#6B21A8", fontSize: 12 }}>
              {adminFlagRunning ? "Setting..." : "Set Admin Flag in DB"}
            </button>
            <span style={{ fontSize: 11, color: "var(--stone)" }}>Ensures is_admin=TRUE in the relational database</span>
          </div>
          {adminFlagResult && (
            <div style={{ marginTop: 0, marginBottom: 12, padding: 10, background: adminFlagResult.success ? "#ECFDF5" : "#FEF2F2", borderRadius: 6, fontSize: 11, fontFamily: "var(--mono)" }}>
              {adminFlagResult.success ? adminFlagResult.message : (adminFlagResult.error || "Failed")}
            </div>
          )}

          {/* Recompute Stats */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <button className="ta-btn-primary" onClick={runRecomputeStats} disabled={recomputeRunning} style={{ background: "#B45309", fontSize: 12 }}>
              {recomputeRunning ? "Running..." : "Recompute User Stats"}
            </button>
            <span style={{ fontSize: 11, color: "var(--stone)" }}>Recalculates wins/losses/streak from submissions + KV store</span>
          </div>
          {recomputeResult && (
            <div style={{ marginTop: 0, marginBottom: 12, padding: 10, background: recomputeResult.success ? "#ECFDF5" : "#FEF2F2", borderRadius: 6, fontSize: 11, fontFamily: "var(--mono)", maxHeight: 200, overflowY: "auto" }}>
              {(recomputeResult.report || []).map((line, i) => <div key={i}>{line}</div>)}
              {!recomputeResult.success && recomputeResult.error && <div style={{ color: "var(--fired-clay)" }}>{recomputeResult.error}</div>}
            </div>
          )}

          {/* Repair Historical Data */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <button className="ta-btn-primary" onClick={runRepairData} disabled={repairRunning} style={{ background: "#0891B2", fontSize: 12 }}>
              {repairRunning ? "Repairing..." : "Repair Historical Data"}
            </button>
            <span style={{ fontSize: 11, color: "var(--stone)" }}>Fixes NULL primary_org_id, duplicate votes, missing audit logs, stuck edits, missing memberships, enum gaps</span>
          </div>
          {repairResult && (
            <div style={{ marginTop: 0, marginBottom: 12, padding: 10, background: repairResult.success ? "#ECFDF5" : "#FEF2F2", borderRadius: 6, fontSize: 11, fontFamily: "var(--mono)", maxHeight: 300, overflowY: "auto" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Repaired: {repairResult.totalRepaired || 0} item(s)</div>
              {(repairResult.report || []).map((line, i) => <div key={i}>{line}</div>)}
              {!repairResult.success && repairResult.error && <div style={{ color: "var(--fired-clay)" }}>{repairResult.error}</div>}
            </div>
          )}

          {/* Force DI Link */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <button className="ta-btn-primary" onClick={runForceDILink} disabled={diLinkRunning} style={{ background: "var(--sienna)", fontSize: 12 }}>
              {diLinkRunning ? "Running..." : "Force-Link All DI Partners"}
            </button>
            <span style={{ fontSize: 11, color: "var(--stone)" }}>Links all DI users to @thekingofamerica and backfills submissions</span>
          </div>
          {diLinkResult && (
            <div style={{ marginTop: 0, marginBottom: 12, padding: 10, background: diLinkResult.success ? "#ECFDF5" : "#FEF2F2", borderRadius: 6, fontSize: 11, fontFamily: "var(--mono)", maxHeight: 200, overflowY: "auto" }}>
              {(diLinkResult.report || []).map((line, i) => <div key={i}>{line}</div>)}
              {!diLinkResult.success && diLinkResult.error && <div style={{ color: "var(--fired-clay)" }}>{diLinkResult.error}</div>}
            </div>
          )}

          {/* Migrate KV → Relational */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <button className="ta-btn-primary" onClick={runMigrateKv} disabled={migrateKvRunning} style={{ background: "#0369A1", fontSize: 12 }}>
              {migrateKvRunning ? "Migrating..." : "Migrate KV → Relational"}
            </button>
            <span style={{ fontSize: 11, color: "var(--stone)" }}>Copies all KV store records into relational tables (non-destructive)</span>
          </div>
          {migrateKvResult && (
            <div style={{ marginTop: 0, marginBottom: 12, padding: 10, background: migrateKvResult.success ? "#ECFDF5" : "#FEF2F2", borderRadius: 6, fontSize: 11, fontFamily: "var(--mono)", maxHeight: 200, overflowY: "auto" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Migrated: {migrateKvResult.migratedCount || 0} records</div>
              {(migrateKvResult.report || []).map((line, i) => <div key={i}>{line}</div>)}
              {!migrateKvResult.success && migrateKvResult.error && <div style={{ color: "var(--fired-clay)" }}>{migrateKvResult.error}</div>}
            </div>
          )}

          {/* Purge KV Store */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button className="ta-btn-primary" onClick={runPurgeKv} disabled={purgeKvRunning} style={{ background: "#DC2626", fontSize: 12 }}>
              {purgeKvRunning ? "Purging..." : "Migrate + Purge KV Store"}
            </button>
            <span style={{ fontSize: 11, color: "var(--stone)" }}>Migrates then DELETES all KV rows (irreversible)</span>
          </div>
          {purgeKvResult && (
            <div style={{ marginTop: 12, padding: 10, background: purgeKvResult.success ? "#ECFDF5" : "#FEF2F2", borderRadius: 6, fontSize: 11, fontFamily: "var(--mono)", maxHeight: 200, overflowY: "auto" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Migrated: {purgeKvResult.migratedCount || 0} records | Purged: {purgeKvResult.purged ? "Yes" : "No"}</div>
              {(purgeKvResult.report || []).map((line, i) => <div key={i}>{line}</div>)}
              {!purgeKvResult.success && purgeKvResult.error && <div style={{ color: "var(--fired-clay)" }}>{purgeKvResult.error}</div>}
            </div>
          )}
        </div>
      )}

      {/* Transaction Diagnostics Panel */}
      {isAdmin && (
        <div className="ta-card" style={{ borderLeft: "4px solid var(--teal)", marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--teal)", marginBottom: 6, fontWeight: 700 }}>Database Diagnostics</div>
          <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 12, lineHeight: 1.5 }}>
            Tests whether database transactions actually work. Checks connection behavior, data integrity, and identifies inconsistencies caused by broken transactions.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="ta-btn-primary" onClick={runDiagTransactions} disabled={diagRunning} style={{ background: "var(--teal)", fontSize: 12 }}>
              {diagRunning ? "Running diagnostics..." : "Run Transaction Diagnostics"}
            </button>
            {diagResult && (
              <button
                className="ta-btn-primary"
                style={{ background: "var(--charcoal)", fontSize: 12 }}
                onClick={() => {
                  const text = JSON.stringify(diagResult, null, 2);
                  navigator.clipboard.writeText(text).then(() => {
                    const btn = document.getElementById("diag-copy-btn");
                    if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy Full Report"; }, 2000); }
                  });
                }}
                id="diag-copy-btn"
              >
                Copy Full Report
              </button>
            )}
          </div>

          {diagResult && (
            <div style={{ marginTop: 14 }}>
              {/* Summary banner */}
              {diagResult.summary && (
                <div style={{
                  padding: "12px 16px",
                  borderRadius: 8,
                  marginBottom: 14,
                  background: diagResult.summary.fail > 0 ? "#FEF2F2" : diagResult.summary.error > 0 ? "#FFFBEB" : "#ECFDF5",
                  border: `1px solid ${diagResult.summary.fail > 0 ? "#FECACA" : diagResult.summary.error > 0 ? "#FDE68A" : "#A7F3D0"}`,
                }}>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: diagResult.summary.fail > 0 ? "#DC2626" : "#059669" }}>
                      {diagResult.summary.fail > 0 ? "ISSUES DETECTED" : "ALL CLEAR"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--stone)" }}>{diagResult.summary.durationMs}ms</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {diagResult.summary.pass > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "#059669", background: "#ECFDF5", padding: "2px 8px", borderRadius: 4 }}>PASS: {diagResult.summary.pass}</span>}
                    {diagResult.summary.fail > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626", background: "#FEF2F2", padding: "2px 8px", borderRadius: 4 }}>FAIL: {diagResult.summary.fail}</span>}
                    {diagResult.summary.error > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "#D97706", background: "#FFFBEB", padding: "2px 8px", borderRadius: 4 }}>ERROR: {diagResult.summary.error}</span>}
                    {diagResult.summary.warn > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "#D97706", background: "#FFFBEB", padding: "2px 8px", borderRadius: 4 }}>WARN: {diagResult.summary.warn}</span>}
                    {diagResult.summary.info > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "#2563EB", background: "#EFF6FF", padding: "2px 8px", borderRadius: 4 }}>INFO: {diagResult.summary.info}</span>}
                  </div>
                  {diagResult.summary.verdict && (
                    <div style={{ marginTop: 10, fontSize: 12, fontWeight: 500, color: "var(--charcoal)", lineHeight: 1.5 }}>
                      {diagResult.summary.verdict}
                    </div>
                  )}
                </div>
              )}

              {/* Individual test results */}
              {(diagResult.tests || []).map((test, i) => {
                const statusColors = { PASS: "#059669", FAIL: "#DC2626", ERROR: "#D97706", INFO: "#2563EB", WARN: "#D97706" };
                const statusBgs = { PASS: "#ECFDF5", FAIL: "#FEF2F2", ERROR: "#FFFBEB", INFO: "#EFF6FF", WARN: "#FFFBEB" };
                const statusBorders = { PASS: "#A7F3D0", FAIL: "#FECACA", ERROR: "#FDE68A", INFO: "#BFDBFE", WARN: "#FDE68A" };
                const hasSubmissions = test.details?.submissions && Array.isArray(test.details.submissions);
                const stepStatusColors = { OK: "#059669", MISSING: "#DC2626", WARN: "#D97706", SKIPPED: "#64748B", "N/A": "#94A3B8" };
                return (
                  <div key={i} style={{
                    padding: "10px 14px",
                    borderRadius: 6,
                    marginBottom: 8,
                    background: statusBgs[test.status] || "#F8FAFC",
                    border: `1px solid ${statusBorders[test.status] || "#E2E8F0"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: "#fff",
                        background: statusColors[test.status] || "#64748B",
                        padding: "1px 6px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.05em",
                      }}>{test.status}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--charcoal)" }}>{test.name}</span>
                      {test.codeFixed === true && <span style={{ fontSize: 8, fontWeight: 700, color: "#fff", background: "#059669", padding: "1px 5px", borderRadius: 3 }}>CODE FIXED</span>}
                      {test.codeFixed === false && <span style={{ fontSize: 8, fontWeight: 700, color: "#fff", background: "#D97706", padding: "1px 5px", borderRadius: 3 }}>NEEDS FIX</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--charcoal)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{test.description}</div>
                    {test.rootCause && (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ fontSize: 10, color: "#7C3AED", cursor: "pointer", fontWeight: 600 }}>Root cause</summary>
                        <div style={{ fontSize: 10, color: "var(--charcoal)", lineHeight: 1.5, padding: "4px 8px", marginTop: 2, background: "rgba(124,58,237,0.05)", borderRadius: 4 }}>{test.rootCause}</div>
                      </details>
                    )}
                    {test.remediation && (
                      <details style={{ marginTop: 2 }}>
                        <summary style={{ fontSize: 10, color: "#2563EB", cursor: "pointer", fontWeight: 600 }}>Remediation</summary>
                        <div style={{ fontSize: 10, color: "var(--charcoal)", lineHeight: 1.5, padding: "4px 8px", marginTop: 2, background: "rgba(37,99,235,0.05)", borderRadius: 4 }}>{test.remediation}</div>
                      </details>
                    )}

                    {/* Per-submission pipeline audit — rich rendering */}
                    {hasSubmissions && (
                      <div style={{ marginTop: 8 }}>
                        {test.details.submissions.map((sub, si) => (
                          <details key={si} style={{ marginBottom: 4 }} open={sub.issueCount > 0}>
                            <summary style={{
                              fontSize: 11, cursor: "pointer", padding: "6px 8px", borderRadius: 4,
                              background: sub.issueCount > 0 ? "rgba(220,38,38,0.08)" : "rgba(5,150,105,0.06)",
                              display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                            }}>
                              <span style={{
                                fontSize: 9, fontWeight: 700, color: "#fff", padding: "1px 5px", borderRadius: 3,
                                background: sub.issueCount > 0 ? "#DC2626" : "#059669",
                              }}>{sub.issueCount > 0 ? `${sub.issueCount} ISSUE${sub.issueCount > 1 ? "S" : ""}` : "CLEAN"}</span>
                              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--stone)" }}>{sub.id.slice(0, 8)}</span>
                              <span style={{
                                fontSize: 9, fontWeight: 600, color: "#fff", padding: "1px 5px", borderRadius: 3,
                                background: sub.status === "approved" ? "#059669" : sub.status === "rejected" ? "#DC2626" : sub.status === "cross_review" ? "#7C3AED" : sub.status === "consensus" ? "#0D9488" : "#D97706",
                              }}>{sub.status.toUpperCase()}</span>
                              <span style={{ fontSize: 10, color: "var(--charcoal)" }}>{sub.submitter}</span>
                              <span style={{ fontSize: 10, color: "var(--stone)" }}>{sub.org}</span>
                            </summary>
                            <div style={{ padding: "8px 8px 4px 12px", borderLeft: "2px solid #E2E8F0", marginLeft: 8, marginTop: 4 }}>
                              {/* Issues list */}
                              {sub.issues.length > 0 && (
                                <div style={{ marginBottom: 8, padding: "6px 8px", background: "#FEF2F2", borderRadius: 4, border: "1px solid #FECACA" }}>
                                  {sub.issues.map((issue, ii) => (
                                    <div key={ii} style={{ fontSize: 10, color: "#DC2626", lineHeight: 1.5 }}>• {issue}</div>
                                  ))}
                                </div>
                              )}
                              {/* Pipeline steps table */}
                              <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
                                <tbody>
                                  {sub.pipelineSteps.map((step, pi) => (
                                    <tr key={pi} style={{ borderBottom: "1px solid #F1F5F9" }}>
                                      <td style={{ padding: "3px 6px", width: 50 }}>
                                        <span style={{
                                          fontSize: 8, fontWeight: 700, color: "#fff", padding: "0px 4px", borderRadius: 2,
                                          background: stepStatusColors[step.status] || "#64748B",
                                        }}>{step.status}</span>
                                      </td>
                                      <td style={{ padding: "3px 6px", fontWeight: 500, color: "var(--charcoal)", whiteSpace: "nowrap" }}>{step.step}</td>
                                      <td style={{ padding: "3px 6px", color: "var(--stone)" }}>{step.actual}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        ))}
                      </div>
                    )}

                    {/* Ghost votes / forensics — rich rendering */}
                    {test.details?.ghostVotes && test.details.ghostVotes.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#DC2626", marginBottom: 4 }}>Ghost Votes (saved to DB, user got 500 error):</div>
                        {test.details.ghostVotes.map((gv, gi) => (
                          <div key={gi} style={{ fontSize: 10, padding: "4px 8px", background: "rgba(220,38,38,0.05)", borderRadius: 4, marginBottom: 2, fontFamily: "var(--mono)" }}>
                            {gv.user} voted {gv.approve ? "APPROVE" : "REJECT"} on {gv.submission?.slice(0,8)} ({gv.role}) at {gv.votedAt} — sub is now {gv.subStatus}
                          </div>
                        ))}
                      </div>
                    )}

                    {test.details?.duplicateVotes && test.details.duplicateVotes.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#DC2626", marginBottom: 4 }}>Duplicate Votes (race condition — broken FOR UPDATE lock):</div>
                        {test.details.duplicateVotes.map((dv, di) => (
                          <div key={di} style={{ fontSize: 10, padding: "4px 8px", background: "rgba(220,38,38,0.05)", borderRadius: 4, marginBottom: 2, fontFamily: "var(--mono)" }}>
                            user {dv.user_id?.slice(0,8)} voted {dv.vote_count}x on {dv.submission_id?.slice(0,8)} ({dv.role})
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reputation mismatches — rich rendering */}
                    {test.details?.mismatches && test.details.mismatches.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#DC2626", marginBottom: 4 }}>Reputation Drift:</div>
                        {test.details.mismatches.map((mm, mi) => (
                          <div key={mi} style={{ fontSize: 10, padding: "4px 8px", background: "rgba(220,38,38,0.05)", borderRadius: 4, marginBottom: 2 }}>
                            <span style={{ fontWeight: 600 }}>{mm.user}</span>
                            {mm.wins.delta !== 0 && <span style={{ marginLeft: 8 }}>wins: {mm.wins.actual} (expected {mm.wins.expected}, delta {mm.wins.delta > 0 ? "+" : ""}{mm.wins.delta})</span>}
                            {mm.losses.delta !== 0 && <span style={{ marginLeft: 8 }}>losses: {mm.losses.actual} (expected {mm.losses.expected}, delta {mm.losses.delta > 0 ? "+" : ""}{mm.losses.delta})</span>}
                            {mm.lies.delta !== 0 && <span style={{ marginLeft: 8 }}>lies: {mm.lies.actual} (expected {mm.lies.expected})</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Fallback raw details for tests without rich rendering */}
                    {test.details && !hasSubmissions && !test.details.ghostVotes && !test.details.mismatches && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ fontSize: 10, color: "var(--stone)", cursor: "pointer", fontFamily: "var(--mono)" }}>Raw details</summary>
                        <pre style={{ fontSize: 10, color: "var(--stone)", marginTop: 4, overflow: "auto", maxHeight: 200, background: "rgba(0,0,0,0.03)", padding: 8, borderRadius: 4 }}>
                          {JSON.stringify(test.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })}

              {/* Error fallback */}
              {diagResult.error && !diagResult.tests && (
                <div style={{ padding: 10, background: "#FEF2F2", borderRadius: 6, fontSize: 11, fontFamily: "var(--mono)", color: "var(--fired-clay)" }}>
                  Error: {diagResult.error}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <h2 className="ta-section-head">{isAdmin ? "Feedback & Feature Requests" : "My Feedback"}</h2>
      <p style={{ fontSize: 13, color: "var(--stone)", marginBottom: 20 }}>
        {isAdmin ? `${items.length} submission${items.length !== 1 ? "s" : ""} from beta users` : `${items.length} submission${items.length !== 1 ? "s" : ""} you've sent`}
      </p>
      {items.length === 0 && <div className="ta-card" style={{ textAlign: "center", color: "var(--stone)" }}>No feedback yet.</div>}
      {items.map(item => (
        <div key={item.id} className="ta-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{item.username === ADMIN_USERNAME ? "👑 " : ""}@{item.username}</span>
              {item.status && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", backgroundColor: FEEDBACK_STATUS_COLORS[item.status] || "#999", padding: "1px 8px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {FEEDBACK_STATUS_LABELS[item.status] || item.status}
                </span>
              )}
              {item.user_resolution && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", backgroundColor: item.user_resolution === "resolved" ? "#059669" : "#EA580C", padding: "1px 8px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {item.user_resolution === "resolved" ? "Resolved" : "Needs Work"}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: "var(--stone)" }}>{new Date(item.created_at).toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--charcoal)", whiteSpace: "pre-wrap" }}>{item.message}</div>

          {/* Admin reply display */}
          {item.admin_reply && (
            <div style={{ marginTop: 12, padding: "10px 14px", backgroundColor: "#F0F7FF", border: "1px solid #BFDBFE", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", marginBottom: 4 }}>Admin Response · {new Date(item.admin_reply_at).toLocaleString()}</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--charcoal)", whiteSpace: "pre-wrap" }}>{item.admin_reply}</div>
            </div>
          )}

          {/* User resolution display */}
          {item.user_resolution && item.user_resolution_note && (
            <div style={{ marginTop: 8, padding: "8px 12px", backgroundColor: item.user_resolution === "resolved" ? "#ECFDF5" : "#FFF7ED", border: `1px solid ${item.user_resolution === "resolved" ? "#A7F3D0" : "#FED7AA"}`, borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: item.user_resolution === "resolved" ? "#059669" : "#EA580C", marginBottom: 2 }}>User Feedback</div>
              <div style={{ fontSize: 12, lineHeight: 1.4, color: "var(--charcoal)" }}>{item.user_resolution_note}</div>
            </div>
          )}

          {/* Admin reply form */}
          {isAdmin && replyingTo === item.id && (
            <div style={{ marginTop: 12, padding: "12px", backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8 }}>
              <div className="ta-field" style={{ marginBottom: 10 }}>
                <label>Status</label>
                <select value={replyStatus} onChange={e => setReplyStatus(e.target.value)} style={{ padding: "6px 10px", fontSize: 13 }}>
                  <option value="accepted">Accepted</option>
                  <option value="roadmapped">Roadmapped</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="ta-field" style={{ marginBottom: 10 }}>
                <label>Reply</label>
                <textarea value={replyText} onChange={e => { if (e.target.value.length <= 1000) setReplyText(e.target.value); }} rows={3} placeholder="Your response to this feedback..." style={{ fontSize: 13 }} />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="ta-btn-secondary" onClick={() => { setReplyingTo(null); setReplyText(""); }}>Cancel</button>
                <button className="ta-btn-primary" onClick={() => sendReply(item.id)} disabled={replySending || !replyText.trim()}>
                  {replySending ? "Sending..." : "Send Reply"}
                </button>
              </div>
            </div>
          )}

          {/* Admin reply button */}
          {isAdmin && replyingTo !== item.id && (
            <div style={{ marginTop: 8 }}>
              <button className="ta-btn-ghost" style={{ fontSize: 11, color: "var(--accent)" }} onClick={() => { setReplyingTo(item.id); setReplyText(item.admin_reply || ""); setReplyStatus(item.status || "accepted"); }}>
                {item.admin_reply ? "Edit Reply" : "Reply"}
              </button>
            </div>
          )}

          {/* User resolution form — only for completed items belonging to the current user */}
          {!isAdmin && item.status === "completed" && !item.user_resolution && item.username === currentUsername && (
            <div style={{ marginTop: 12, padding: "12px", backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#92400E", marginBottom: 8 }}>This item has been marked as completed. Is it resolved?</div>
              {resolvingId === item.id ? (
                <>
                  <div className="ta-field" style={{ marginBottom: 10 }}>
                    <label>Feedback (optional)</label>
                    <textarea value={resolutionNote} onChange={e => { if (e.target.value.length <= 500) setResolutionNote(e.target.value); }} rows={2} placeholder="Any additional notes..." style={{ fontSize: 12 }} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ta-btn-primary" style={{ background: "#059669", fontSize: 12 }} onClick={() => sendResolution(item.id, "resolved")} disabled={resolveSending}>Resolved</button>
                    <button className="ta-btn-primary" style={{ background: "#EA580C", fontSize: 12 }} onClick={() => sendResolution(item.id, "needs_work")} disabled={resolveSending}>Needs Work</button>
                    <button className="ta-btn-ghost" onClick={() => { setResolvingId(null); setResolutionNote(""); }}>Cancel</button>
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="ta-btn-primary" style={{ background: "#059669", fontSize: 12 }} onClick={() => sendResolution(item.id, "resolved")}>Resolved</button>
                  <button className="ta-btn-secondary" style={{ fontSize: 12 }} onClick={() => setResolvingId(item.id)}>Needs Work (with feedback)</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

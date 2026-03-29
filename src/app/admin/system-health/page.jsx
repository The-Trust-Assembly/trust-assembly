"use client";

import { useState, useCallback, useEffect } from "react";

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
  const [authState, setAuthState] = useState("loading"); // "loading" | "authorized" | "unauthorized"
  const [report, setReport] = useState(null);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(null);
  const [expandedError, setExpandedError] = useState(null);
  const [diagResult, setDiagResult] = useState(null);
  const [processResult, setProcessResult] = useState(null);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementLoaded, setAnnouncementLoaded] = useState(false);
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [announcementMsg, setAnnouncementMsg] = useState(null);
  const [recomputeResult, setRecomputeResult] = useState(null);
  const [importTestResult, setImportTestResult] = useState(null);
  const [importTestLoading, setImportTestLoading] = useState(false);
  const [juryTestResult, setJuryTestResult] = useState(null);
  const [juryTestLoading, setJuryTestLoading] = useState(false);
  const [repairResult, setRepairResult] = useState(null);
  const [diLinkResult, setDiLinkResult] = useState(null);
  const [adminFlagResult, setAdminFlagResult] = useState(null);
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [userPages, setUserPages] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteMsg, setDeleteMsg] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [rulesData, setRulesData] = useState(null);
  const [rulesLoading, setRulesLoading] = useState(false);

  const getAuthHeaders = useCallback(() => {
    const cookies = document.cookie.split(";").map(c => c.trim());
    const sessionCookie = cookies.find(c => c.startsWith("session="));
    const token = sessionCookie?.split("=")[1];
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  // Admin auth guard — verify the user is an admin on mount
  // The ta-session cookie is httpOnly so we can't read it client-side;
  // just make the request and let the browser send it automatically.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/users?limit=1", {
          headers: getAuthHeaders(),
          credentials: "same-origin",
        });
        setAuthState(res.ok ? "authorized" : "unauthorized");
      } catch {
        setAuthState("unauthorized");
      }
    })();
  }, [getAuthHeaders]);

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

  const processRecords = useCallback(async () => {
    setLoading("process");
    setProcessResult(null);
    try {
      const res = await fetch("/api/admin/process-records", {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProcessResult(data);
    } catch (e) {
      setProcessResult({ success: false, message: `Failed: ${e}` });
    } finally {
      setLoading(null);
    }
  }, [getAuthHeaders]);

  const loadAnnouncement = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/announcement");
      if (res.ok) {
        const data = await res.json();
        setAnnouncementText(data.announcement || "");
        setAnnouncementLoaded(true);
      }
    } catch {}
  }, []);

  const saveAnnouncement = useCallback(async () => {
    setAnnouncementSaving(true);
    setAnnouncementMsg(null);
    try {
      const res = await fetch("/api/admin/announcement", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: announcementText }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAnnouncementMsg({ ok: true, text: announcementText ? "Announcement updated" : "Announcement cleared" });
    } catch (e) {
      setAnnouncementMsg({ ok: false, text: `Failed: ${e}` });
    } finally {
      setAnnouncementSaving(false);
    }
  }, [getAuthHeaders, announcementText]);

  // Load announcement on mount
  useState(() => { loadAnnouncement(); });

  const runAdminAction = useCallback(async (endpoint, setter) => {
    setter({ loading: true });
    try {
      const res = await fetch(endpoint, { method: "POST", headers: getAuthHeaders() });
      const data = await res.json();
      setter(data);
    } catch (e) {
      setter({ success: false, error: e.message });
    }
  }, [getAuthHeaders]);

  const fetchUsers = useCallback(async (search, page) => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/users?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(data.users);
      setUserTotal(data.total);
      setUserPages(data.pages);
      setUserPage(data.page);
    } catch (e) {
      alert(`Failed to load users: ${e}`);
    } finally {
      setUsersLoading(false);
    }
  }, [getAuthHeaders]);

  const deleteUser = useCallback(async (userId, username) => {
    if (deleteConfirm !== username) {
      setDeleteMsg({ ok: false, text: "Type the username to confirm" });
      return;
    }
    setDeleteMsg(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteMsg({ ok: false, text: data.error || "Failed" });
        return;
      }
      setDeleteMsg({ ok: true, text: data.message });
      setDeletingUserId(null);
      setDeleteConfirm("");
      // Refresh the list
      fetchUsers(userSearch, userPage);
    } catch (e) {
      setDeleteMsg({ ok: false, text: `Error: ${e}` });
    }
  }, [getAuthHeaders, deleteConfirm, fetchUsers, userSearch, userPage]);

  // Loading state
  if (authState === "loading") {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#0f172a", color: "#94a3b8" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Verifying admin access...</div>
        </div>
      </div>
    );
  }

  // Unauthorized state
  if (authState === "unauthorized") {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#0f172a", color: "#e2e8f0" }}>
        <div style={{ textAlign: "center", background: "#1e293b", borderRadius: 12, padding: 40, border: "1px solid #ef4444", maxWidth: 440 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>&#128683;</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: "#ef4444" }}>Unauthorized</h1>
          <p style={{ color: "#94a3b8", marginBottom: 20, fontSize: 14 }}>
            You do not have admin privileges to access this page. Please log in with an admin account.
          </p>
          <a href="/" style={{ ...btnStyle, textDecoration: "none", display: "inline-block" }}>Return to Home</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#0f172a", minHeight: "100vh", color: "#e2e8f0" }}>
      {/* ── Navigation Bar ── */}
      <nav style={{ background: "#1e293b", borderBottom: "1px solid #334155", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 48 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/" style={{ color: "#e2e8f0", textDecoration: "none", fontWeight: 700, fontSize: 15 }}>Trust Assembly</a>
          <span style={{ color: "#334155" }}>|</span>
          <span style={{ color: "#8b5cf6", fontSize: 13, fontWeight: 600 }}>Admin Panel</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setShowHelp(!showHelp)} style={{ ...smallBtnStyle, background: showHelp ? "#3b82f6" : "#334155" }}>
            {showHelp ? "Hide Help" : "Help"}
          </button>
          <a href="/" style={{ ...smallBtnStyle, textDecoration: "none", display: "inline-block" }}>Home</a>
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>System Health Dashboard</h1>
      {report && (
        <p style={{ color: "#94a3b8", marginBottom: 24 }}>
          Last report: {new Date(report.generated_at).toLocaleString()} ({report.duration_ms}ms)
        </p>
      )}

      {/* ── Help Panel ── */}
      {showHelp && (
        <div style={{ background: "#1e293b", borderRadius: 8, padding: 20, marginBottom: 24, border: "1px solid #3b82f6" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 18, color: "#3b82f6" }}>Admin Panel Reference</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13, color: "#cbd5e1" }}>
            <div>
              <h4 style={{ color: "#f59e0b", margin: "0 0 4px", fontSize: 14 }}>Site Announcement</h4>
              <p style={{ margin: "0 0 12px" }}>Set a banner message that appears on the home page for all users. Clear the text and save to remove it. Max 2000 characters.</p>

              <h4 style={{ color: "#22c55e", margin: "0 0 4px", fontSize: 14 }}>Process Stuck Records</h4>
              <p style={{ margin: "0 0 12px" }}>Scans all in-flight submissions, stories, disputes, and concessions. If any have enough votes to be resolved but were never finalized (due to past bugs), this will advance them to their correct outcome. Safe to run repeatedly.</p>

              <h4 style={{ color: "#8b5cf6", margin: "0 0 4px", fontSize: 14 }}>User Management</h4>
              <p style={{ margin: "0 0 12px" }}>Search all registered users by username, display name, or email. View activity stats (submissions, votes, org memberships, win/loss record). Delete accounts to anonymize PII &mdash; submissions and votes are preserved for audit integrity. Admin accounts cannot be deleted.</p>
            </div>
            <div>
              <h4 style={{ color: "#e2e8f0", margin: "0 0 4px", fontSize: 14 }}>Admin Tools</h4>
              <ul style={{ margin: "0 0 12px", paddingLeft: 16 }}>
                <li style={{ marginBottom: 4 }}><strong>Set Admin Flag</strong> &mdash; Bootstrap your admin privileges if your is_admin column was not set during migration. Only works for the hardcoded admin username.</li>
                <li style={{ marginBottom: 4 }}><strong>Recompute Stats</strong> &mdash; Recalculates all user reputation stats (wins, losses, streaks, deliberate lies, dispute outcomes) from source data. Idempotent and safe to run anytime.</li>
                <li style={{ marginBottom: 4 }}><strong>Repair Historical Data</strong> &mdash; Runs 21 repair operations: fixes NULL org IDs, duplicate votes, missing audit logs, DI partnerships, stalled submissions, and more. Includes rollback on failure.</li>
                <li style={{ marginBottom: 4 }}><strong>Force-Link DI Partners</strong> &mdash; One-shot migration tool that approves all registered DI users as partners and backfills di_partner_id on pending submissions.</li>
              </ul>

              <h4 style={{ color: "#e2e8f0", margin: "0 0 4px", fontSize: 14 }}>Diagnostics &amp; Reconciliation</h4>
              <ul style={{ margin: "0 0 12px", paddingLeft: 16 }}>
                <li style={{ marginBottom: 4 }}><strong>Run Reconciliation Report</strong> &mdash; Generates a full system health snapshot: transaction chain status, error counts, stuck records, orphaned data, and reputation drift.</li>
                <li style={{ marginBottom: 4 }}><strong>Run Transaction Diagnostics</strong> &mdash; Tests all transaction chains end-to-end to verify they complete without errors.</li>
                <li style={{ marginBottom: 4 }}><strong>Run Ghost Tests Only</strong> &mdash; Checks specifically for ghost users (exist in DB but filtered out of data endpoints).</li>
                <li style={{ marginBottom: 4 }}><strong>Auto-Repair</strong> &mdash; Runs diagnostics and automatically fixes any issues found. Use with caution.</li>
                <li style={{ marginBottom: 4 }}><strong>Export Debug Report</strong> &mdash; Downloads the latest reconciliation report as a JSON file for offline analysis.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin Announcement ── */}
      <div style={{ background: "#1e293b", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #f59e0b" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16, color: "#f59e0b" }}>Site Announcement</h3>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 10px" }}>
          This text appears on the home page for all users. Clear the box and save to remove it.
        </p>
        <textarea
          value={announcementText}
          onChange={e => { if (e.target.value.length <= 2000) setAnnouncementText(e.target.value); }}
          rows={4}
          placeholder="Enter announcement text for all users..."
          style={{ width: "100%", padding: "10px 12px", fontSize: 14, background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 6, resize: "vertical", boxSizing: "border-box", fontFamily: "system-ui, sans-serif" }}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
          <button onClick={saveAnnouncement} disabled={announcementSaving} style={{ ...btnStyle, background: "#f59e0b", color: "#000" }}>
            {announcementSaving ? "Saving..." : "Update Announcement"}
          </button>
          {announcementText && (
            <button onClick={() => { setAnnouncementText(""); }} style={{ ...btnStyle, background: "#334155" }}>
              Clear
            </button>
          )}
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{announcementText.length}/2000</span>
          {announcementMsg && (
            <span style={{ fontSize: 12, color: announcementMsg.ok ? "#22c55e" : "#ef4444" }}>
              {announcementMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* ── Process Stuck Records ── */}
      <div style={{ background: "#1e293b", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #22c55e" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#22c55e" }}>Process Stuck Records</h3>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 10px" }}>
          Scans all in-flight submissions, stories, disputes, and concessions. Advances any that have enough votes but were never resolved due to older process bugs.
        </p>
        <button onClick={processRecords} disabled={loading !== null} style={{ ...btnStyle, background: "#22c55e", color: "#000" }}>
          {loading === "process" ? "Processing..." : "Process All Stuck Records"}
        </button>
        {processResult && (
          <div style={{ marginTop: 12, padding: 12, background: "#0f172a", borderRadius: 6, border: `1px solid ${processResult.success ? "#22c55e" : "#ef4444"}` }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: processResult.success ? "#22c55e" : "#ef4444", marginBottom: 6 }}>
              {processResult.message}
            </div>
            {processResult.results && Object.entries(processResult.results).map(([type, data]) => (
              <div key={type} style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#94a3b8", textTransform: "capitalize" }}>{type}: </span>
                <span style={{ fontSize: 12, color: "#e2e8f0" }}>{data.scanned} scanned, {data.advanced} advanced</span>
                {data.details.length > 0 && (
                  <div style={{ marginTop: 4, paddingLeft: 12 }}>
                    {data.details.map((d, i) => (
                      <div key={i} style={{ fontSize: 11, color: "#22c55e", fontFamily: "monospace" }}>{d}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Import Service Tests ── */}
      <div style={{ background: "#1e293b", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #b45309" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#b45309" }}>Import Service &amp; Platform Detection Tests</h3>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 10px" }}>
          Tests the URL import pipeline: platform detection (26 URL patterns across 5 templates), URL normalization (tracking param stripping), and live import extraction (fetches a real URL and verifies field extraction). Safe to run anytime.
        </p>
        <button onClick={async () => {
          setImportTestLoading(true); setImportTestResult(null);
          try {
            const res = await fetch("/api/admin/test-import", { method: "POST" });
            const data = await res.json();
            setImportTestResult(data.data || data);
          } catch (e) { setImportTestResult({ error: e.message || "Failed" }); }
          setImportTestLoading(false);
        }} disabled={importTestLoading} style={{ ...btnStyle, background: "#b45309" }}>
          {importTestLoading ? "Running Tests..." : "Run Import Tests"}
        </button>
        {importTestResult && !importTestResult.error && (
          <div style={{ marginTop: 12, padding: 12, background: "#0f172a", borderRadius: 6, border: `1px solid ${importTestResult.summary?.failed === 0 ? "#22c55e" : "#ef4444"}` }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: importTestResult.summary?.failed === 0 ? "#22c55e" : "#ef4444", marginBottom: 8 }}>
              {importTestResult.summary?.passed}/{importTestResult.summary?.total} passed
              {importTestResult.summary?.skipped > 0 && `, ${importTestResult.summary.skipped} skipped`}
              {importTestResult.summary?.failed > 0 && `, ${importTestResult.summary.failed} FAILED`}
              {" "}({importTestResult.summary?.durationMs}ms)
            </div>
            {importTestResult.suites && Object.entries(importTestResult.suites).map(([suite, data]) => (
              <div key={suite} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>
                  {suite.replace(/([A-Z])/g, " $1").trim()} — {data.passed}/{data.total}
                </div>
                {data.tests.filter(t => t.status !== "pass").map((t, i) => (
                  <div key={i} style={{ fontSize: 11, color: t.status === "fail" ? "#ef4444" : "#f59e0b", fontFamily: "monospace", paddingLeft: 12, marginBottom: 2 }}>
                    {t.status === "fail" ? "FAIL" : "SKIP"}: {t.name} — {t.details}
                  </div>
                ))}
                {data.tests.every(t => t.status === "pass") && (
                  <div style={{ fontSize: 11, color: "#22c55e", fontFamily: "monospace", paddingLeft: 12 }}>All {data.total} tests passed</div>
                )}
              </div>
            ))}
          </div>
        )}
        {importTestResult?.error && (
          <div style={{ marginTop: 12, padding: 12, background: "#0f172a", borderRadius: 6, border: "1px solid #ef4444" }}>
            <div style={{ fontSize: 12, color: "#ef4444" }}>Error: {importTestResult.error}</div>
          </div>
        )}
      </div>

      {/* ── Jury Integrity Tests ── */}
      <div style={{ background: "#1e293b", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #8b5cf6" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#8b5cf6" }}>Jury Integrity Tests</h3>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 10px" }}>
          Audits all jury assignments for conflicts of interest: self-review, AI Agent partner cross-review, dispute jurors who voted on the original, repeat jurors across rounds, invalid state transitions, stale assignments, resolution vote count integrity, stuck records, and duplicate votes.
        </p>
        <button onClick={async () => {
          setJuryTestLoading(true); setJuryTestResult(null);
          try {
            const res = await fetch("/api/admin/test-jury-integrity", { method: "POST" });
            const data = await res.json();
            setJuryTestResult(data.data || data);
          } catch (e) { setJuryTestResult({ error: e.message || "Failed" }); }
          setJuryTestLoading(false);
        }} disabled={juryTestLoading} style={{ ...btnStyle, background: "#8b5cf6" }}>
          {juryTestLoading ? "Running Tests..." : "Run Jury Integrity Tests"}
        </button>
        {juryTestResult && !juryTestResult.error && (
          <div style={{ marginTop: 12, padding: 12, background: "#0f172a", borderRadius: 6, border: `1px solid ${juryTestResult.summary?.failed === 0 ? "#22c55e" : "#ef4444"}` }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: juryTestResult.summary?.failed === 0 ? "#22c55e" : "#ef4444", marginBottom: 8 }}>
              {juryTestResult.summary?.passed}/{juryTestResult.summary?.total} passed
              {juryTestResult.summary?.warned > 0 && `, ${juryTestResult.summary.warned} warnings`}
              {juryTestResult.summary?.failed > 0 && `, ${juryTestResult.summary.failed} FAILED`}
              {" "}({juryTestResult.summary?.durationMs}ms)
            </div>
            {juryTestResult.tests && juryTestResult.tests.map((t, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ color: t.status === "pass" ? "#22c55e" : t.status === "warn" ? "#f59e0b" : "#ef4444", fontWeight: 700, fontFamily: "monospace", minWidth: 36 }}>
                    {t.status === "pass" ? "PASS" : t.status === "warn" ? "WARN" : "FAIL"}
                  </span>
                  <span style={{ color: "#e2e8f0" }}>{t.name}</span>
                  {t.count > 0 && <span style={{ color: t.status === "pass" ? "#22c55e" : t.status === "warn" ? "#f59e0b" : "#ef4444", fontFamily: "monospace", fontSize: 11 }}>({t.count})</span>}
                </div>
                {t.details.length > 0 && (
                  <div style={{ paddingLeft: 42, marginTop: 2 }}>
                    {t.details.map((d, j) => (
                      <div key={j} style={{ fontSize: 10, color: t.status === "fail" ? "#ef4444" : "#f59e0b", fontFamily: "monospace" }}>{d}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {juryTestResult?.error && (
          <div style={{ marginTop: 12, padding: 12, background: "#0f172a", borderRadius: 6, border: "1px solid #ef4444" }}>
            <div style={{ fontSize: 12, color: "#ef4444" }}>Error: {juryTestResult.error}</div>
          </div>
        )}
      </div>

      {/* ── Active Rules & System Configuration ── */}
      <div style={{ background: "#1e293b", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #10b981" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#10b981" }}>Active Rules & System Configuration</h3>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px" }}>Live view of all rules currently governing the system based on population and assembly sizes.</p>
        <button onClick={async () => { setRulesLoading(true); try { const r = await fetch("/api/admin/active-rules"); const d = await r.json(); setRulesData(d); } catch (e) { alert("Failed: " + e); } setRulesLoading(false); }} disabled={rulesLoading} style={{ ...btnStyle, background: "#10b981", color: "#000" }}>
          {rulesLoading ? "Loading..." : "Fetch Active Rules"}
        </button>
        {rulesData && (
          <div style={{ marginTop: 16 }}>
            {/* System Mode */}
            <div style={{ padding: 12, background: rulesData.systemMode?.wildWest ? "#422006" : "#052e16", border: `1px solid ${rulesData.systemMode?.wildWest ? "#f59e0b" : "#22c55e"}`, borderRadius: 6, marginBottom: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: rulesData.systemMode?.wildWest ? "#f59e0b" : "#22c55e" }}>
                {rulesData.systemMode?.wildWest ? "WILD WEST MODE" : "STANDARD MODE"}
              </div>
              <div style={{ fontSize: 13, color: "#e2e8f0", marginTop: 4 }}>
                {rulesData.systemMode?.totalUsers} / {rulesData.systemMode?.wildWestThreshold} users
                {rulesData.systemMode?.wildWest && <span style={{ color: "#f59e0b" }}> — {rulesData.systemMode.wildWestThreshold - rulesData.systemMode.totalUsers} more needed to exit Wild West</span>}
              </div>
              <div style={{ marginTop: 6, height: 6, background: "#334155", borderRadius: 3 }}>
                <div style={{ height: 6, background: rulesData.systemMode?.wildWest ? "#f59e0b" : "#22c55e", borderRadius: 3, width: `${Math.min(100, (rulesData.systemMode?.totalUsers / rulesData.systemMode?.wildWestThreshold) * 100)}%` }} />
              </div>
              {rulesData.systemMode?.wildWest && rulesData.systemMode?.wildWestEffects?.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#fcd34d" }}>
                  {rulesData.systemMode.wildWestEffects.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}
            </div>

            {/* Cross-Group Status */}
            <div style={{ padding: 12, background: "#0f172a", border: `1px solid ${rulesData.crossGroup?.active ? "#7c3aed" : "#334155"}`, borderRadius: 6, marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: rulesData.crossGroup?.active ? "#7c3aed" : "#94a3b8" }}>
                Cross-Group Review: {rulesData.crossGroup?.active ? "ACTIVE" : "INACTIVE"}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                {rulesData.crossGroup?.qualifyingAssemblies} / {rulesData.crossGroup?.requiredAssemblies} qualifying assemblies (each needs {rulesData.crossGroup?.qualifyingThreshold}+ members)
                {rulesData.crossGroup?.active && <span> · Jury size: <strong style={{ color: "#e2e8f0" }}>{rulesData.crossGroup.crossGroupJurySize}</strong> · Majority: <strong style={{ color: "#e2e8f0" }}>{rulesData.crossGroup.crossGroupMajority}</strong> · Max shared non-GP assemblies: {rulesData.crossGroup.maxSharedAssemblies}</span>}
              </div>
            </div>

            {/* Per-Assembly Rules Table */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 6 }}>Per-Assembly Rules</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead><tr style={{ borderBottom: "1px solid #334155" }}>
                    {["Assembly", "Members", "Jury", "Super Jury", "Majority", "Enrollment", "DI Limit", "Selection Rules"].map(h => (
                      <th key={h} style={{ ...thStyle, fontSize: 10 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {(rulesData.assemblies || []).map((a, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #1e293b", background: a.isGeneralPublic ? "rgba(13,148,136,0.08)" : "transparent" }}>
                        <td style={tdStyle}><strong>{a.name}</strong>{a.isGeneralPublic && <span style={{ color: "#0d9488", marginLeft: 4, fontSize: 9 }}>GP</span>}</td>
                        <td style={tdStyle}>{a.members}</td>
                        <td style={tdStyle}><strong>{a.jurySize}</strong></td>
                        <td style={tdStyle}>{a.superJurySize}</td>
                        <td style={tdStyle}>{a.majority}</td>
                        <td style={tdStyle}><span style={{ color: a.enrollmentMode === "tribal" ? "#f59e0b" : a.enrollmentMode === "open" ? "#22c55e" : "#7c3aed" }}>{a.enrollment}</span></td>
                        <td style={tdStyle}>{a.diSubmissionLimit}/day</td>
                        <td style={tdStyle}>
                          {a.jurySelectionRules?.joinDateFilter && <span style={{ background: "#334155", padding: "1px 4px", borderRadius: 3, marginRight: 3, fontSize: 9 }}>Join Filter</span>}
                          {a.jurySelectionRules?.noRepeatReviewer && <span style={{ background: "#334155", padding: "1px 4px", borderRadius: 3, marginRight: 3, fontSize: 9 }}>No-Repeat</span>}
                          {a.jurySelectionRules?.demographicDiversity && <span style={{ background: "#334155", padding: "1px 4px", borderRadius: 3, marginRight: 3, fontSize: 9 }}>Diversity</span>}
                          {a.jurySelectionRules?.cooldown24h && <span style={{ background: "#334155", padding: "1px 4px", borderRadius: 3, marginRight: 3, fontSize: 9 }}>24h Cool</span>}
                          {!a.jurySelectionRules?.joinDateFilter && !a.jurySelectionRules?.noRepeatReviewer && <span style={{ color: "#64748b", fontSize: 9 }}>None</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Global Rules + Scoring Weights */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ padding: 12, background: "#0f172a", border: "1px solid #334155", borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>Global Rules</div>
                {rulesData.globalRules && Object.entries(rulesData.globalRules).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "1px solid #1e293b" }}>
                    <span style={{ color: "#94a3b8" }}>{k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                    <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{String(v)}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: 12, background: "#0f172a", border: "1px solid #334155", borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>Scoring Weights (W)</div>
                {rulesData.scoringWeights && Object.entries(rulesData.scoringWeights).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "1px solid #1e293b" }}>
                    <span style={{ color: "#94a3b8" }}>{k}</span>
                    <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Concession Recovery + Rate Limits + Field Limits */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div style={{ padding: 12, background: "#0f172a", border: "1px solid #334155", borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>Concession Recovery</div>
                {(rulesData.concessionRecovery || []).map((c, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "1px solid #1e293b" }}>
                    <span style={{ color: "#94a3b8" }}>{c.window}</span>
                    <span style={{ color: c.recovery === "100%" ? "#22c55e" : c.recovery === "5%" ? "#ef4444" : "#e2e8f0", fontWeight: 600 }}>{c.recovery}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: 12, background: "#0f172a", border: "1px solid #334155", borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>Rate Limits</div>
                {rulesData.rateLimits && Object.entries(rulesData.rateLimits).map(([k, v]) => (
                  <div key={k} style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid #1e293b" }}>
                    <span style={{ color: "#94a3b8" }}>{k}: </span><span style={{ color: "#e2e8f0" }}>{String(v)}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: 12, background: "#0f172a", border: "1px solid #334155", borderRadius: 6, maxHeight: 200, overflowY: "auto" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>Field Limits</div>
                {rulesData.fieldLimits && Object.entries(rulesData.fieldLimits).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "2px 0", borderBottom: "1px solid #1e293b" }}>
                    <span style={{ color: "#94a3b8" }}>{k}</span>
                    <span style={{ color: "#e2e8f0" }}>{String(v).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 10, color: "#64748b", marginTop: 8 }}>Generated: {rulesData.generatedAt}</div>
          </div>
        )}
      </div>

      {/* ── Admin Tools ── */}
      <div style={{ background: "#1e293b", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #334155" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Admin Tools</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <button onClick={() => runAdminAction("/api/admin/set-admin-flag", setAdminFlagResult)} disabled={adminFlagResult?.loading} style={{ ...btnStyle, background: "#6b21a8" }}>
            {adminFlagResult?.loading ? "Setting..." : "Set Admin Flag"}
          </button>
          <button onClick={() => runAdminAction("/api/admin/recompute-stats", setRecomputeResult)} disabled={recomputeResult?.loading} style={{ ...btnStyle, background: "#b45309" }}>
            {recomputeResult?.loading ? "Running..." : "Recompute Stats"}
          </button>
          <button onClick={() => runAdminAction("/api/admin/repair-data", setRepairResult)} disabled={repairResult?.loading} style={{ ...btnStyle, background: "#0891b2" }}>
            {repairResult?.loading ? "Repairing..." : "Repair Historical Data"}
          </button>
          <button onClick={() => runAdminAction("/api/admin/force-di-partner", setDiLinkResult)} disabled={diLinkResult?.loading} style={{ ...btnStyle, background: "#ea580c" }}>
            {diLinkResult?.loading ? "Running..." : "Force-Link DI Partners"}
          </button>
        </div>
        {adminFlagResult && !adminFlagResult.loading && (
          <div style={{ padding: 8, borderRadius: 4, fontSize: 12, color: adminFlagResult.success ? "#22c55e" : "#ef4444", background: "#0f172a", marginBottom: 6 }}>
            {adminFlagResult.success ? adminFlagResult.message : (adminFlagResult.error || "Failed")}
          </div>
        )}
        {recomputeResult && !recomputeResult.loading && (
          <div style={{ padding: 8, borderRadius: 4, fontSize: 12, color: "#e2e8f0", background: "#0f172a", marginBottom: 6, maxHeight: 150, overflowY: "auto" }}>
            {(recomputeResult.report || []).map((line, i) => <div key={i}>{line}</div>)}
            {!recomputeResult.success && recomputeResult.error && <div style={{ color: "#ef4444" }}>{recomputeResult.error}</div>}
          </div>
        )}
        {repairResult && !repairResult.loading && (
          <div style={{ padding: 8, borderRadius: 4, fontSize: 12, color: "#e2e8f0", background: "#0f172a", marginBottom: 6, maxHeight: 200, overflowY: "auto" }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Repaired: {repairResult.totalRepaired || 0} item(s)</div>
            {(repairResult.report || []).map((line, i) => <div key={i}>{line}</div>)}
            {!repairResult.success && repairResult.error && <div style={{ color: "#ef4444" }}>{repairResult.error}</div>}
          </div>
        )}
        {diLinkResult && !diLinkResult.loading && (
          <div style={{ padding: 8, borderRadius: 4, fontSize: 12, color: "#e2e8f0", background: "#0f172a", marginBottom: 6, maxHeight: 150, overflowY: "auto" }}>
            {(diLinkResult.report || []).map((line, i) => <div key={i}>{line}</div>)}
            {!diLinkResult.success && diLinkResult.error && <div style={{ color: "#ef4444" }}>{diLinkResult.error}</div>}
          </div>
        )}
      </div>

      {/* ── User Management ── */}
      <div style={{ background: "#1e293b", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #8b5cf6" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#8b5cf6" }}>User Management</h3>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px" }}>
          Search and manage all registered users. Delete removes PII and deactivates the account (submissions and votes are preserved for audit).
        </p>

        {/* Search bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") fetchUsers(userSearch, 1); }}
            placeholder="Search by username, display name, or email..."
            style={{ flex: 1, padding: "8px 12px", fontSize: 13, background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 6, fontFamily: "system-ui, sans-serif" }}
          />
          <button onClick={() => fetchUsers(userSearch, 1)} disabled={usersLoading} style={btnStyle}>
            {usersLoading ? "Loading..." : "Search"}
          </button>
          {users.length > 0 && (
            <button onClick={() => { setUserSearch(""); setUsers([]); setUserTotal(0); }} style={{ ...btnStyle, background: "#334155" }}>
              Clear
            </button>
          )}
        </div>

        {/* Results summary */}
        {userTotal > 0 && (
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
            Showing {users.length} of {userTotal} user{userTotal !== 1 ? "s" : ""} (page {userPage}/{userPages})
          </div>
        )}

        {/* Delete message */}
        {deleteMsg && (
          <div style={{ padding: 8, borderRadius: 4, fontSize: 12, color: deleteMsg.ok ? "#22c55e" : "#ef4444", background: "#0f172a", marginBottom: 8, border: `1px solid ${deleteMsg.ok ? "#22c55e" : "#ef4444"}` }}>
            {deleteMsg.text}
          </div>
        )}

        {/* User table */}
        {users.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155" }}>
                  <th style={thStyle}>Username</th>
                  <th style={thStyle}>Display Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Joined</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Subs</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Votes</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Orgs</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>W/L</th>
                  <th style={thStyle}>Flags</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: "1px solid #1e293b" }}>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>
                      {u.username}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.display_name}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.email}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, whiteSpace: "nowrap" }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{u.submission_count}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{u.vote_count}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{u.org_count}</td>
                    <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>
                      <span style={{ color: "#22c55e" }}>{u.total_wins}</span>/<span style={{ color: "#ef4444" }}>{u.total_losses}</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {u.is_admin && <span style={{ fontSize: 9, background: "#6b21a8", color: "#fff", padding: "1px 4px", borderRadius: 3, fontWeight: 700 }}>ADMIN</span>}
                        {u.is_di && <span style={{ fontSize: 9, background: "#4f46e5", color: "#fff", padding: "1px 4px", borderRadius: 3, fontWeight: 700 }}>DI</span>}
                        {u.deliberate_lies > 0 && <span style={{ fontSize: 9, background: "#dc2626", color: "#fff", padding: "1px 4px", borderRadius: 3, fontWeight: 700 }}>LIES:{u.deliberate_lies}</span>}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {deletingUserId === u.id ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input
                            type="text"
                            value={deleteConfirm}
                            onChange={e => setDeleteConfirm(e.target.value)}
                            placeholder={`Type "${u.username}"`}
                            style={{ width: 120, padding: "3px 6px", fontSize: 11, background: "#0f172a", color: "#e2e8f0", border: "1px solid #ef4444", borderRadius: 3 }}
                          />
                          <button
                            onClick={() => deleteUser(u.id, u.username)}
                            style={{ ...smallBtnStyle, background: "#dc2626", color: "#fff", fontSize: 10 }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => { setDeletingUserId(null); setDeleteConfirm(""); setDeleteMsg(null); }}
                            style={{ ...smallBtnStyle, fontSize: 10 }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setDeletingUserId(u.id); setDeleteConfirm(""); setDeleteMsg(null); }}
                          disabled={u.is_admin}
                          style={{ ...smallBtnStyle, background: u.is_admin ? "#334155" : "#dc2626", color: u.is_admin ? "#64748b" : "#fff", fontSize: 10, cursor: u.is_admin ? "not-allowed" : "pointer" }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {userPages > 1 && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
                <button
                  onClick={() => fetchUsers(userSearch, userPage - 1)}
                  disabled={userPage <= 1 || usersLoading}
                  style={{ ...smallBtnStyle, opacity: userPage <= 1 ? 0.4 : 1 }}
                >
                  Previous
                </button>
                <span style={{ fontSize: 12, color: "#94a3b8", lineHeight: "28px" }}>
                  Page {userPage} of {userPages}
                </span>
                <button
                  onClick={() => fetchUsers(userSearch, userPage + 1)}
                  disabled={userPage >= userPages || usersLoading}
                  style={{ ...smallBtnStyle, opacity: userPage >= userPages ? 0.4 : 1 }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Diagnostics & Reconciliation ── */}
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Diagnostics &amp; Reconciliation</h2>
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button onClick={fetchReport} disabled={loading !== null} style={btnStyle}>
          {loading === "report" ? "Loading..." : "Run Reconciliation Report"}
        </button>
        <button onClick={() => runDiagnostic()} disabled={loading !== null} style={btnStyle}>
          {loading === "diagnostic" ? "Running..." : "Run Transaction Diagnostics"}
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
    </div>
  );
}

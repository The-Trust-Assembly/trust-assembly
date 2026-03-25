import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sDate } from "../lib/utils";
import { SubHeadline, StatusPill, AuditTrail, Empty, Icon } from "./ui";
import { queryKeys } from "../lib/queryKeys";

const safe = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export default function DIPanelContent({ user, subs, onReload }) {
  const qc = useQueryClient();
  const invalidateDI = () => { qc.invalidateQueries({ queryKey: queryKeys.submissions }); qc.invalidateQueries({ queryKey: queryKeys.users }); qc.invalidateQueries({ queryKey: queryKeys.diRequests }); };
  const [diReqs, setDiReqs] = useState({});
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { (async () => {
    try {
      const res = await fetch("/api/di-requests");
      if (res.ok) {
        const data = await res.json();
        const reqMap = {};
        for (const r of (data.requests || data.data || [])) {
          reqMap[r.di_username || r.id] = { ...r, diUsername: r.di_username, partnerUsername: user.username, status: r.status };
        }
        setDiReqs(reqMap);
      }
    } catch {}
  })(); }, []);

  // DI submissions awaiting my pre-approval (supports multiple DI partners)
  const myDIs = user.diPartners || (user.diPartner ? [user.diPartner] : []);
  const diQueue = subs ? Object.values(subs).filter(s => s.status === "di_pending" && (
    s.diPartner === user.username ||
    (s.isDI && myDIs.includes(s.submittedBy))
  )) : [];

  // Pending DI link requests
  const pendingLinks = Object.values(diReqs).filter(r => (r.partnerUsername === user.username || r.partner_user_id) && r.status === "pending");

  const approveDILink = async (diUsername) => {
    // Find the DI request ID from the loaded requests
    const req = Object.values(diReqs).find(r => r.diUsername === diUsername || r.di_username === diUsername);
    const reqId = req?.id;
    if (!reqId) { console.warn("DI request not found for", diUsername); return; }
    try {
      const res = await fetch(`/api/di-requests/${reqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (res.ok) {
        // Refresh DI requests from server
        const refreshRes = await fetch("/api/di-requests");
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          const reqMap = {};
          for (const r of (data.requests || data.data || [])) {
            reqMap[r.di_username || r.id] = { ...r, diUsername: r.di_username, partnerUsername: user.username, status: r.status };
          }
          setDiReqs(reqMap);
        }
      }
    } catch (e) { console.error("Failed to approve DI link:", e); }
    invalidateDI();
  };

  const rejectDILink = async (diUsername) => {
    const req = Object.values(diReqs).find(r => r.diUsername === diUsername || r.di_username === diUsername);
    const reqId = req?.id;
    if (!reqId) { console.warn("DI request not found for", diUsername); return; }
    try {
      const res = await fetch(`/api/di-requests/${reqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      if (res.ok) {
        const refreshRes = await fetch("/api/di-requests");
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          const reqMap = {};
          for (const r of (data.requests || data.data || [])) {
            reqMap[r.di_username || r.id] = { ...r, diUsername: r.di_username, partnerUsername: user.username, status: r.status };
          }
          setDiReqs(reqMap);
        }
      }
    } catch (e) { console.error("Failed to reject DI link:", e); }
    invalidateDI();
  };

  const approveDISub = async (subId) => {
    // ── Approve DI submission via relational API (single source of truth) ──
    try {
      const res = await fetch(`/api/submissions/${subId}/di-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || "Failed to approve"); return; }
    } catch (e) { setError("Network error approving submission"); return; }
    onReload(); invalidateDI();
  };

  const rejectDISub = async (subId) => {
    // ── Reject DI submission — deletes all records (quality gate, not a verdict) ──
    const reason = window.prompt("Optional: reason for rejecting this DI submission\n(Leave blank to use default)");
    if (reason === null) return; // user cancelled prompt
    try {
      const res = await fetch(`/api/submissions/${subId}/di-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: reason.trim() || undefined }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || "Failed to reject"); return; }
    } catch (e) { setError("Network error rejecting submission"); return; }
    onReload(); invalidateDI();
  };

  const approveAllDI = async () => {
    if (!confirmAll) { setConfirmAll(true); return; }
    for (const sub of diQueue) { await approveDISub(sub.id); }
    setConfirmAll(false);
  };

  return (
    <div>
      {/* DI Link Requests */}
      {pendingLinks.length > 0 && <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", color: "#4F46E5", marginBottom: 8 }}><Icon name="robot" size={16} /> DI Link Requests</div>
        {pendingLinks.map(r => (
          <div key={r.diUsername} className="ta-card" style={{ borderLeft: "4px solid #4F46E5", padding: 12 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}><strong>@{safe(r.diUsername)}</strong> wants to register as your Digital Intelligence</div>
            <div style={{ padding: 10, background: "#EEF2FF", borderRadius: 0, marginBottom: 8, fontSize: 12, color: "var(--text)", lineHeight: 1.6 }}>
              By approving, you accept responsibility for all of this DI's submissions. <strong>You receive the scoring</strong> — wins, losses, and deliberate deception penalties. You must pre-approve each submission before it enters jury review.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ta-btn-primary" style={{ background: "#4F46E5" }} onClick={() => approveDILink(r.diUsername)}>✓ Accept Responsibility</button>
              <button className="ta-btn-ghost" style={{ color: "var(--red)" }} onClick={() => rejectDILink(r.diUsername)}>✗ Reject</button>
            </div>
          </div>
        ))}
      </div>}

      {error && <div className="ta-error">{error}</div>}

      {/* DI Pre-Review Queue */}
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", color: "#4F46E5", marginBottom: 8 }}><Icon name="robot" size={16} /> DI Submissions Awaiting Your Approval ({diQueue.length})</div>
      {diQueue.length > 0 && <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        {confirmAll ? (
          <div style={{ padding: 10, background: "#FFF7ED", border: "1.5px solid #EA580C", borderRadius: 0, flex: 1 }}>
            <div style={{ fontSize: 12, color: "#EA580C", fontWeight: 600, marginBottom: 6 }}>⚠ Confirm: I have personally reviewed all {diQueue.length} pending DI submissions</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ta-btn-primary" style={{ background: "#EA580C" }} onClick={approveAllDI}>Yes, Approve All {diQueue.length}</button>
              <button className="ta-btn-ghost" onClick={() => setConfirmAll(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="ta-btn-secondary" style={{ fontSize: 10 }} onClick={approveAllDI}>Approve All ({diQueue.length})</button>
        )}
      </div>}
      {diQueue.length === 0 ? <Empty text="No DI submissions awaiting your pre-approval." /> : diQueue.map(sub => (
        <div key={sub.id} className="ta-card" style={{ borderLeft: "4px solid #4F46E5" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)" }}><Icon name="robot" size={14} /> @{safe(sub.submittedBy)} · {safe(sub.orgName)} · {sDate(sub.createdAt)}</span>
            <StatusPill status="di_pending" />
          </div>
          <a href={sub.url} target="_blank" rel="noopener" style={{ fontSize: 10, color: "#0D9488", wordBreak: "break-all" }}>{safe(sub.url)}</a>
          <div style={{ margin: "8px 0", padding: 10, background: "#F9FAFB", borderRadius: 0 }}>
            <SubHeadline sub={sub} />
          </div>
          <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>{safe(sub.reasoning)}</div>
          {sub.evidence && sub.evidence.length > 0 && <div style={{ marginTop: 6, fontSize: 10, color: "#0D9488" }}>{sub.evidence.length} evidence source{sub.evidence.length > 1 ? "s" : ""}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="ta-btn-primary" style={{ background: "#4F46E5", fontSize: 12 }} onClick={() => approveDISub(sub.id)}>✓ Approve for Review</button>
            <button className="ta-btn-ghost" style={{ color: "var(--red)", fontSize: 12 }} onClick={() => rejectDISub(sub.id)}>✗ Reject</button>
          </div>
          <AuditTrail entries={sub.auditTrail} />
        </div>
      ))}
    </div>
  );
}

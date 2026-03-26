import React, { useState, useEffect } from "react";
import { SK } from "../lib/constants";
import { sG } from "../lib/storage";
import { Loader, Empty } from "../components/ui";
import RecordDetailView from "../components/RecordDetailView";

export default function RecordScreen({ recordId, onBack, onViewCitizen }) {
  const [sub, setSub] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { const s = (await sG(SK.SUBS)) || {}; setSub(s[recordId] || null); setLoading(false); })(); }, [recordId]);
  if (loading) return <Loader />;
  if (!sub) return <div><button className="ta-btn-ghost" onClick={onBack} style={{ marginBottom: 10 }}>← Back</button><Empty text="Record not found." /></div>;

  const statusColor = sub.status === "consensus" ? "var(--gold)" : sub.status === "approved" ? "var(--green)" : sub.status === "rejected" || sub.status === "disputed" ? "var(--red)" : "var(--gold)";

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ padding: "8px 0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "var(--text-muted)" }}>
        <div><span style={{ color: "var(--gold)", cursor: "pointer" }} onClick={onBack}>Feed</span> → Submission</div>
        <span style={{ fontSize: 8, padding: "2px 6px", border: "1px solid rgba(212,168,67,0.27)", color: "var(--gold)", cursor: "pointer", letterSpacing: "1px" }}
          onClick={() => { navigator.clipboard.writeText(window.location.href); }}>COPY LINK</span>
      </div>

      {/* Detail header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span className={`type-badge ${sub.submissionType === "affirmation" ? "type-affirmation" : "type-correction"}`} style={{ display: "inline-block", marginBottom: 6 }}>
              {sub.submissionType === "affirmation" ? "AFFIRMATION" : "CORRECTION"}
            </span>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{sub.originalHeadline}</div>
            <div style={{ fontSize: 10, color: "var(--gold)", marginBottom: 4 }}>{sub.url}</div>
            <div style={{ height: 1, background: "rgba(212,168,67,0.4)", marginBottom: 4 }} />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Submitted by <span style={{ color: "var(--text)", fontWeight: 600 }}>@{sub.submittedBy}</span> · {sub.orgName}</div>
          </div>
          <span className={`status-badge ${sub.status === "approved" || sub.status === "consensus" ? "status-approved" : sub.status === "rejected" ? "status-rejected" : "status-pending"}`}
            style={{ fontSize: 10, padding: "4px 14px" }}>
            {sub.status?.toUpperCase()}
          </span>
        </div>
      </div>

      <RecordDetailView sub={sub} onViewCitizen={onViewCitizen} />
    </div>
  );
}

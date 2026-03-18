import React from "react";
import { anonName, sDate } from "../lib/utils";
import { UsernameLink, SubHeadline, StatusPill, AuditTrail } from "./ui";

export default function RecordDetailView({ sub, onViewCitizen, onDispute, canDispute }) {
  if (!sub) return null;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}>{sub.resolvedAt ? <UsernameLink username={sub.submittedBy} onClick={onViewCitizen} /> : <span>{anonName(sub.submittedBy, sub.anonMap, false)}</span>} · {sub.orgName} · {sDate(sub.createdAt)}{sub.trustedSkip ? " · 🛡 Trusted" : ""}{sub.isDI ? " · 🤖 DI" : ""}</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {sub.isDI && <span style={{ fontSize: 8, padding: "1px 5px", background: "#EEF2FF", color: "#4F46E5", borderRadius: 8, fontFamily: "var(--mono)", fontWeight: 700 }}>🤖 DIGITAL INTELLIGENCE</span>}
          {sub.trustedSkip && <span style={{ fontSize: 8, padding: "1px 5px", background: "#ECFDF5", color: "#059669", borderRadius: 8, fontFamily: "var(--mono)", fontWeight: 700 }}>TRUSTED — DISPUTABLE</span>}
          <StatusPill status={sub.status} />
        </div>
      </div>
      <a href={sub.url} target="_blank" rel="noopener" style={{ fontSize: 10, color: "#0D9488", wordBreak: "break-all" }}>{sub.url}</a>
      <div style={{ margin: "8px 0", padding: 10, background: "#F9FAFB", borderRadius: 8 }}>
        <SubHeadline sub={sub} size={15} />
      </div>
      <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.8, marginBottom: 10 }}>{sub.reasoning}</div>

      {sub.evidence && sub.evidence.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, background: "#F1F5F9", borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>📎 {sub.evidence.length} Evidence Source{sub.evidence.length > 1 ? "s" : ""}</div>
          {sub.evidence.map((e, i) => <div key={i} style={{ marginBottom: 8, fontSize: 12 }}><a href={e.url} target="_blank" rel="noopener" style={{ color: "#0D9488" }}>{e.url}</a>{e.explanation && <div style={{ color: "#475569", marginTop: 2 }}>↳ {e.explanation}</div>}</div>)}
        </div>
      )}

      {sub.inlineEdits && sub.inlineEdits.length > 0 && (
        <div style={{ marginTop: 14, padding: 12, background: "#F1F5F9", borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>{sub.inlineEdits.length} In-Line Edit{sub.inlineEdits.length > 1 ? "s" : ""}</div>
          {sub.inlineEdits.map((e, i) => (
            <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < sub.inlineEdits.length - 1 ? "1px solid #E2E8F0" : "none" }}>
              <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 4 }}>
                <span style={{ textDecoration: "line-through", color: "#64748B" }}>{e.original}</span> → <span style={{ color: "#DC2626", fontWeight: 600 }}>{e.replacement}</span>
                {e.reasoning && <div style={{ fontSize: 12, color: "#475569", marginTop: 1 }}>↳ {e.reasoning}</div>}
              </div>
              {e.approved !== undefined && (
                <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: e.approved ? "#059669" : "#DC2626", fontWeight: 700 }}>{e.approved ? "✓ APPROVED" : "✗ REJECTED"}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {sub.standingCorrection && (
        <div style={{ marginTop: 14, padding: 12, background: "#EFF6FF", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 3 }}>🏛 Standing Correction Proposed</div>
          <div style={{ color: "#1E293B", fontWeight: 600 }}>{sub.standingCorrection.assertion}</div>
          {sub.standingCorrection.evidence && <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>Source: {sub.standingCorrection.evidence}</div>}
        </div>
      )}

      {sub.argumentEntry && (
        <div style={{ marginTop: 8, padding: 10, background: "#EFF6FF", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#0D9488", marginBottom: 3 }}>⚔️ Argument Proposed</div>
          <div style={{ color: "#1E293B", lineHeight: 1.6 }}>{sub.argumentEntry.content}</div>
        </div>
      )}

      {sub.beliefEntry && (
        <div style={{ marginTop: 8, padding: 10, background: "#F3E8F9", border: "1px solid #9B7DB8", borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#7C3AED", marginBottom: 3 }}>🧭 Foundational Belief Proposed</div>
          <div style={{ color: "#1E293B", lineHeight: 1.6, fontStyle: "italic" }}>{sub.beliefEntry.content}</div>
        </div>
      )}

      {sub.translationEntry && (
        <div style={{ marginTop: 8, padding: 10, background: "#FFFBEB", border: "1px solid #B4530980", borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#B45309", marginBottom: 3 }}>🔄 Translation Proposed — {sub.translationEntry.type}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ textDecoration: "line-through", color: "#475569" }}>{sub.translationEntry.original}</span>
            <span style={{ color: "#B45309", fontWeight: 700 }}>→</span>
            <span style={{ color: "#B45309", fontWeight: 700 }}>{sub.translationEntry.translated}</span>
          </div>
        </div>
      )}

      {sub.linkedVaultEntries && sub.linkedVaultEntries.length > 0 && (
        <div style={{ marginTop: 10, padding: 10, background: "#F1F5F9", borderRadius: 8, border: "1px solid #E2E8F0" }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 8 }}>📎 {sub.linkedVaultEntries.length} Linked Vault Entr{sub.linkedVaultEntries.length === 1 ? "y" : "ies"}</div>
          {sub.linkedVaultEntries.map(e => {
            const tc = { correction: ["🏛", "#059669", "#ECFDF5"], argument: ["⚔️", "#0D9488", "#F0FDFA"], belief: ["🧭", "#7C3AED", "#F3E8F9"] }[e.type] || ["📎", "#475569", "#F1F5F9"];
            return <div key={e.id} style={{ marginBottom: 8, padding: "8px 10px", background: tc[2], border: `1px solid ${tc[1]}30`, borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: tc[1], fontWeight: 700 }}>{tc[0]} Existing {e.type}{e.survivalCount > 0 ? ` · survived ${e.survivalCount} review${e.survivalCount !== 1 ? "s" : ""}` : ""}</div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: "#1E293B" }}>{e.label}</div>
              {e.detail && <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>Source: {e.detail}</div>}
              {e.stillApplies !== undefined && (
                <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: e.stillApplies ? "#059669" : "#DC2626", fontWeight: 700 }}>{e.stillApplies ? "✓ STILL APPLIES" : "✗ NO LONGER VALID"}</span>
              )}
            </div>;
          })}
        </div>
      )}

      {/* Jury verdict tally + individual votes — visible after resolution */}
      {sub.resolvedAt && (() => {
        const allVotes = { ...(sub.votes || {}), ...(sub.crossGroupVotes || {}) };
        const voteEntries = Object.entries(allVotes);
        if (voteEntries.length === 0) return null;
        const approveCount = voteEntries.filter(([, v]) => v.approve).length;
        const rejectCount = voteEntries.filter(([, v]) => !v.approve).length;
        const isRejected = ["rejected", "consensus_rejected"].includes(sub.status);
        const allJurorRows = voteEntries.map(([voter, v]) => ({
          voter: sub.anonMap?.[voter] || voter,
          note: (v.note && v.note.trim()) ? v.note : "N/A — resolved before detailed review notes were recorded",
          approve: v.approve,
          time: v.time,
          hasNote: !!(v.note && v.note.trim()),
        }));
        return (
          <div style={{ marginTop: 14, padding: 12, background: isRejected ? "#FEF2F2" : "#F1F5F9", borderRadius: 8, border: `1px solid ${isRejected ? "#DC262640" : "#E2E8F0"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569" }}>Jury Verdict</div>
              <div style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 700 }}>
                <span style={{ color: "#059669" }}>{approveCount} Approve</span>
                <span style={{ color: "#64748B", margin: "0 4px" }}>&middot;</span>
                <span style={{ color: "#DC2626" }}>{rejectCount} Reject</span>
              </div>
            </div>
            {allJurorRows.map((n, i) => <div key={i} style={{ fontSize: 12, padding: "6px 8px", marginBottom: 4, background: n.approve ? "#ECFDF5" : "#FEF2F2", borderRadius: 6, borderLeft: `3px solid ${n.approve ? "#059669" : "#DC2626"}`, lineHeight: 1.5 }}>
              <span style={{ fontSize: 10, color: n.approve ? "#059669" : "#DC2626", fontFamily: "var(--mono)", fontWeight: 700 }}>{n.approve ? "APPROVE" : "REJECT"}</span> — <span style={n.hasNote ? {} : { color: "#94A3B8", fontStyle: "italic" }}>{n.note}</span>
            </div>)}
          </div>
        );
      })()}

      {sub.deliberateLieFinding && <div style={{ fontSize: 10, color: "#991B1B", fontFamily: "var(--mono)", fontWeight: 700, marginTop: 4 }}>⚠ DELIBERATE DECEPTION FINDING</div>}

      <AuditTrail entries={sub.auditTrail} />
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { SK, ADMIN_USERNAME } from "../lib/constants";
import { sG } from "../lib/storage";
import { anonName, sDate, hotScore } from "../lib/utils";
import { fileDispute } from "../lib/jury";
import { Loader, Empty, StatusPill, SubHeadline, UsernameLink, EvidenceFields, LegalDisclaimer } from "../components/ui";
import RecordDetailView from "../components/RecordDetailView";

export default function FeedScreen({ user, onNavigate, onViewCitizen, onViewRecord }) {
  const [subs, setSubs] = useState(null); const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [disputingId, setDisputingId] = useState(null);
  const [disputeForm, setDisputeForm] = useState({ reasoning: "", evidence: [{ url: "", explanation: "" }] });
  const [disputeError, setDisputeError] = useState(""); const [disputeSuccess, setDisputeSuccess] = useState("");
  const [taggingId, setTaggingId] = useState(null);
  const [stories, setStories] = useState({});
  const [tagMsg, setTagMsg] = useState("");
  const [approveMsg, setApproveMsg] = useState("");
  const [savedDrafts, setSavedDrafts] = useState([]);
  const isAdmin = user && user.username === ADMIN_USERNAME;

  const [loadError, setLoadError] = useState("");
  const load = async () => {
    try {
      const [subsData, orgsData, storiesData] = await Promise.all([sG(SK.SUBS), sG(SK.ORGS), sG(SK.STORIES)]);
      setSubs(subsData || {}); setOrgs(orgsData || {}); setStories(storiesData || {}); setLoadError("");
    } catch (e) {
      console.error("FeedScreen load error:", e);
      setLoadError("Failed to load data. Please refresh the page.");
      setSubs({}); setOrgs({});
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Load saved drafts
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch("/api/drafts");
        if (res.ok) { const data = await res.json(); setSavedDrafts(data.drafts || []); }
      } catch {}
    })();
  }, [user]);

  const canDispute = (sub) => {
    if (!user) return false;
    const userOrgs = user.orgIds || (user.orgId ? [user.orgId] : []);
    if (!userOrgs.includes(sub.orgId)) return false;
    // Approved/consensus: any member except submitter can dispute
    if (["approved", "consensus"].includes(sub.status)) return sub.submittedBy !== user.username;
    // Rejected: any member (including submitter) can dispute
    if (sub.status === "rejected") return true;
    return false;
  };

  const isRejectionDispute = (sub) => sub.status === "rejected";

  const approveAllPending = async () => {
    setApproveMsg("");
    try {
      const res = await fetch("/api/admin/approve-pending", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const count = data.data?.resolved || data.resolved || 0;
        setApproveMsg(count > 0 ? `Approved ${count} pending submission${count > 1 ? "s" : ""}.` : "No pending submissions found.");
      } else {
        setApproveMsg("Failed to approve pending submissions.");
      }
    } catch { setApproveMsg("Network error."); }
    load();
  };

  const submitDispute = async (subId) => {
    setDisputeError(""); setDisputeSuccess("");
    if (!disputeForm.reasoning.trim()) return setDisputeError("Reasoning required.");
    const validEvidence = disputeForm.evidence.filter(e => e.url.trim());
    for (const ev of validEvidence) {
      if (!/^https?:\/\/.+\..+/.test(ev.url.trim())) return setDisputeError("Evidence URLs must start with http:// or https://");
    }
    const sub = subs[subId];
    const disputeType = sub && sub.status === "rejected" ? "challenge_rejection" : "challenge_approval";
    const result = await fileDispute(subId, user.username, disputeForm.reasoning, validEvidence, {
      fieldResponses: disputeForm.fieldResponses,
      disputeType,
    });
    if (result.error) return setDisputeError(result.error);
    setDisputeSuccess("Dispute filed. Jury selected.");
    setDisputingId(null); setDisputeForm({ reasoning: "", evidence: [{ url: "", explanation: "" }], fieldResponses: {} });
    load();
  };

  if (loading) return <Loader />;
  if (loadError) return <div className="ta-error" style={{ margin: 20 }}>{loadError} <button className="ta-link-btn" onClick={load}>Retry</button></div>;
  // Deduplicate submissions by URL — group cross-posted submissions, show highest-scored with assembly badges
  const sorted = Object.values(subs || {}).sort((a, b) => hotScore(b) - hotScore(a));
  const seenUrls = new Map();
  const all = [];
  for (const sub of sorted) {
    const key = sub.url ? sub.url.replace(/\/$/, "").toLowerCase() : sub.id;
    if (seenUrls.has(key)) {
      const existing = seenUrls.get(key);
      if (!existing._otherAssemblies) existing._otherAssemblies = [];
      if (sub.orgName && !existing._otherAssemblies.includes(sub.orgName) && sub.orgName !== existing.orgName) {
        existing._otherAssemblies.push(sub.orgName);
      }
    } else {
      seenUrls.set(key, sub);
      all.push(sub);
    }
  }
  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Assembly Record</h2>
      {isAdmin && (
        <div style={{ marginBottom: 12, padding: 10, background: "#FFF7ED", border: "1px solid #EA580C", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#EA580C", fontWeight: 700 }}>ADMIN</span>
          <button className="ta-btn-primary" style={{ background: "#EA580C", fontSize: 11, padding: "6px 14px" }} onClick={approveAllPending}>Approve All Pending Submissions</button>
          {approveMsg && <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>{approveMsg}</span>}
        </div>
      )}
      {/* Saved drafts CTA */}
      {user && savedDrafts.length > 0 && (
        <div style={{ padding: 14, background: "#FFFBEB", border: "1.5px solid #CA8A04", borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#CA8A04", fontWeight: 700, marginBottom: 8 }}>
            {savedDrafts.length} Draft{savedDrafts.length > 1 ? "s" : ""} in Progress
          </div>
          {savedDrafts.slice(0, 5).map(d => {
            let domain = "";
            try { domain = new URL(d.url).hostname.replace(/^www\./, ""); } catch {}
            const ago = sDate(d.updatedAt);
            return (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", marginBottom: 4, background: "#fff", borderRadius: 6, border: "1px solid #E2E8F0" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.title || "(no headline)"}
                  </div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>{domain} · {ago}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                  <button className="ta-btn-primary" style={{ fontSize: 10, padding: "4px 10px" }} onClick={() => onNavigate && onNavigate("submit", d.id)}>Continue</button>
                  <button className="ta-link-btn" style={{ fontSize: 10, color: "#DC2626" }} onClick={async () => {
                    try { await fetch(`/api/drafts/${d.id}`, { method: "DELETE" }); setSavedDrafts(prev => prev.filter(x => x.id !== d.id)); } catch {}
                  }}>Discard</button>
                </div>
              </div>
            );
          })}
          {savedDrafts.length > 5 && <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>+ {savedDrafts.length - 5} more</div>}
        </div>
      )}

      {user && !Object.values(subs || {}).some(s => s.submittedBy === user.username) && (
        <div style={{ padding: 16, background: "#fff", border: "1.5px solid #CA8A04", borderRadius: 8, marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 18, marginBottom: 6 }}>⚖</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 17, fontWeight: 600, color: "var(--navy)", marginBottom: 6 }}>Read a headline. Think it's wrong?</div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 12, lineHeight: 1.6 }}>Submit a correction and a random jury of your fellow citizens will weigh the evidence.</div>
          <button className="ta-btn-primary" onClick={() => onNavigate && onNavigate("submit")}>Submit Your First Correction</button>
        </div>
      )}
      {disputeSuccess && <div className="ta-success">{disputeSuccess}</div>}
      {all.length === 0 ? <Empty text="No corrections yet." /> : all.map(sub => {
        const isExpanded = expandedId === sub.id;
        return (
        <div key={sub.id} className="ta-card" style={{ borderLeft: `4px solid ${sub.status === "consensus" ? "#7C3AED" : sub.status === "approved" ? "#059669" : sub.status === "rejected" || sub.status === "disputed" ? "#DC2626" : "#D97706"}` }}>
          {!isExpanded && <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}>{sub.resolvedAt ? <UsernameLink username={sub.submittedBy} onClick={onViewCitizen} /> : <span>{anonName(sub.submittedBy, sub.anonMap, false)}</span>} · {sub.orgName}{sub._otherAssemblies && sub._otherAssemblies.length > 0 && <>{sub._otherAssemblies.map((a, i) => <span key={i} style={{ background: "#EFF6FF", color: "#2563EB", padding: "1px 5px", borderRadius: 6, fontSize: 9, marginLeft: 4 }}>{a}</span>)}</>} · {sDate(sub.createdAt)}{sub.trustedSkip ? " · 🛡 Trusted" : ""}{sub.isDI ? " · 🤖 DI" : ""}</span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {sub.isDI && <span style={{ fontSize: 8, padding: "1px 5px", background: "#EEF2FF", color: "#4F46E5", borderRadius: 8, fontFamily: "var(--mono)", fontWeight: 700 }}>🤖 DIGITAL INTELLIGENCE</span>}
              {sub.trustedSkip && <span style={{ fontSize: 8, padding: "1px 5px", background: "#ECFDF5", color: "#059669", borderRadius: 8, fontFamily: "var(--mono)", fontWeight: 700 }}>TRUSTED — DISPUTABLE</span>}
              <StatusPill status={sub.status} />
            </div>
          </div>
          <a href={sub.url} target="_blank" rel="noopener" style={{ fontSize: 10, color: "#0D9488", wordBreak: "break-all" }}>{sub.url}</a>
          <div style={{ margin: "8px 0", padding: 10, background: "#F9FAFB", borderRadius: 8, cursor: "pointer" }} onClick={() => setExpandedId(sub.id)}>
            <SubHeadline sub={sub} size={13} />
          </div>
            <div>
              <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.8, marginBottom: 10 }}>{sub.reasoning}</div>
              {sub.inlineEdits && sub.inlineEdits.length > 0 && <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>+ {sub.inlineEdits.length} in-line edit{sub.inlineEdits.length > 1 ? "s" : ""}{sub.inlineEdits.some(e => e.approved !== undefined) && <span> ({sub.inlineEdits.filter(e => e.approved).length} approved, {sub.inlineEdits.filter(e => e.approved === false).length} rejected)</span>}</div>}
              {sub.evidence && sub.evidence.length > 0 && <div style={{ fontSize: 10, color: "#0D9488", marginBottom: 4 }}>📎 {sub.evidence.length} evidence source{sub.evidence.length > 1 ? "s" : ""}</div>}
              {sub.deliberateLieFinding && <div style={{ fontSize: 10, color: "#991B1B", fontFamily: "var(--mono)", fontWeight: 700, marginTop: 4 }}>⚠ DELIBERATE DECEPTION FINDING</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button className="ta-btn-ghost" style={{ fontSize: 10, color: "#2563EB" }} onClick={() => setExpandedId(sub.id)}>Expand</button>
                {onViewRecord && <button className="ta-btn-ghost" style={{ fontSize: 10, color: "#0D9488" }} onClick={() => onViewRecord(sub.id)}>Open Full Record</button>}
                <button className="ta-btn-ghost" style={{ fontSize: 10, color: "#64748B" }} onClick={() => { const url = window.location.origin + window.location.pathname + "#record/" + sub.id; navigator.clipboard?.writeText(url); }}>Copy Link</button>
              </div>
            </div>
          </>}

          {isExpanded && (
            <div>
              <RecordDetailView sub={sub} onViewCitizen={onViewCitizen} />

              {/* Tag to story */}
              {["approved", "consensus", "cross_review"].includes(sub.status) && taggingId !== sub.id && (
                <button className="ta-btn-ghost" style={{ color: "#7C3AED", marginTop: 6, fontSize: 12, marginRight: 8 }} onClick={() => { setTaggingId(sub.id); setTagMsg(""); }}>
                  📖 Tag to Story
                </button>
              )}
              {taggingId === sub.id && (() => {
                const availableStories = Object.values(stories).filter(s => ["approved", "consensus", "cross_review"].includes(s.status));
                return (
                  <div style={{ marginTop: 8, padding: 10, background: "#F5F3FF", border: "1px solid #C4B5FD", borderRadius: 8 }}>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#7C3AED", fontWeight: 700, marginBottom: 6 }}>TAG TO STORY</div>
                    {tagMsg && <div className={tagMsg.includes("Error") ? "ta-error" : "ta-success"} style={{ marginBottom: 6, fontSize: 12 }}>{tagMsg}</div>}
                    {availableStories.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#64748B" }}>No approved stories available. <button className="ta-link-btn" style={{ fontSize: 12 }} onClick={() => onNavigate && onNavigate("stories")}>Create one</button></div>
                    ) : availableStories.map(s => (
                      <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px", marginBottom: 3, borderRadius: 4, background: "#fff" }}>
                        <span style={{ fontSize: 12, color: "#1E293B", flex: 1 }}>{s.title} <span style={{ fontSize: 10, color: "#94A3B8" }}>({s.orgName})</span></span>
                        <button className="ta-link-btn" style={{ fontSize: 10, color: "#7C3AED" }} onClick={async () => {
                          const res = await fetch(`/api/stories/${s.id}/tag`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId: sub.id }) });
                          const data = await res.json();
                          if (res.ok) { setTagMsg(data.status === "approved" ? "Tagged (auto-approved)." : "Tag submitted for approval."); } else { setTagMsg("Error: " + (data.error || "Failed")); }
                        }}>Tag</button>
                      </div>
                    ))}
                    <button className="ta-link-btn" style={{ fontSize: 11, marginTop: 6, color: "#94A3B8" }} onClick={() => { setTaggingId(null); setTagMsg(""); }}>Cancel</button>
                  </div>
                );
              })()}

              {canDispute(sub) && disputingId !== sub.id && (
                <button className="ta-btn-ghost" style={{ color: "#EA580C", marginTop: 6, fontSize: 12 }} onClick={() => { setDisputingId(sub.id); setDisputeError(""); setDisputeForm({ reasoning: "", evidence: [{ url: "", explanation: "" }], fieldResponses: {} }); }}>
                  {isRejectionDispute(sub) ? "⚖ Dispute This Rejection" : "⚖ Dispute This Submission"}
                </button>
              )}

              {disputingId === sub.id && (
                <div style={{ marginTop: 10, padding: 14, background: "#FFF7ED", border: "1.5px solid #EA580C", borderRadius: 8 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#EA580C", fontWeight: 700, marginBottom: 8 }}>
                    {isRejectionDispute(sub) ? "⚖ Dispute Rejection" : "⚖ File Intra-Assembly Dispute"}
                  </div>

                  {isRejectionDispute(sub) ? (
                    <>
                      <p style={{ fontSize: 12, color: "#1E293B", marginBottom: 10, lineHeight: 1.6 }}>
                        This submission was rejected by the jury. You can dispute the rejection by providing additional evidence and reasoning. The original submission cannot be changed. A new jury will review the dispute.
                      </p>
                      {/* Show juror rejection notes */}
                      {(() => {
                        const rejectionNotes = Object.entries(sub.votes || {}).filter(([, v]) => !v.approve && v.note).map(([voter, v]) => ({ voter, note: v.note, time: v.time }));
                        return rejectionNotes.length > 0 && (
                          <div style={{ marginBottom: 12, padding: 10, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8 }}>
                            <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#DC2626", marginBottom: 6, fontWeight: 700 }}>JUROR REJECTION NOTES</div>
                            {rejectionNotes.map((jn, i) => (
                              <div key={i} style={{ fontSize: 12, color: "#1E293B", padding: "6px 0", borderTop: i > 0 ? "1px solid #FECACA" : "none", lineHeight: 1.6 }}>
                                {jn.note}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: 12, color: "#1E293B", marginBottom: 10, lineHeight: 1.6 }}>
                        You are disputing this approved submission. Explain why each part of the submission is wrong. A jury of uninvolved Assembly members will review. If upheld, you gain significant reputation. If dismissed, you take a small reputation hit.
                      </p>
                      {/* Per-field dispute responses for approved submissions */}
                      <div style={{ marginBottom: 12, padding: 10, background: "#F9FAFB", border: "1px solid #E2E8F0", borderRadius: 8 }}>
                        <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#475569", marginBottom: 8, fontWeight: 700 }}>ORIGINAL SUBMISSION — RESPOND TO EACH FIELD</div>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B", marginBottom: 2 }}>ORIGINAL HEADLINE</div>
                          <div style={{ fontSize: 12, color: "#1E293B", padding: "4px 8px", background: "#fff", borderRadius: 4, border: "1px solid #E2E8F0" }}>{sub.originalHeadline}</div>
                          <textarea value={(disputeForm.fieldResponses || {}).headline || ""} onChange={e => setDisputeForm({ ...disputeForm, fieldResponses: { ...disputeForm.fieldResponses, headline: e.target.value } })} rows={2} placeholder="Why is this characterization of the headline wrong? (optional)" style={{ width: "100%", marginTop: 4, padding: 6, border: "1px solid #EA580C40", fontSize: 12, borderRadius: 6, boxSizing: "border-box", fontFamily: "var(--body)" }} />
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B", marginBottom: 2 }}>PROPOSED REPLACEMENT</div>
                          <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600, padding: "4px 8px", background: "#fff", borderRadius: 4, border: "1px solid #E2E8F0" }}>{sub.replacement}</div>
                          <textarea value={(disputeForm.fieldResponses || {}).replacement || ""} onChange={e => setDisputeForm({ ...disputeForm, fieldResponses: { ...disputeForm.fieldResponses, replacement: e.target.value } })} rows={2} placeholder="Why is this replacement inaccurate? (optional)" style={{ width: "100%", marginTop: 4, padding: 6, border: "1px solid #EA580C40", fontSize: 12, borderRadius: 6, boxSizing: "border-box", fontFamily: "var(--body)" }} />
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B", marginBottom: 2 }}>REASONING</div>
                          <div style={{ fontSize: 12, color: "#475569", padding: "4px 8px", background: "#fff", borderRadius: 4, border: "1px solid #E2E8F0", lineHeight: 1.6 }}>{sub.reasoning}</div>
                          <textarea value={(disputeForm.fieldResponses || {}).reasoning || ""} onChange={e => setDisputeForm({ ...disputeForm, fieldResponses: { ...disputeForm.fieldResponses, reasoning: e.target.value } })} rows={2} placeholder="Why is this reasoning flawed? (optional)" style={{ width: "100%", marginTop: 4, padding: 6, border: "1px solid #EA580C40", fontSize: 12, borderRadius: 6, boxSizing: "border-box", fontFamily: "var(--body)" }} />
                        </div>
                      </div>
                    </>
                  )}
                  {disputeError && <div className="ta-error">{disputeError}</div>}
                  <div className="ta-field"><label>{isRejectionDispute(sub) ? "Why was the rejection wrong? *" : "Overall dispute reasoning *"}</label><textarea value={disputeForm.reasoning} onChange={e => setDisputeForm({ ...disputeForm, reasoning: e.target.value })} rows={3} placeholder={isRejectionDispute(sub) ? "Explain why the jury's rejection was incorrect, and provide any additional context..." : "Explain specifically what is incorrect, misleading, or deceptive..."} /></div>
                  <EvidenceFields evidence={disputeForm.evidence} onChange={ev => setDisputeForm({ ...disputeForm, evidence: ev })} />
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="ta-btn-primary" style={{ background: "#EA580C" }} onClick={() => submitDispute(sub.id)}>File Dispute</button>
                    <button className="ta-btn-ghost" onClick={() => setDisputingId(null)}>Cancel</button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="ta-btn-ghost" style={{ fontSize: 10, color: "#64748B" }} onClick={() => setExpandedId(null)}>Collapse</button>
                {onViewRecord && <button className="ta-btn-ghost" style={{ fontSize: 10, color: "#0D9488" }} onClick={() => onViewRecord(sub.id)}>Open Full Record</button>}
                <button className="ta-btn-ghost" style={{ fontSize: 10, color: "#64748B" }} onClick={() => { const url = window.location.origin + window.location.pathname + "#record/" + sub.id; navigator.clipboard?.writeText(url); }}>Copy Link</button>
              </div>
            </div>
          )}
        </div>
      );})}
      <LegalDisclaimer short />
    </div>
  );
}

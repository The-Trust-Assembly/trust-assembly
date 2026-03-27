import React, { useState, useEffect, Component } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SK, ADMIN_USERNAME } from "../lib/constants";
import { sG } from "../lib/storage";
import { anonName, sDate, hotScore } from "../lib/utils";
import { fileDispute } from "../lib/jury";
import { Loader, Empty, UsernameLink, EvidenceFields, LegalDisclaimer, StatusPill } from "../components/ui";
import RecordDetailView from "../components/RecordDetailView";
import { queryKeys } from "../lib/queryKeys";

// Safety: ensure a value is safe to render as a React child
function safe(v) { return (v !== null && typeof v === "object") ? JSON.stringify(v) : v; }

class FeedErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("FeedScreen error:", error, info); }
  render() {
    if (this.state.hasError) return <div style={{ padding: 20, color: "var(--red)" }}>Feed error: {String(this.state.error?.message || this.state.error)}. Try refreshing.</div>;
    return this.props.children;
  }
}

function HeroSlide({ slide, style, onClickSlide, onClickAssembly }) {
  const isAffirm = slide.submissionType === "affirmation";
  let domain = "";
  try { domain = new URL(String(slide.url)).hostname.replace(/^www\./, ""); } catch {}
  return (
    <div style={style}>
      <div style={{ cursor: "pointer" }} onClick={() => onClickSlide && onClickSlide(slide.id)}>
        <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "#777", letterSpacing: "0.5px", marginBottom: 8 }}>{domain || "article"}</div>
        {isAffirm ? (
          <div style={{ fontFamily: "Georgia, var(--serif)", fontSize: 16, lineHeight: 1.5, color: "#1a1a1a" }}>
            <span style={{ color: "#059669", fontWeight: 700 }}>Affirmed: </span>{safe(slide.originalHeadline)}
          </div>
        ) : (
          <>
            <div style={{ fontFamily: "Georgia, var(--serif)", fontSize: 14, lineHeight: 1.4, color: "#555", textDecoration: "line-through", marginBottom: 6 }}>{safe(slide.originalHeadline)}</div>
            <div style={{ fontFamily: "Georgia, var(--serif)", fontSize: 16, lineHeight: 1.5, color: "#c44a3a", fontWeight: 600 }}>{safe(slide.replacement)}</div>
          </>
        )}
      </div>
      {slide.bodyText && (
        <div style={{ fontSize: 11, lineHeight: 1.6, color: "#1a1a1a", marginTop: 8, fontFamily: "Georgia, serif" }}>
          {slide.bodyText.slice(0, 200).trim()}{slide.bodyText.length > 200 ? "\u2026" : ""}
        </div>
      )}
      <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "#777", marginTop: 10 }}>
        Corrected by <span style={{ color: "var(--gold)", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onClickAssembly && onClickAssembly(slide.orgId); }}>{safe(slide.orgName)}</span> {"\u00B7"} {sDate(slide.resolvedAt || slide.createdAt)}
      </div>
    </div>
  );
}

function FeedHeroCarousel({ subs, onViewRecord, onViewAssembly }) {
  const [slideIdx, setSlideIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const [paused, setPaused] = useState(false);

  const approved = Object.values(subs || {})
    .filter(s => ["approved", "consensus", "cross_review"].includes(s.status))
    .sort((a, b) => new Date(b.resolvedAt || b.createdAt).getTime() - new Date(a.resolvedAt || a.createdAt).getTime())
    .slice(0, 5);

  useEffect(() => {
    if (paused || approved.length <= 1) return;
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setSlideIdx(i => (i + 1) % approved.length);
        setFading(false);
      }, 280);
    }, 8000);
    return () => clearInterval(t);
  }, [paused, approved.length]);

  if (approved.length === 0) {
    return (
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", padding: "20px 16px", marginBottom: 10, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontFamily: "var(--serif)", letterSpacing: 1, color: "var(--gold)", fontWeight: 700, marginBottom: 8 }}>How You're Changing the Narrative</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>No corrections approved yet — submit one and let the jury decide.</div>
      </div>
    );
  }

  const activeIdx = slideIdx % approved.length;

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", padding: "16px 16px 12px", marginBottom: 10 }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div style={{ fontSize: 15, fontFamily: "var(--serif)", letterSpacing: 1, color: "var(--gold)", fontWeight: 700, marginBottom: 12 }}>How You're Changing the Narrative</div>
      {/* Portal window — inset shadow creates depth, white bg mimics a real webpage */}
      <div style={{ background: "#fafafa", border: "1px solid rgba(0,0,0,0.1)", boxShadow: "inset 0 2px 12px rgba(0,0,0,0.12)", padding: "14px 16px" }}>
        {/* CSS grid: all slides in same cell, tallest sets height */}
        <div style={{ display: "grid" }}>
          {approved.map((s, i) => (
            <HeroSlide key={s.id} slide={s} onClickSlide={onViewRecord} onClickAssembly={onViewAssembly} style={{
              gridArea: "1 / 1",
              opacity: i === activeIdx && !fading ? 1 : 0,
              transition: "opacity 0.25s ease",
              pointerEvents: i === activeIdx ? "auto" : "none",
            }} />
          ))}
        </div>
      </div>
      {approved.length > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
          {approved.map((_, i) => (
            <span key={i} onClick={() => { setSlideIdx(i); setFading(false); }} style={{ width: 8, height: 8, borderRadius: "50%", background: i === activeIdx ? "var(--gold)" : "var(--border)", cursor: "pointer", transition: "background 0.2s" }} />
          ))}
        </div>
      )}
    </div>
  );
}

const FILTER_CHIPS = [
  { key: "all", label: "All" },
  { key: "corrections", label: "Corrections" },
  { key: "affirmations", label: "Affirmations" },
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Rejected" },
  { key: "di", label: "DI Reviewed" },
];

// statusBadge removed — using StatusPill component (stamp images) instead

function DarkSubHeadline({ sub }) {
  const isAffirm = sub.submissionType === "affirmation";
  const oh = sub.originalHeadline && typeof sub.originalHeadline === "object" ? JSON.stringify(sub.originalHeadline) : sub.originalHeadline;
  const rp = sub.replacement && typeof sub.replacement === "object" ? JSON.stringify(sub.replacement) : sub.replacement;
  const au = sub.author && typeof sub.author === "object" ? JSON.stringify(sub.author) : sub.author;
  return (
    <div>
      {isAffirm ? (
        <div className="headline-affirmed"><span className="prefix">Affirmed: </span>{oh}</div>
      ) : (
        <>
          <div className="headline-struck">{oh}</div>
          {rp && <div className="headline-corrected">{rp}</div>}
        </>
      )}
      {au && <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--mono)", marginTop: 2 }}>Author: {au}</div>}
    </div>
  );
}

function matchesFilter(sub, filter) {
  if (filter === "all") return true;
  if (filter === "corrections") return sub.submissionType !== "affirmation";
  if (filter === "affirmations") return sub.submissionType === "affirmation";
  if (filter === "approved") return ["approved", "consensus", "cross_review"].includes(sub.status);
  if (filter === "pending") return ["pending_jury", "pending_review", "di_pending"].includes(sub.status) || sub.status === "pending";
  if (filter === "rejected") return ["rejected", "consensus_rejected"].includes(sub.status);
  if (filter === "di") return !!sub.isDI;
  return true;
}

export default function FeedScreen(props) {
  return <FeedErrorBoundary><FeedScreenInner {...props} /></FeedErrorBoundary>;
}

function FeedScreenInner({ user, siteAnnouncement, onNavigate, onViewCitizen, onViewRecord, onViewAssembly }) {
  const qc = useQueryClient();
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
  const [activeFilter, setActiveFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
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
    if (["approved", "consensus"].includes(sub.status)) return sub.submittedBy !== user.username;
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
    qc.invalidateQueries({ queryKey: queryKeys.submissions }); qc.invalidateQueries({ queryKey: queryKeys.users });
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
  if (loadError) return <div style={{ margin: 20, color: "var(--red)" }}>{loadError} <button className="card-btn" onClick={load}>Retry</button></div>;

  // Deduplicate submissions by URL
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

  const filtered = all.filter(sub => matchesFilter(sub, activeFilter));
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paged = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Compute stats for info cards
  const myOrgIds = user ? (user.orgIds || (user.orgId ? [user.orgId] : [])) : [];
  const reviewQueueCount = Object.values(subs || {}).filter(s => ["pending_review", "pending_jury"].includes(s.status) && myOrgIds.includes(s.orgId) && s.submittedBy !== (user?.username || "")).length;
  let totalCitizens = 0;
  try {
    const members = new Set();
    Object.values(orgs || {}).forEach(o => (o.members || []).forEach(m => members.add(m)));
    totalCitizens = members.size;
  } catch (e) { console.error("FEED CRASH in totalCitizens:", e); }

  let myApprovedInGP = 0;
  try {
    if (user) {
      const gp = Object.values(orgs || {}).find(o => o.isGeneralPublic);
      if (gp) {
        myApprovedInGP = Object.values(subs || {}).filter(s => s.orgId === gp.id && s.submittedBy === user.username && ["approved", "consensus", "cross_review"].includes(s.status)).length;
      }
    }
  } catch (e) { console.error("FEED CRASH in myApprovedInGP:", e); }
  const gpOrg = Object.values(orgs || {}).find(o => o.isGeneralPublic);
  const trustedRequired = 10;
  const trustedRemaining = Math.max(0, trustedRequired - myApprovedInGP);

  return (
    <div className="ta-content">
      <FeedHeroCarousel subs={subs} onViewRecord={onViewRecord} onViewAssembly={onViewAssembly} />

      {/* Admin update box — driven by /api/admin/announcement */}
      {siteAnnouncement && typeof siteAnnouncement === "string" && (
        <div style={{ background: "rgba(212,168,67,0.07)", borderLeft: "3px solid var(--gold)", padding: "10px 14px", marginBottom: 8 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)", fontWeight: 700, marginBottom: 3 }}>Admin update</div>
          <div style={{ fontSize: 10, color: "var(--text-sec)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{siteAnnouncement}</div>
        </div>
      )}
      {isAdmin && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <button className="card-btn" style={{ background: "var(--gold)", color: "var(--bg)", fontWeight: 700, borderColor: "var(--gold)" }} onClick={approveAllPending}>Approve All Pending</button>
          {approveMsg && <span style={{ color: "var(--green)", fontWeight: 600, fontSize: 10 }}>{approveMsg}</span>}
        </div>
      )}

      {/* Your Next Steps + Assembly Status */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <div style={{ flex: 1, background: "var(--card-bg)", border: "1px solid var(--border)", padding: 10 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)", fontWeight: 700, marginBottom: 4 }}>Your next steps</div>
          <div style={{ fontSize: 10, color: "var(--text-sec)", lineHeight: 1.5 }}>
            You have <span style={{ color: "var(--text)", fontWeight: 600 }}>{reviewQueueCount} items</span> in your review queue.
            {trustedRemaining > 0 && gpOrg && <> Next milestone: <span style={{ color: "var(--gold)", fontWeight: 600 }}>{trustedRemaining} more approvals</span> for Trusted Contributor in {gpOrg.name}.</>}
          </div>
        </div>
        <div style={{ flex: 1, background: "var(--card-bg)", border: "1px solid var(--border)", padding: 10 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)", fontWeight: 700, marginBottom: 4 }}>Assembly status</div>
          <div style={{ fontSize: 10, color: "var(--text-sec)", lineHeight: 1.5 }}>
            Member of <span style={{ color: "var(--text)", fontWeight: 600 }}>{myOrgIds.length} assemblies</span>. {totalCitizens} citizens registered — <span style={{ color: "var(--gold)", fontWeight: 600 }}>{Math.max(0, 100 - totalCitizens)} more</span> until advanced jury rules activate.
          </div>
        </div>
      </div>

      {/* Wild West Rules */}
      {totalCitizens < 100 && (
        <div style={{ background: "rgba(212,168,67,0.08)", border: "1px solid rgba(212,168,67,0.2)", padding: "8px 12px", marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--gold)", letterSpacing: 1, marginBottom: 3 }}>WILD WEST RULES — {totalCitizens}/100 CITIZENS</div>
          <div style={{ fontSize: 9, color: "var(--text-sec)", lineHeight: 1.5 }}>1. Any assembly with 2+ members can have jurors · 2. Submissions require one reviewer · 3. Deception findings disabled</div>
        </div>
      )}

      {/* Saved drafts */}
      {user && savedDrafts.length > 0 && (
        <div style={{ background: "rgba(212,168,67,0.08)", border: "1px solid rgba(212,168,67,0.2)", padding: "8px 12px", marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--gold)", letterSpacing: 1, marginBottom: 3 }}>{savedDrafts.length} DRAFT{savedDrafts.length > 1 ? "S" : ""} IN PROGRESS</div>
          {savedDrafts.slice(0, 5).map(d => {
            let domain = "";
            try { domain = new URL(d.url).hostname.replace(/^www\./, ""); } catch {}
            const ago = sDate(d.updatedAt);
            return (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {safe(d.title) || "(no headline)"}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{domain} · {ago}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                  <button className="card-btn" style={{ background: "var(--gold)", color: "var(--bg)", fontWeight: 700, borderColor: "var(--gold)" }} onClick={() => onNavigate && onNavigate("submit", d.id)}>Continue</button>
                  <button className="card-btn" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={async () => {
                    try { await fetch(`/api/drafts/${d.id}`, { method: "DELETE" }); setSavedDrafts(prev => prev.filter(x => x.id !== d.id)); qc.invalidateQueries({ queryKey: queryKeys.drafts }); } catch {}
                  }}>Discard</button>
                </div>
              </div>
            );
          })}
          {savedDrafts.length > 5 && <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>+ {savedDrafts.length - 5} more</div>}
        </div>
      )}

      {/* First submission CTA */}
      {user && !Object.values(subs || {}).some(s => s.submittedBy === user.username) && (
        <div className="wild-box" style={{ textAlign: "center", padding: "14px 12px", marginBottom: 10 }}>
          <div style={{ fontSize: 16, marginBottom: 4, color: "var(--gold)" }}>&#9878;</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4, fontFamily: "var(--serif)" }}>Read a headline. Think it's wrong?</div>
          <div style={{ fontSize: 11, color: "var(--text-sec)", marginBottom: 10, lineHeight: 1.6 }}>Submit a correction and a random jury of your fellow citizens will weigh the evidence.</div>
          <button className="card-btn" style={{ background: "var(--gold)", color: "var(--bg)", fontWeight: 700, borderColor: "var(--gold)", padding: "5px 14px", fontSize: 10 }} onClick={() => onNavigate && onNavigate("submit")}>Submit Your First Correction</button>
        </div>
      )}

      {disputeSuccess && <div style={{ fontSize: 10, color: "var(--green)", fontFamily: "var(--mono)", marginBottom: 8 }}>{disputeSuccess}</div>}

      {/* Filter row */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: "var(--gold)", textTransform: "uppercase", fontWeight: 600 }}>Assembly record</div>
        <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Multi-select to filter</span>
      </div>
      <div className="filters" style={{ marginBottom: 10 }}>
        {FILTER_CHIPS.map(f => (
          <span
            key={f.key}
            className={`filt${activeFilter === f.key ? " active" : ""}`}
            onClick={() => { setActiveFilter(f.key); setCurrentPage(1); }}
          >{f.label}</span>
        ))}
      </div>

      {/* Feed cards */}
      {paged.length === 0 ? <Empty text="No corrections yet." /> : paged.map(sub => {
        const isExpanded = expandedId === sub.id;
        const isAffirm = sub.submissionType === "affirmation";
        const showUser = sub.resolvedAt;
        let domain = "";
        try { domain = new URL(String(sub.url)).hostname.replace(/^www\./, ""); } catch { domain = safe(sub.url) || ""; }

        return (
        <div key={sub.id} className="card">
          {/* Card top: meta + status — ALWAYS visible */}
          <div className="card-top">
            <div className="card-meta">
              {showUser ? (
                <UsernameLink username={sub.submittedBy} onClick={onViewCitizen} />
              ) : (
                <span className="hidden-user">Citizen (pending review)</span>
              )}
              <span className="muted">· <span style={{ cursor: "pointer", color: "var(--gold)" }} onClick={(e) => { e.stopPropagation(); onViewAssembly && onViewAssembly(sub.orgId); }}>{safe(sub.orgName)}</span>{sub._otherAssemblies && sub._otherAssemblies.length > 0 && sub._otherAssemblies.map((a, i) => <span key={i} style={{ fontSize: 8, padding: "1px 5px", background: "rgba(212,168,67,0.13)", border: "1px solid rgba(212,168,67,0.27)", color: "var(--gold)", fontWeight: 700, letterSpacing: ".5px", marginLeft: 4, cursor: "pointer" }}>{safe(a)}</span>)} · {sDate(sub.createdAt)}</span>
              {sub.trustedSkip && <span style={{ fontSize: 8, padding: "1px 5px", background: "rgba(74,158,85,0.09)", border: "1px solid rgba(74,158,85,0.27)", color: "var(--green)", fontWeight: 700 }}>TRUSTED</span>}
              {sub.isDI && <span className="di-badge">DI PRE-REVIEW</span>}
            </div>
            <StatusPill status={sub.status} />
          </div>

          {!isExpanded && <>
          {/* URL */}
          <a href={sub.url && /^https?:\/\//.test(String(sub.url)) ? sub.url : "#"} target="_blank" rel="noopener noreferrer" className="card-url" style={{ color: "var(--gold)", textDecoration: "none" }}>{domain}</a>

          {/* Headlines */}
          <div style={{ cursor: "pointer" }} onClick={() => setExpandedId(sub.id)}>
            <DarkSubHeadline sub={sub} />
          </div>

          {/* Reasoning */}
          <div className="card-reason">{safe(sub.reasoning)}</div>

          {/* Edits & evidence */}
          {sub.inlineEdits && sub.inlineEdits.length > 0 && (
            <div className="card-edits">+ {sub.inlineEdits.length} in-line edit{sub.inlineEdits.length > 1 ? "s" : ""}{sub.inlineEdits.some(e => e.approved !== undefined) && <span> ({sub.inlineEdits.filter(e => e.approved).length} approved, {sub.inlineEdits.filter(e => e.approved === false).length} rejected)</span>}</div>
          )}
          {sub.evidence && sub.evidence.length > 0 && (
            <div className="card-evidence">{sub.evidence.length} evidence source{sub.evidence.length > 1 ? "s" : ""}</div>
          )}
          {sub.deliberateLieFinding && <div style={{ fontSize: 9, color: "var(--red)", fontFamily: "var(--mono)", fontWeight: 700, marginBottom: 4 }}>DELIBERATE DECEPTION FINDING</div>}

          {/* Actions */}
          <div className="card-actions">
            <span className="card-btn" onClick={() => setExpandedId(sub.id)}>Expand</span>
            {onViewRecord && <span className="card-btn" onClick={() => onViewRecord(sub.id)}>Open Full Record</span>}
            <span className="card-btn" onClick={() => { const url = window.location.origin + "/record/" + sub.id; navigator.clipboard?.writeText(url); }}>Copy Link</span>
          </div>
          </>}

          {/* Expanded view */}
          {isExpanded && (
            <div>
              <RecordDetailView sub={sub} onViewCitizen={onViewCitizen} />

              {/* Tag to story */}
              {["approved", "consensus", "cross_review"].includes(sub.status) && taggingId !== sub.id && (
                <button className="card-btn" style={{ color: "var(--gold)", borderColor: "var(--gold)", marginTop: 6, marginRight: 8 }} onClick={() => { setTaggingId(sub.id); setTagMsg(""); }}>
                  Tag to Story
                </button>
              )}
              {taggingId === sub.id && (() => {
                const availableStories = Object.values(stories).filter(s => ["approved", "consensus", "cross_review"].includes(s.status));
                return (
                  <div style={{ marginTop: 8, padding: 10, background: "rgba(212,168,67,0.07)", borderLeft: "3px solid var(--gold)" }}>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 6 }}>TAG TO STORY</div>
                    {tagMsg && <div style={{ marginBottom: 6, fontSize: 10, color: tagMsg.includes("Error") ? "var(--red)" : "var(--green)" }}>{tagMsg}</div>}
                    {availableStories.length === 0 ? (
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>No approved stories available. <span style={{ color: "var(--gold)", cursor: "pointer" }} onClick={() => onNavigate && onNavigate("stories")}>Create one</span></div>
                    ) : availableStories.map(s => (
                      <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px", marginBottom: 3, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
                        <span style={{ fontSize: 10, color: "var(--text)", flex: 1 }}>{s.title} <span style={{ fontSize: 9, color: "var(--text-muted)" }}>({s.orgName})</span></span>
                        <button className="card-btn" style={{ color: "var(--gold)", borderColor: "var(--gold)" }} onClick={async () => {
                          const res = await fetch(`/api/stories/${s.id}/tag`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId: sub.id }) });
                          const data = await res.json();
                          if (res.ok) { setTagMsg(data.status === "approved" ? "Tagged (auto-approved)." : "Tag submitted for approval."); qc.invalidateQueries({ queryKey: queryKeys.stories }); } else { setTagMsg("Error: " + (data.error || "Failed")); }
                        }}>Tag</button>
                      </div>
                    ))}
                    <span className="card-btn" style={{ marginTop: 6, display: "inline-block" }} onClick={() => { setTaggingId(null); setTagMsg(""); }}>Cancel</span>
                  </div>
                );
              })()}

              {canDispute(sub) && disputingId !== sub.id && (
                <button className="card-btn" style={{ color: "var(--red)", borderColor: "var(--red)", marginTop: 6 }} onClick={() => { setDisputingId(sub.id); setDisputeError(""); setDisputeForm({ reasoning: "", evidence: [{ url: "", explanation: "" }], fieldResponses: {} }); }}>
                  {isRejectionDispute(sub) ? "Dispute This Rejection" : "Dispute This Submission"}
                </button>
              )}

              {disputingId === sub.id && (
                <div style={{ marginTop: 10, padding: 14, background: "rgba(196,74,58,0.07)", borderLeft: "3px solid var(--red)" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "2px", color: "var(--red)", fontWeight: 700, marginBottom: 8 }}>
                    {isRejectionDispute(sub) ? "DISPUTE REJECTION" : "FILE INTRA-ASSEMBLY DISPUTE"}
                  </div>

                  {isRejectionDispute(sub) ? (
                    <>
                      <p style={{ fontSize: 10, color: "var(--text-sec)", marginBottom: 10, lineHeight: 1.6 }}>
                        This submission was rejected by the jury. You can dispute the rejection by providing additional evidence and reasoning. The original submission cannot be changed. A new jury will review the dispute.
                      </p>
                      {(() => {
                        const rejectionNotes = Object.entries(sub.votes || {}).filter(([, v]) => !v.approve && v.note).map(([voter, v]) => ({ voter, note: v.note, time: v.time }));
                        return rejectionNotes.length > 0 && (
                          <div style={{ marginBottom: 12, padding: 10, background: "rgba(196,74,58,0.05)", borderLeft: "2px solid var(--red)" }}>
                            <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--red)", marginBottom: 6, fontWeight: 700, letterSpacing: "1px" }}>JUROR REJECTION NOTES</div>
                            {rejectionNotes.map((jn, i) => (
                              <div key={i} style={{ fontSize: 10, color: "var(--text-sec)", padding: "6px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none", lineHeight: 1.6 }}>
                                {jn.note}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: 10, color: "var(--text-sec)", marginBottom: 10, lineHeight: 1.6 }}>
                        You are disputing this approved submission. Explain why each part of the submission is wrong. A jury of uninvolved Assembly members will review. If upheld, you gain significant reputation. If dismissed, you take a small reputation hit.
                      </p>
                      <div style={{ marginBottom: 12, padding: 10, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-muted)", marginBottom: 8, fontWeight: 700, letterSpacing: "1px" }}>ORIGINAL SUBMISSION — RESPOND TO EACH FIELD</div>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-muted)", marginBottom: 2, letterSpacing: "1px" }}>ORIGINAL HEADLINE</div>
                          <div style={{ fontSize: 11, color: "var(--text)", padding: "4px 8px", background: "var(--bg)", border: "1px solid var(--border)" }}>{safe(sub.originalHeadline)}</div>
                          <textarea value={(disputeForm.fieldResponses || {}).headline || ""} onChange={e => setDisputeForm({ ...disputeForm, fieldResponses: { ...disputeForm.fieldResponses, headline: e.target.value } })} rows={2} placeholder="Why is this characterization of the headline wrong? (optional)" style={{ width: "100%", marginTop: 4, padding: 6, border: "1px solid var(--border)", fontSize: 11, boxSizing: "border-box", fontFamily: "var(--body)", background: "var(--bg)", color: "var(--text)" }} />
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-muted)", marginBottom: 2, letterSpacing: "1px" }}>PROPOSED REPLACEMENT</div>
                          <div style={{ fontSize: 11, color: "var(--red)", fontWeight: 600, padding: "4px 8px", background: "var(--bg)", border: "1px solid var(--border)" }}>{safe(sub.replacement)}</div>
                          <textarea value={(disputeForm.fieldResponses || {}).replacement || ""} onChange={e => setDisputeForm({ ...disputeForm, fieldResponses: { ...disputeForm.fieldResponses, replacement: e.target.value } })} rows={2} placeholder="Why is this replacement inaccurate? (optional)" style={{ width: "100%", marginTop: 4, padding: 6, border: "1px solid var(--border)", fontSize: 11, boxSizing: "border-box", fontFamily: "var(--body)", background: "var(--bg)", color: "var(--text)" }} />
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-muted)", marginBottom: 2, letterSpacing: "1px" }}>REASONING</div>
                          <div style={{ fontSize: 11, color: "var(--text-sec)", padding: "4px 8px", background: "var(--bg)", border: "1px solid var(--border)", lineHeight: 1.6 }}>{safe(sub.reasoning)}</div>
                          <textarea value={(disputeForm.fieldResponses || {}).reasoning || ""} onChange={e => setDisputeForm({ ...disputeForm, fieldResponses: { ...disputeForm.fieldResponses, reasoning: e.target.value } })} rows={2} placeholder="Why is this reasoning flawed? (optional)" style={{ width: "100%", marginTop: 4, padding: 6, border: "1px solid var(--border)", fontSize: 11, boxSizing: "border-box", fontFamily: "var(--body)", background: "var(--bg)", color: "var(--text)" }} />
                        </div>
                      </div>
                    </>
                  )}
                  {disputeError && <div style={{ fontSize: 10, color: "var(--red)", fontFamily: "var(--mono)", marginBottom: 6 }}>{disputeError}</div>}
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: "block", fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-muted)", letterSpacing: "1px", marginBottom: 4 }}>{isRejectionDispute(sub) ? "WHY WAS THE REJECTION WRONG? *" : "OVERALL DISPUTE REASONING *"}</label>
                    <textarea value={disputeForm.reasoning} onChange={e => setDisputeForm({ ...disputeForm, reasoning: e.target.value })} rows={3} placeholder={isRejectionDispute(sub) ? "Explain why the jury's rejection was incorrect, and provide any additional context..." : "Explain specifically what is incorrect, misleading, or deceptive..."} style={{ width: "100%", padding: 6, border: "1px solid var(--border)", fontSize: 11, boxSizing: "border-box", fontFamily: "var(--body)", background: "var(--bg)", color: "var(--text)" }} />
                  </div>
                  <EvidenceFields evidence={disputeForm.evidence} onChange={ev => setDisputeForm({ ...disputeForm, evidence: ev })} />
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="card-btn" style={{ background: "var(--red)", color: "var(--bg)", fontWeight: 700, borderColor: "var(--red)" }} onClick={() => submitDispute(sub.id)}>File Dispute</button>
                    <button className="card-btn" onClick={() => setDisputingId(null)}>Cancel</button>
                  </div>
                </div>
              )}

              <div className="card-actions" style={{ marginTop: 8 }}>
                <span className="card-btn" onClick={() => setExpandedId(null)}>Collapse</span>
                {onViewRecord && <span className="card-btn" onClick={() => onViewRecord(sub.id)}>Open Full Record</span>}
                <span className="card-btn" onClick={() => { const url = window.location.origin + "/record/" + sub.id; navigator.clipboard?.writeText(url); }}>Copy Link</span>
              </div>
            </div>
          )}
        </div>
      );})}
      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ padding: "10px 0", display: "flex", justifyContent: "center", gap: 3 }}>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setCurrentPage(p)} style={{ padding: "3px 8px", fontSize: 9, border: `1px solid ${p === currentPage ? "var(--gold)" : "var(--border)"}`, color: p === currentPage ? "#0d0d0a" : "var(--text-sec)", background: p === currentPage ? "var(--gold)" : "none", cursor: "pointer", fontWeight: p === currentPage ? 700 : 400 }}>{p}</button>
          ))}
          {currentPage < totalPages && <button onClick={() => setCurrentPage(p => p + 1)} style={{ padding: "3px 8px", fontSize: 9, border: "1px solid var(--border)", color: "var(--text-sec)", background: "none", cursor: "pointer" }}>Next</button>}
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ fontSize: 8, color: "var(--text-muted)", textAlign: "center", padding: "4px 0" }}>Digital Citizens are solely responsible for the content of their submissions.</div>
    </div>
  );
}

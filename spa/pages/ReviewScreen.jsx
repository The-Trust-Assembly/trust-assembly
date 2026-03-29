import { useState, useEffect, useCallback, useMemo, useRef, Component } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SK, MAX_SHARED_ASSEMBLIES, NEWS_RUBRIC, FUN_RUBRIC } from "../lib/constants";
import { sDate, anonName } from "../lib/utils";
import { sG, isWildWestMode } from "../lib/storage";
import { getMajority, W, computeJuryScore } from "../lib/scoring";
import { isDIUser, hasActiveDeceptionPenalty, deceptionPenaltyRemaining } from "../lib/permissions";
import { recuseJuror, getConcessionRecovery, fileDispute } from "../lib/jury";
import { clearDraft } from "../lib/hooks";
import { queryKeys } from "../lib/queryKeys";
import { SubHeadline, StatusPill, RatingInput, DeliberateLieCheckbox, LegalDisclaimer, AuditTrail, EvidenceFields, Empty, Loader, Icon } from "../components/ui";
import DIPanelContent from "../components/DIPanelContent";

const DRAFT_DEBOUNCE = 500;

// Guard: prevent React error #310 by ensuring only primitives are rendered.
// If a value is an object/array/Date, convert to string representation.
const safe = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    console.warn("[ReviewScreen] Object rendered as child:", v);
    return JSON.stringify(v);
  }
  return String(v);
};

// Guard: only allow http(s) URLs in href attributes to prevent javascript: injection
const safeHref = (url) => {
  try { const u = new URL(String(url)); return ["http:", "https:"].includes(u.protocol) ? url : "#"; }
  catch { return "#"; }
};

class ReviewErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    console.error("[ReviewScreen] Render error:", error);
    console.error("[ReviewScreen] Component stack:", info?.componentStack);
    // Log the specific error type for #310 debugging
    if (error?.message?.includes("object") || error?.message?.includes("310")) {
      console.error("[ReviewScreen] Likely object-as-child error. Check console warnings for 'Object rendered as child' from safe() helper.");
    }
  }
  render() {
    if (this.state.hasError) {
      return <div style={{ padding: 24, textAlign: "center" }}>
        <h3 style={{ color: "var(--red)", fontFamily: "var(--mono)" }}>Review page encountered an error</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>{this.state.error?.message || "Unknown error"}</p>
        <button onClick={() => this.setState({ hasError: false, error: null })} style={{ marginTop: 12, padding: "8px 16px", background: "var(--gold)", color: "#fff", border: "none", borderRadius: 0, cursor: "pointer", fontFamily: "var(--mono)", fontSize: 12 }}>Retry</button>
      </div>;
    }
    return this.props.children;
  }
}

export default function ReviewScreen({ user }) {
  if (!user) return <Empty text="Loading user..." />;
  return <ReviewErrorBoundary><ReviewScreenInner user={user} /></ReviewErrorBoundary>;
}

function ReviewScreenInner({ user }) {
  const qc = useQueryClient();
  const invalidateAll = () => { qc.invalidateQueries({ queryKey: queryKeys.submissions }); qc.invalidateQueries({ queryKey: queryKeys.users }); qc.invalidateQueries({ queryKey: queryKeys.disputes }); };
  const [subs, setSubs] = useState(null); const [disputes, setDisputes] = useState(null); const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState(null); const [voteNote, setVoteNote] = useState("");
  const [newsRating, setNewsRating] = useState(5); const [funRating, setFunRating] = useState(5);
  const [lieChecked, setLieChecked] = useState(false);
  const [editVotes, setEditVotes] = useState({}); // { editIndex: true/false }
  const [vaultVotes, setVaultVotes] = useState({}); // { entryId: true/false }
  const [tab, setTab] = useState("ingroup");
  const [juryScore, setJuryScore] = useState(null);
  const [diLinkReqs, setDiLinkReqs] = useState({});
  const [wildWest, setWildWest] = useState(false);
  const [storyProposals, setStoryProposals] = useState([]);

  // State for My Results tab actions — must be declared here (not after early return)
  // to satisfy React's rules of hooks (same number of hooks every render).
  const [concedingId, setConcedingId] = useState(null);
  const [showConcedeConfirm, setShowConcedeConfirm] = useState(null); // holds submission id
  const [concedeReason, setConcedeReason] = useState("");
  const [concedeError, setConcedeError] = useState("");
  const [orgsData, setOrgsData] = useState({});
  const [concedeSuccess, setConcedeSuccess] = useState("");
  const [disputingResultId, setDisputingResultId] = useState(null);
  const [resultDisputeForm, setResultDisputeForm] = useState({ reasoning: "", evidence: [{ url: "", explanation: "" }] });
  const [resultDisputeError, setResultDisputeError] = useState("");

  const load = useCallback(async () => {
    let ww = false;
    try { ww = await isWildWestMode(); } catch { ww = true; }
    setWildWest(ww);
    // ── Load all data from relational API (single source of truth) ──
    const allSubs = (await sG(SK.SUBS)) || {};
    const allDisputes = (await sG(SK.DISPUTES)) || {};
    const allOrgs = (await sG(SK.ORGS)) || {};
    setOrgsData(allOrgs);
    // Also merge review queue items (may include jury-specific data)
    try {
      const [queueRes, diRes] = await Promise.all([
        fetch("/api/reviews/queue"),
        fetch("/api/submissions/di-queue"),
      ]);
      if (queueRes.ok) {
        const queueData = await queueRes.json();
        // Trust server-side Wild West detection over client-side
        if (queueData.wildWest !== undefined) setWildWest(queueData.wildWest);
        if (queueData.submissions) {
          for (const relSub of queueData.submissions) { allSubs[relSub.id] = { ...allSubs[relSub.id], ...relSub }; }
        }
        if (queueData.disputes) {
          for (const relDisp of queueData.disputes) { allDisputes[relDisp.id] = { ...allDisputes[relDisp.id], ...relDisp }; }
        }
        if (queueData.myDisputes) {
          for (const relDisp of queueData.myDisputes) { allDisputes[relDisp.id] = { ...allDisputes[relDisp.id], ...relDisp }; }
        }
        if (queueData.storyProposals) {
          setStoryProposals(queueData.storyProposals);
        }
      } else {
        console.warn("[ReviewScreen] /api/reviews/queue returned", queueRes.status);
      }
      if (diRes.ok) {
        const diData = await diRes.json();
        if (diData.submissions) {
          for (const relSub of diData.submissions) { allSubs[relSub.id] = { ...allSubs[relSub.id], ...relSub }; }
        }
      } else {
        console.warn("[ReviewScreen] /api/submissions/di-queue returned", diRes.status);
      }
    } catch (e) { console.warn("Failed to fetch review queue:", e); }
    // Debug: log any submission fields that are objects (would cause React #310)
    for (const [id, sub] of Object.entries(allSubs)) {
      const textFields = ["reasoning", "orgName", "originalHeadline", "replacement", "author", "url", "submittedBy", "diPartner"];
      for (const f of textFields) {
        if (sub[f] && typeof sub[f] === "object") {
          console.error(`[ReviewScreen] #310 risk: sub ${id.slice(0,8)}… field "${f}" is object:`, sub[f]);
        }
      }
    }
    setSubs(allSubs); setDisputes(allDisputes);
    // Load DI link requests from relational API
    try {
      const diReqRes = await fetch("/api/di-requests");
      if (diReqRes.ok) {
        const diReqData = await diReqRes.json();
        const reqMap = {};
        for (const r of (diReqData.requests || diReqData.data || [])) {
          reqMap[r.di_username || r.id] = { ...r, diUsername: r.di_username, partnerUsername: r.partner_username || user.username, status: r.status };
        }
        setDiLinkReqs(reqMap);
      }
    } catch {}
    setLoading(false);
    // Compute jury score for display
    const js = await computeJuryScore(user.username);
    setJuryScore(js);
  }, [user.username]);
  useEffect(() => { load(); }, []);

  // Auto-save vote draft per submission
  const voteDraftKey = reviewingId ? `ta_draft_vote_${reviewingId}` : null;
  const voteDraftTimer = useRef(null);
  const voteState = useMemo(() => ({ voteNote, newsRating, funRating, lieChecked, editVotes, vaultVotes }), [voteNote, newsRating, funRating, lieChecked, editVotes, vaultVotes]);
  // Restore draft when opening a review
  const lastRestoredId = useRef(null);
  useEffect(() => {
    if (!reviewingId || lastRestoredId.current === reviewingId) return;
    lastRestoredId.current = reviewingId;
    try {
      const raw = localStorage.getItem(`ta_draft_vote_${reviewingId}`);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.voteNote) setVoteNote(d.voteNote);
        if (d.newsRating !== undefined) setNewsRating(d.newsRating);
        if (d.funRating !== undefined) setFunRating(d.funRating);
        if (d.lieChecked !== undefined) setLieChecked(d.lieChecked);
        if (d.editVotes) setEditVotes(d.editVotes);
        if (d.vaultVotes) setVaultVotes(d.vaultVotes);
      }
    } catch {}
  }, [reviewingId]);
  // Save draft on change (debounced)
  const voteInitSkip = useRef(true);
  useEffect(() => {
    if (!voteDraftKey) return;
    if (voteInitSkip.current) { voteInitSkip.current = false; return; }
    clearTimeout(voteDraftTimer.current);
    voteDraftTimer.current = setTimeout(() => {
      try { localStorage.setItem(voteDraftKey, JSON.stringify(voteState)); } catch {}
    }, DRAFT_DEBOUNCE);
    return () => clearTimeout(voteDraftTimer.current);
  }, [voteState, voteDraftKey]);

  // Accept jury seat — first-come-first-seated
  const acceptJurySeat = async (subId, isCross) => {
    // ── Accept jury seat via relational API (single source of truth) ──
    try {
      const juryRes = await fetch("/api/jury");
      if (!juryRes.ok) { alert("Failed to load jury assignments"); return; }
      const juryData = await juryRes.json();
      const assignment = (juryData.assignments || []).find(a =>
        a.submission_id === subId && !a.accepted
      );
      if (assignment) {
        const acceptRes = await fetch(`/api/jury/${assignment.id}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!acceptRes.ok) { const d = await acceptRes.json().catch(() => ({})); alert(d.error || "Failed to accept seat"); return; }
      }
    } catch (e) { alert("Network error accepting jury seat"); return; }
    setReviewingId(subId); load(); invalidateAll();
  };

  const castVote = async (subId, approve, isCross) => {
    // Rejection requires a meaningful note (50+ characters) so the submitter understands why
    if (!approve && voteNote.trim().length < 50) return alert("Rejection requires a review note of at least 50 characters explaining your reasoning. This ensures the submitter has grounds to understand — and potentially dispute — the decision.");
    // ── Vote via relational API (single source of truth) ──
    // The server handles vote recording, resolution logic, reputation updates,
    // vault graduation, cross-group promotion, and deception findings.
    try {
      const res = await fetch(`/api/submissions/${subId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approve,
          note: voteNote.trim(),
          deliberateLie: lieChecked,
          newsworthy: newsRating,
          interesting: funRating,
          role: isCross ? "cross_group" : "in_group",
        }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); alert(data.error || "Vote failed"); return; }
    } catch (e) { alert("Network error casting vote"); return; }
    clearDraft(`ta_draft_vote_${subId}`); voteInitSkip.current = true; lastRestoredId.current = null;
    setReviewingId(null); setVoteNote(""); setNewsRating(5); setFunRating(5); setLieChecked(false); setEditVotes({}); setVaultVotes({}); load(); invalidateAll();
  };

  if (loading) return <Loader />;
  const all = Object.values(subs || {});
  const myOrgs = new Set(user.orgIds || (user.orgId ? [user.orgId] : []));
  // Wild West: everyone in the same assembly can review (except own/DI-connected)
  // Normal: only assigned jurors see the submission
  const isEligibleReviewer = (s) => {
    if (s.submittedBy === user.username) return false;
    if (s.diPartner === user.username) return false;
    if (s.isDI && s.submittedBy && user.isDI && user.diPartner === s.submittedBy) return false;
    return true;
  };
  const reviewStatuses = wildWest ? new Set(["pending_review", "pending_jury"]) : new Set(["pending_review"]);
  const igQ = all.filter(s => {
    // Always exclude items the user already voted on
    if ((s.votes || {})[user.username]) return false;
    // Trust server-side queue: if the queue endpoint returned this item, show it
    if (s._inMyQueue && reviewStatuses.has(s.status) && s.status !== "cross_review" && isEligibleReviewer(s)) return true;
    // Wild West: any eligible org member can review
    if (wildWest) return reviewStatuses.has(s.status) && myOrgs.has(s.orgId) && isEligibleReviewer(s);
    // Normal: only assigned jurors
    return s.status === "pending_review" && (s.jurors || []).includes(user.username);
  });
  const cgQ = all.filter(s => s.status === "cross_review" && (s.crossGroupJurors || []).includes(user.username) && !(s.crossGroupVotes || {})[user.username]);
  const dQ = Object.values(disputes || {}).filter(d => d.status === "pending_review" && (d.jurors || []).includes(user.username) && !(d.votes || {})[user.username]);
  // All disputes involving the current user (filed by them or against their submissions)
  const myDisputes = Object.values(disputes || {}).filter(d => d.disputedBy === user.username || d.originalSubmitter === user.username);
  const diQ = all.filter(s => s.status === "di_pending" && (
    s.diPartner === user.username ||
    (s.isDI && user.diPartner && s.submittedBy === user.diPartner)
  ));
  // Show DI tab if user has any DI relationship, pending items, or pending link requests
  const pendingDILinks = Object.values(diLinkReqs).filter(r => r.partnerUsername === user.username && r.status === "pending");
  const hasDIPartnership = !!user.diPartner || all.some(s => s.isDI && s.diPartner === user.username) || diQ.length > 0 || pendingDILinks.length > 0;

  // My approved submissions (for history tab)
  const myApproved = all.filter(s => s.submittedBy === user.username && ["approved", "consensus", "cross_review"].includes(s.status));

  // My rejected submissions that they can concede or dispute
  // Deduplicate cross-assembly duplicates — keep the first (highest priority) and merge assembly names
  const myRejectedRaw = all.filter(s => s.submittedBy === user.username && s.status === "rejected");
  const rejectedByUrl = new Map();
  const myRejected = [];
  for (const s of myRejectedRaw) {
    const key = s.url ? s.url.replace(/\/$/, "").toLowerCase() : s.id;
    if (rejectedByUrl.has(key)) {
      const existing = rejectedByUrl.get(key);
      if (!existing._otherAssemblies) existing._otherAssemblies = [];
      if (s.orgName && s.orgName !== existing.orgName && !existing._otherAssemblies.includes(s.orgName)) {
        existing._otherAssemblies.push(s.orgName);
      }
    } else {
      rejectedByUrl.set(key, s);
      myRejected.push(s);
    }
  }
  const myDisputedSubs = new Set(Object.values(disputes || {}).filter(d => d.originalSubmitter === user.username || d.disputedBy === user.username).map(d => d.submissionId));

  const submitConcession = async (subId) => {
    setConcedeError("");
    if (!concedeReason.trim()) return setConcedeError("Reasoning required.");
    try {
      const res = await fetch("/api/concessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: subId, reasoning: concedeReason.trim() }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setConcedeError(data.error || "Failed to concede"); return; }
    } catch { setConcedeError("Network error."); return; }
    setConcedingId(null); setConcedeReason("");
    setConcedeSuccess("Concession submitted. Your reputation recovery is being calculated.");
    load(); invalidateAll();
  };

  const submitResultDispute = async (subId) => {
    setResultDisputeError("");
    if (!resultDisputeForm.reasoning.trim()) return setResultDisputeError("Reasoning required.");
    const validEvidence = resultDisputeForm.evidence.filter(e => e.url.trim());
    for (const ev of validEvidence) {
      if (!/^https?:\/\/.+\..+/.test(ev.url.trim())) return setResultDisputeError("Evidence URLs must start with http:// or https://");
    }
    const result = await fileDispute(subId, user.username, resultDisputeForm.reasoning, validEvidence, { disputeType: "challenge_rejection" });
    if (result.error) return setResultDisputeError(result.error);
    setDisputingResultId(null); setResultDisputeForm({ reasoning: "", evidence: [{ url: "", explanation: "" }] });
    setConcedeSuccess("Dispute filed. A new jury will review.");
    load(); invalidateAll();
  };

  const castDisputeVote = async (disputeId, upheld) => {
    // ── Vote on dispute via relational API (single source of truth) ──
    try {
      const res = await fetch(`/api/disputes/${disputeId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve: upheld, note: voteNote.trim(), deliberateLie: lieChecked }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); alert(data.error || "Dispute vote failed"); return; }
    } catch (e) { alert("Network error casting dispute vote"); return; }
    clearDraft(`ta_draft_vote_${disputeId}`); voteInitSkip.current = true; lastRestoredId.current = null;
    setReviewingId(null); setVoteNote(""); setLieChecked(false); load(); invalidateAll();
  };

  // Assembly manila tab — matches feed page styling
  const AssemblyTab = ({ orgId, orgName }) => {
    const org = orgsData[orgId];
    return (
      <div style={{ display: "flex", gap: 2, marginBottom: 0 }}>
        <div className="manila-tab manila-tab-active">
          {org?.avatar && <img src={org.avatar} width={14} height={14} alt="" style={{ objectFit: "cover", marginRight: 4, verticalAlign: "middle" }} />}
          <span className="manila-tab-name">{safe(orgName)}</span>
        </div>
      </div>
    );
  };

  const renderItem = (sub, isCross) => {
    if (!sub || !sub.id) return null;
    const seats = isCross ? (sub.crossGroupJurySize || (sub.crossGroupJurors || []).length) : (sub.jurySeats || (sub.jurors || []).length);
    const accepted = isCross ? (sub.crossGroupAcceptedJurors || []).length : (sub.acceptedJurors || []).length;
    const votesIn = isCross ? Object.keys(sub.crossGroupVotes || {}).length : Object.keys(sub.votes || {}).length;
    const needed = getMajority(seats);
    return (
    <div key={sub.id}>
    <AssemblyTab orgId={sub.orgId} orgName={sub.orgName} />
    <div className="ta-card" style={{ borderLeft: `4px solid ${isCross ? "#0D9488" : "#D97706"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>{orgsData[sub.orgId]?.avatar && <img src={orgsData[sub.orgId].avatar} width={14} height={14} alt="" style={{ objectFit: "cover", marginRight: 3, verticalAlign: "middle" }} />}{safe(sub.orgName)} · {sDate(sub.createdAt)}{sub.isDI && <><span> · </span><Icon name="robot" size={14} /> DI</>}</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-sec)", background: "var(--card-bg)", padding: "1px 5px", borderRadius: 0 }}>Seated {accepted}/{seats} · Voted {votesIn}/{seats} · need {needed}</span>
          <StatusPill status={sub.status} />
        </div>
      </div>
      <a href={safeHref(sub.url)} target="_blank" rel="noopener" style={{ fontSize: 10, color: "var(--gold)", wordBreak: "break-all" }}>{safe(sub.url)}</a>
      {isCross && <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--gold)", padding: "4px 8px", background: "var(--card-bg)", borderRadius: 0, marginTop: 6 }}>Cross-group jury: {seats} jurors · ≤{MAX_SHARED_ASSEMBLIES} shared non-GP memberships per pair · No members of {safe(sub.orgName)}</div>}
      <div style={{ margin: "8px 0", padding: 10, background: "var(--card-bg)", borderRadius: 0 }}>
        <SubHeadline sub={sub} />
      </div>
      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.8, marginBottom: 10 }}>{safe(sub.reasoning)}</div>

      {sub.evidence && sub.evidence.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, background: "var(--card-bg)", borderRadius: 0 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--text-sec)", marginBottom: 6 }}>Evidence: {sub.evidence.length} Source{sub.evidence.length > 1 ? "s" : ""}</div>
          {sub.evidence.map((e, i) => <div key={i} style={{ marginBottom: 8, fontSize: 12 }}><a href={safeHref(e.url)} target="_blank" rel="noopener" style={{ color: "var(--gold)" }}>{safe(e.url)}</a>{e.explanation && <div style={{ color: "var(--text-sec)", marginTop: 2 }}>↳ {safe(e.explanation)}</div>}</div>)}
        </div>
      )}

      {sub.inlineEdits && sub.inlineEdits.length > 0 && (
        <div style={{ marginTop: 14, padding: 12, background: "var(--card-bg)", borderRadius: 0 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--text-sec)", marginBottom: 6 }}>{sub.inlineEdits.length} In-Line Edit{sub.inlineEdits.length > 1 ? "s" : ""} — {reviewingId === sub.id ? "vote on each" : "line-by-line review"}</div>
          {sub.inlineEdits.map((e, i) => (
            <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < sub.inlineEdits.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 4 }}>
                <span style={{ textDecoration: "line-through", color: "var(--text-muted)" }}>{safe(e.original)}</span> → <span style={{ color: "var(--red)", fontWeight: 600 }}>{safe(e.replacement)}</span>
                {e.reasoning && <div style={{ fontSize: 12, color: "var(--text-sec)", marginTop: 1 }}>↳ {safe(e.reasoning)}</div>}
              </div>
              {reviewingId === sub.id && (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button onClick={() => setEditVotes(v => ({ ...v, [i]: true }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: editVotes[i] === true ? "#059669" : "var(--border)", background: editVotes[i] === true ? "#ECFDF5" : "#fff", color: editVotes[i] === true ? "#059669" : "#64748B", borderRadius: 0, cursor: "pointer" }}>✓ Approve Edit</button>
                  <button onClick={() => setEditVotes(v => ({ ...v, [i]: false }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: editVotes[i] === false ? "#DC2626" : "var(--border)", background: editVotes[i] === false ? "#FEF2F2" : "#fff", color: editVotes[i] === false ? "#DC2626" : "#64748B", borderRadius: 0, cursor: "pointer" }}>✗ Reject Edit</button>
                </div>
              )}
              {reviewingId !== sub.id && e.approved !== undefined && (
                <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: e.approved ? "#059669" : "#DC2626", fontWeight: 700 }}>{e.approved ? "✓ APPROVED" : "✗ REJECTED"}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {sub.standingCorrection && (
        <div style={{ marginTop: 14, padding: 12, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--text-sec)", marginBottom: 3 }}><Icon name="vault" size={16} /> Standing Correction Proposed</div>
          <div style={{ color: "var(--text)", fontWeight: 600 }}>{safe(sub.standingCorrection.assertion)}</div>
          {sub.standingCorrection.evidence && <div style={{ color: "var(--text-sec)", fontSize: 12, marginTop: 2 }}>Source: {safe(sub.standingCorrection.evidence)}</div>}
        </div>
      )}

      {sub.argumentEntry && (
        <div style={{ marginTop: 8, padding: 10, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--gold)", marginBottom: 3 }}><Icon name="dispute" size={16} /> Argument Proposed</div>
          <div style={{ color: "var(--text)", lineHeight: 1.6 }}>{safe(sub.argumentEntry.content)}</div>
        </div>
      )}

      {sub.beliefEntry && (
        <div style={{ marginTop: 8, padding: 10, background: "rgba(124,58,237,0.09)", border: "1px solid rgba(124,58,237,0.27)", borderRadius: 0, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#7C3AED", marginBottom: 3 }}><Icon name="jury" size={16} /> Foundational Belief Proposed</div>
          <div style={{ color: "var(--text)", lineHeight: 1.6, fontStyle: "italic" }}>{safe(sub.beliefEntry.content)}</div>
        </div>
      )}

      {sub.translationEntry && (
        <div style={{ marginTop: 8, padding: 10, background: "rgba(212,168,67,0.09)", border: "1px solid #B4530980", borderRadius: 0, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#B45309", marginBottom: 3 }}><Icon name="dispute" size={16} /> Translation Proposed — {sub.translationEntry.type}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ textDecoration: "line-through", color: "var(--text-sec)" }}>{safe(sub.translationEntry.original)}</span>
            <span style={{ color: "#B45309", fontWeight: 700 }}>→</span>
            <span style={{ color: "#B45309", fontWeight: 700 }}>{safe(sub.translationEntry.translated)}</span>
          </div>
        </div>
      )}

      {sub.linkedVaultEntries && sub.linkedVaultEntries.length > 0 && (
        <div style={{ marginTop: 10, padding: 10, background: "var(--card-bg)", borderRadius: 0, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--text-sec)", marginBottom: 8 }}>{sub.linkedVaultEntries.length} Linked Vault Entr{sub.linkedVaultEntries.length === 1 ? "y" : "ies"} — vote on each</div>
          {sub.linkedVaultEntries.map(e => {
            const tc = { correction: ["vault", "#059669", "rgba(74,158,85,0.09)"], argument: ["dispute", "#0D9488", "rgba(13,148,136,0.09)"], belief: ["jury", "#7C3AED", "rgba(124,58,237,0.09)"] }[e.type] || ["vault", "#475569", "var(--card-bg)"];
            return <div key={e.id} style={{ marginBottom: 8, padding: "8px 10px", background: tc[2], border: `1px solid ${tc[1]}30`, borderRadius: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: tc[1], fontWeight: 700 }}><Icon name={tc[0]} size={16} /> Existing {e.type}{e.survivalCount > 0 ? ` · survived ${e.survivalCount} review${e.survivalCount !== 1 ? "s" : ""}` : ""}</div>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)", marginBottom: reviewingId === sub.id ? 6 : 0 }}>{safe(e.label)}</div>
              {e.detail && <div style={{ fontSize: 12, color: "var(--text-sec)", marginTop: 2 }}>Source: {safe(e.detail)}</div>}
              {reviewingId === sub.id && (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button onClick={() => setVaultVotes(v => ({ ...v, [e.id]: true }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes[e.id] === true ? "#059669" : "var(--border)", background: vaultVotes[e.id] === true ? "#ECFDF5" : "#fff", color: vaultVotes[e.id] === true ? "#059669" : "#64748B", borderRadius: 0, cursor: "pointer" }}>✓ Still Applies</button>
                  <button onClick={() => setVaultVotes(v => ({ ...v, [e.id]: false }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes[e.id] === false ? "#DC2626" : "var(--border)", background: vaultVotes[e.id] === false ? "#FEF2F2" : "#fff", color: vaultVotes[e.id] === false ? "#DC2626" : "#64748B", borderRadius: 0, cursor: "pointer" }}>✗ No Longer Valid</button>
                </div>
              )}
              {reviewingId !== sub.id && e.stillApplies !== undefined && (
                <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: e.stillApplies ? "#059669" : "#DC2626", fontWeight: 700 }}>{e.stillApplies ? "✓ STILL APPLIES" : "✗ NO LONGER VALID"}</span>
              )}
            </div>;
          })}
        </div>
      )}

      {reviewingId === sub.id ? (
        <div style={{ marginTop: 12, padding: 14, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", marginBottom: 10 }}>Headline Correction Verdict</div>
          <RatingInput label="How Newsworthy" value={newsRating} onChange={setNewsRating} rubric={NEWS_RUBRIC} />
          <RatingInput label="How Interesting" value={funRating} onChange={setFunRating} rubric={FUN_RUBRIC} />
          <div className="ta-field"><label>Review Note (permanent, public){voteNote.trim().length < 50 && <span style={{ color: "var(--red)", fontSize: 10, marginLeft: 6 }}>Min 50 chars required for rejections ({voteNote.trim().length}/50)</span>}</label><textarea value={voteNote} onChange={e => setVoteNote(e.target.value)} rows={2} placeholder="Explain your reasoning... (minimum 50 characters required for rejections)" /></div>
          <DeliberateLieCheckbox checked={lieChecked} onChange={setLieChecked} />
          <div style={{ position: "sticky", bottom: 0, background: "linear-gradient(transparent, #FFFFFF 8px)", paddingTop: 10, paddingBottom: 4, zIndex: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="ta-btn-primary" style={{ background: "var(--green)", flex: 1 }} onClick={() => castVote(sub.id, true, isCross)}>✓ Approve</button>
              <button className="ta-btn-primary" style={{ background: "var(--red)", flex: 1, opacity: voteNote.trim().length < 50 ? 0.6 : 1 }} onClick={() => castVote(sub.id, false, isCross)}>✗ Reject{voteNote.trim().length < 50 ? ` (${50 - voteNote.trim().length} more chars needed)` : ""}</button>
              <button className="ta-btn-ghost" onClick={() => setReviewingId(null)}>Cancel</button>
              <button className="ta-btn-primary" style={{ background: "#EA580C" }} onClick={async () => { const r = await recuseJuror(sub.id, user.username, isCross); if (r.success) { setReviewingId(null); load(); } }}>Recuse</button>
            </div>
            <LegalDisclaimer short />
          </div>
        </div>
      ) : (() => {
        const accepted = isCross ? (sub.crossGroupAcceptedJurors || []) : (sub.acceptedJurors || []);
        const seats = isCross ? (sub.crossGroupJurySize || (sub.crossGroupJurors || []).length) : (sub.jurySeats || (sub.jurors || []).length);
        const alreadyAccepted = accepted.includes(user.username);
        const startReview = () => {
          setReviewingId(sub.id); setVoteNote(""); setNewsRating(5); setFunRating(5); setLieChecked(false);
          const ev = {}; if (sub.inlineEdits) sub.inlineEdits.forEach((_, i) => { ev[i] = true; }); setEditVotes(ev);
          const vv = {}; if (sub.linkedVaultEntries) sub.linkedVaultEntries.forEach(e => { vv[e.id] = true; }); setVaultVotes(vv);
        };
        return (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-sec)", marginBottom: 4 }}>{accepted.length}/{seats} seats filled · {seats - accepted.length} remaining</div>
            {!alreadyAccepted
              ? <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, padding: "6px 8px", background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>You'll have 6 hours to complete your review. If you're unable to finish, your seat will be opened to another juror.</div>
              : <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, padding: "6px 8px", background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>Your 6-hour review window is still active. Pick up where you left off.</div>
            }
            <button className="ta-btn-secondary" onClick={async () => {
              if (!alreadyAccepted) await acceptJurySeat(sub.id, isCross);
              startReview();
            }}>{alreadyAccepted ? "Continue Review" : "Accept Seat & Review"}</button>
          </div>
        );
      })()}
      <AuditTrail entries={sub.auditTrail} />
    </div>
    </div>
  ); };

  const renderDisputeVotingItem = (d) => {
    const jurors = d.jurors || [];
    const votes = d.votes || {};
    const seats = d.jurySeats || jurors.length;
    const votesIn = Object.keys(votes).length;
    const needed = Math.floor(seats / 2) + 1;
    return (
    <div key={d.id}>
    <AssemblyTab orgId={d.orgId} orgName={d.orgName} />
    <div className="ta-card" style={{ borderLeft: "4px solid #EA580C" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)" }}><Icon name="jury" size={14} /> {anonName(d.disputedBy, d.anonMap, d.resolvedAt)} vs {anonName(d.originalSubmitter, d.anonMap, d.resolvedAt)} · {safe(d.orgName)} · {sDate(d.createdAt)}</span>
        <span style={{ fontSize: 10, padding: "2px 7px", background: "rgba(212,168,67,0.09)", color: "#EA580C", borderRadius: 0, fontFamily: "var(--mono)", textTransform: "uppercase", fontWeight: 700 }}>Dispute</span>
      </div>
      <div style={{ padding: 10, background: "var(--card-bg)", borderRadius: 0, marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-sec)", marginBottom: 3 }}>ORIGINAL SUBMISSION BY {anonName(d.originalSubmitter, d.anonMap, d.resolvedAt)}</div>
        <div style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{safe(d.submissionHeadline)}</div>
        <div style={{ fontSize: 12, color: "var(--text-sec)", marginTop: 6, lineHeight: 1.8 }}>{safe(d.submissionReasoning)}</div>
      </div>
      <div style={{ padding: 12, background: "rgba(212,168,67,0.09)", border: "1px solid #EA580C", borderRadius: 0, marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#EA580C", marginBottom: 4 }}>DISPUTE BY {anonName(d.disputedBy, d.anonMap, d.resolvedAt)}</div>
        <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.8 }}>{safe(d.reasoning)}</div>
        {d.evidence && d.evidence.length > 0 && <div style={{ marginTop: 6 }}>{d.evidence.map((e, i) => <div key={i} style={{ fontSize: 12 }}><a href={safeHref(e.url)} target="_blank" rel="noopener" style={{ color: "var(--gold)" }}>{safe(e.url)}</a>{e.explanation && <div style={{ color: "var(--text-sec)" }}>↳ {safe(e.explanation)}</div>}</div>)}</div>}
      </div>
      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-sec)", background: "var(--card-bg)", padding: "1px 5px" }}>Voted {votesIn}/{seats} · need {needed}</span>
      {reviewingId === d.id ? (
        <div style={{ padding: 14, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0, marginTop: 8 }}>
          <div style={{ padding: 8, background: "rgba(212,168,67,0.09)", border: "1px solid #CA8A04", borderRadius: 0, marginBottom: 10, fontSize: 12, color: "var(--text-sec)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--gold)" }}>Dispute Stakes:</strong> If upheld, the disputer earns a <strong>+{W.disputeWin} point reward</strong> for catching the error. If dismissed, the disputer takes drag — same as being wrong. The original submitter faces the inverse. Your vote here has significant consequences.
          </div>
          <div className="ta-field"><label>Review Note (permanent, public)</label><textarea value={voteNote} onChange={e => setVoteNote(e.target.value)} rows={2} /></div>
          <DeliberateLieCheckbox checked={lieChecked} onChange={setLieChecked} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="ta-btn-primary" style={{ background: "#EA580C" }} onClick={() => castDisputeVote(d.id, true)}>Uphold Dispute</button>
            <button className="ta-btn-primary" style={{ background: "var(--green)" }} onClick={() => castDisputeVote(d.id, false)}>Dismiss (Original Stands)</button>
            <button className="ta-btn-ghost" onClick={() => setReviewingId(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, padding: "6px 8px", background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>
            Accept this dispute review seat to begin evaluating the evidence. Read both sides carefully before voting.
          </div>
          <button className="ta-btn-secondary" onClick={() => { setReviewingId(d.id); setVoteNote(""); setLieChecked(false); }}>Accept Seat & Review Dispute</button>
        </div>
      )}
      <AuditTrail entries={d.auditTrail} />
    </div>
    </div>
    );
  };

  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Review Queue</h2>

      {/* Per-tab education text */}
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", lineHeight: 1.5, marginBottom: 8 }}>
        {{ ingroup: "Vote to approve or reject submissions from citizens in your own Assemblies.",
           crossgroup: "Vote to approve or reject submissions from citizens in other Assemblies.",
           stories: "Vote to approve Story Artifacts that organize submissions around events and themes.",
           disputes: "Think the jury got it wrong? Re-submit your case. There is a penalty for being repeatedly wrong, the same way there is a reward for proving you were correct. You may also concede to recover lost points (once per week: 100% recovery).",
           myresults: "Your approved submissions and their final verdicts across all assemblies.",
           di: "Review and approve pre-screened submissions from your registered AI Agent agent."
        }[tab] || "Vote to approve or reject submissions from citizens in your own Assemblies."}
      </div>

      {/* Anonymous voting box */}
      <div style={{ background: "rgba(212,168,67,0.08)", border: "1px solid rgba(212,168,67,0.2)", padding: "8px 12px", marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: "var(--text)", lineHeight: 1.5 }}>Your votes are <span style={{ color: "var(--gold)", fontWeight: 700 }}>anonymous</span>. No one — not the submitter, not other jurors, not administrators — can see how you voted. This is your ability to speak the truth as an individual, free from social pressure. Vote your conscience.</div>
      </div>

      {hasActiveDeceptionPenalty(user) && <div style={{ padding: 10, background: "rgba(196,74,58,0.09)", border: "1.5px solid #991B1B", borderRadius: 0, marginBottom: 12, fontSize: 12, color: "var(--red)", lineHeight: 1.6 }}><strong>All voting rights suspended</strong> — Deception penalty active for {deceptionPenaltyRemaining(user)} more days. You cannot serve on juries during this period.</div>}
      {isDIUser(user) && <div style={{ padding: 10, background: "var(--card-bg)", border: "1.5px solid #4F46E5", borderRadius: 0, marginBottom: 12, fontSize: 12, color: "var(--gold)", lineHeight: 1.6 }}><Icon name="robot" size={14} /> <strong>AI Agents cannot serve on juries or vote.</strong> Humans review, AI Agents submit. Your partner @{safe(user.diPartner)} handles review duties.</div>}
      <div className="ta-review-tabs">
        {[["ingroup", "In-Group", igQ.length + dQ.length], ["crossgroup", "Cross-Group", cgQ.length], ["stories", "Stories", storyProposals.length], ["disputes", "My Disputes", myDisputes.length + myRejected.length], ["myresults", "My Results", myApproved.length], ...(hasDIPartnership ? [["di", <>AI Queue</>, diQ.length]] : [])].map(([k, l, c]) => (
          <button key={k} onClick={() => setTab(k)} className={`ta-review-tab${tab === k ? " active" : ""}`}>
            {k === "di" && <span style={{ background: "var(--gold)", color: "#0d0d0a", borderRadius: "50%", padding: "1px 5px", fontSize: 10, marginRight: 4 }}><Icon name="robot" size={10} /></span>}
            {l} {c > 0 && <span style={{ background: "var(--gold)", color: "#0d0d0a", borderRadius: "50%", padding: "1px 5px", fontSize: 10, marginLeft: 4 }}>{c}</span>}
          </button>
        ))}
      </div>
      {tab === "ingroup" && ((igQ.length === 0 && dQ.length === 0) ? <Empty text="No in-group reviews waiting." /> : <div>
        {igQ.map(s => renderItem(s, false))}
        {dQ.length > 0 && <>
          {igQ.length > 0 && <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12 }} />}
          <p style={{ fontSize: 13, color: "var(--text-sec)", marginBottom: 12, lineHeight: 1.6 }}>Intra-Assembly disputes awaiting your vote. Upholding the dispute means the original submission was wrong. Dismissing means it stands.</p>
        </>}
        {dQ.map(d => renderDisputeVotingItem(d))}
      </div>)}
      {tab === "crossgroup" && (cgQ.length === 0 ? <Empty text="No cross-group reviews waiting." /> : <div><p style={{ fontSize: 13, color: "var(--text-sec)", marginBottom: 12, lineHeight: 1.6 }}>These corrections were approved by another Assembly and now face cross-group review. Jury size scales with the number of qualifying Assemblies in the ecosystem. No two jurors share more than 2 non-GP Assembly memberships — your perspective is independent by design.</p>{cgQ.map(s => renderItem(s, true))}</div>)}
      {tab === "disputes" && <div>
      {myDisputes.length === 0 && myRejected.length === 0 && <Empty text="No disputes or rejected submissions involving you." />}
      {/* My Disputes — inline within disputes tab */}
      {myDisputes.length > 0 && <div style={{ marginTop: 16 }}>
        <p style={{ fontSize: 13, color: "var(--text-sec)", marginBottom: 12, lineHeight: 1.6 }}>All disputes involving your submissions — either filed by you or filed against your work. Track the status and outcome of each dispute.</p>
        {myDisputes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(d => {
          const isDisputer = d.disputedBy === user.username;
          const statusColor = d.status === "pending_review" ? "#D97706" : d.status === "upheld" ? "#DC2626" : "#059669";
          const statusLabel = d.status === "pending_review" ? "Under Review" : d.status === "upheld" ? "Upheld (Disputer Won)" : "Dismissed (Original Stands)";
          const voteCount = Object.keys(d.votes || {}).length;
          const upheldCount = Object.values(d.votes || {}).filter(v => v.approve).length;
          const rejectedCount = voteCount - upheldCount;
          // Collect rejection notes from jurors
          const jurorNotes = Object.values(d.votes || {}).filter(v => v.note && v.note.trim()).map(v => ({ note: v.note, approve: v.approve, time: v.time }));
          return (
            <div key={d.id}>
            <AssemblyTab orgId={d.orgId} orgName={d.orgName} />
            <div className="ta-card" style={{ borderLeft: `4px solid ${statusColor}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>
                  {isDisputer ? "You disputed" : "Disputed against you"} · {sDate(d.createdAt)}
                </span>
                <StatusPill status={d.status} />
              </div>
              <div style={{ padding: 10, background: "var(--card-bg)", borderRadius: 0, marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-sec)", marginBottom: 3 }}>ORIGINAL SUBMISSION</div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{safe(d.submissionHeadline)}</div>
                <div style={{ fontSize: 12, color: "var(--text-sec)", marginTop: 4, lineHeight: 1.6 }}>{safe(d.submissionReasoning)}</div>
              </div>
              <div style={{ padding: 10, background: "rgba(212,168,67,0.09)", border: "1px solid #EA580C40", borderRadius: 0, marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#EA580C", marginBottom: 3 }}>DISPUTE REASONING</div>
                <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>{safe(d.reasoning)}</div>
                {d.evidence && d.evidence.length > 0 && <div style={{ marginTop: 6 }}>{d.evidence.map((e, i) => <div key={i} style={{ fontSize: 12 }}><a href={safeHref(e.url)} target="_blank" rel="noopener" style={{ color: "var(--gold)" }}>{safe(e.url)}</a>{e.explanation && <div style={{ color: "var(--text-sec)" }}>↳ {safe(e.explanation)}</div>}</div>)}</div>}
              </div>
              {d.status !== "pending_review" && <div style={{ padding: 10, background: d.status === "upheld" ? "#FEF2F2" : "#ECFDF5", borderRadius: 0, marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: statusColor, marginBottom: 3 }}>OUTCOME</div>
                <div style={{ fontSize: 13, color: "var(--text)" }}>{d.status === "upheld" ? "The dispute was upheld — the original submission was found to be wrong." : "The dispute was dismissed — the original submission stands."}</div>
                <div style={{ fontSize: 11, color: "var(--text-sec)", marginTop: 4 }}>Votes: {upheldCount} uphold / {rejectedCount} dismiss</div>
              </div>}
              {d.status === "pending_review" && <div style={{ fontSize: 11, color: "var(--gold)" }}>Jury review in progress — {voteCount}/{d.jurySeats || (d.jurors || []).length} votes cast</div>}
              {jurorNotes.length > 0 && <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--text-sec)", marginBottom: 4 }}>Juror Notes</div>
                {jurorNotes.map((jn, i) => <div key={i} style={{ fontSize: 12, padding: "6px 8px", marginBottom: 4, background: jn.approve ? "#ECFDF5" : "#FEF2F2", borderRadius: 0, borderLeft: `3px solid ${jn.approve ? "#059669" : "#DC2626"}`, lineHeight: 1.5 }}>
                  <span style={{ fontSize: 10, color: jn.approve ? "#059669" : "#DC2626", fontFamily: "var(--mono)", fontWeight: 700 }}>{jn.approve ? "UPHOLD" : "DISMISS"}</span> — {safe(jn.note)}
                </div>)}
              </div>}
              <AuditTrail entries={d.auditTrail} />
            </div>
            </div>
          );
        })}
      </div>}
      {/* Rejected submissions — concede or dispute */}
      {myRejected.length > 0 && <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--red)", fontWeight: 700, marginBottom: 8 }}>Your Rejected Submissions — Choose to Concede or Dispute</div>
        <p style={{ fontSize: 13, color: "var(--text-sec)", marginBottom: 12, lineHeight: 1.6 }}>
          <strong>Concede</strong> to accept the rejection and recover reputation, or <strong>dispute</strong> to challenge with additional evidence — a new jury will decide.
        </p>
        {concedeSuccess && <div className="ta-success" style={{ marginBottom: 12 }}>{concedeSuccess}</div>}
        {myRejected.sort((a, b) => new Date(b.resolvedAt || b.createdAt) - new Date(a.resolvedAt || a.createdAt)).map(s => {
          const approveCount = Object.values(s.votes || {}).filter(v => v.approve).length;
          const rejectCount = Object.values(s.votes || {}).filter(v => !v.approve).length;
          const rejectionNotes = Object.entries(s.votes || {}).filter(([, v]) => !v.approve && v.note).map(([voter, v]) => ({ voter, note: v.note, time: v.time }));
          const hasDisputed = myDisputedSubs.has(s.id);
          const recovery = s.resolvedAt ? getConcessionRecovery(s.resolvedAt) : 0;
          return (
            <div key={s.id}>
            <AssemblyTab orgId={s.orgId} orgName={s.orgName} />
            <div className="ta-card" style={{ borderLeft: "4px solid #DC2626" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>
                  Rejected {sDate(s.resolvedAt)} · {approveCount}↑ {rejectCount}↓
                </span>
                <StatusPill status={s.status} />
              </div>
              <a href={safeHref(s.url)} target="_blank" rel="noopener" style={{ fontSize: 10, color: "var(--gold)", wordBreak: "break-all" }}>{safe(s.url)}</a>
              <div style={{ margin: "8px 0", padding: 10, background: "var(--card-bg)", borderRadius: 0 }}>
                <SubHeadline sub={s} />
              </div>
              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.8, marginBottom: 8 }}>{safe(s.reasoning)}</div>

              {/* Juror rejection notes */}
              {rejectionNotes.length > 0 && (
                <div style={{ marginBottom: 10, padding: 10, background: "rgba(196,74,58,0.09)", border: "1px solid #FECACA", borderRadius: 0 }}>
                  <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--red)", marginBottom: 6, fontWeight: 700 }}>JUROR REJECTION NOTES</div>
                  {rejectionNotes.map((jn, i) => (
                    <div key={i} style={{ fontSize: 12, color: "var(--text)", padding: "6px 0", borderTop: i > 0 ? "1px solid #FECACA" : "none", lineHeight: 1.6 }}>
                      {safe(jn.note)}
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              {hasDisputed ? (
                <div style={{ fontSize: 11, color: "#EA580C", fontFamily: "var(--mono)", padding: "6px 8px", background: "rgba(212,168,67,0.09)", borderRadius: 0 }}>Dispute filed — awaiting jury review</div>
              ) : (
                <div>
                  {concedingId !== s.id && disputingResultId !== s.id && (
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button className="ta-btn-secondary" style={{ fontSize: 11, borderColor: "#7C3AED", color: "#7C3AED" }} onClick={() => { setConcedingId(s.id); setDisputingResultId(null); setConcedeReason(""); setConcedeError(""); }}>
                        Concede ({Math.round(recovery * 100)}% recovery)
                      </button>
                      <button className="ta-btn-secondary" style={{ fontSize: 11, borderColor: "#EA580C", color: "#EA580C" }} onClick={() => { setDisputingResultId(s.id); setConcedingId(null); setResultDisputeForm({ reasoning: "", evidence: [{ url: "", explanation: "" }] }); setResultDisputeError(""); }}>
                        Dispute Rejection
                      </button>
                    </div>
                  )}

                  {/* Concede form */}
                  {concedingId === s.id && (
                    <div style={{ marginTop: 8, padding: 12, background: "var(--card-bg)", border: "1.5px solid #7C3AED", borderRadius: 0 }}>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#7C3AED", fontWeight: 700, marginBottom: 6 }}>CONCEDE THIS REJECTION</div>
                      <p style={{ fontSize: 12, color: "var(--text-sec)", marginBottom: 8, lineHeight: 1.6 }}>
                        Conceding accepts the jury's rejection. Recovery: <strong>{Math.round(recovery * 100)}%</strong> of reputation loss.
                        {recovery >= 1 ? " First concession this week — full recovery." : recovery >= 0.9 ? " Within 2 weeks." : recovery >= 0.5 ? " Within 1 month — 50% recovery." : " Recovery decays over time."}
                      </p>
                      {concedeError && <div className="ta-error">{concedeError}</div>}
                      <div className="ta-field"><label>Why are you conceding? *</label><textarea value={concedeReason} onChange={e => setConcedeReason(e.target.value)} rows={2} placeholder="Briefly explain why you accept the jury's decision..." /></div>
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button className="ta-btn-primary" style={{ background: "#7C3AED" }} onClick={() => setShowConcedeConfirm(s.id)}>Submit Concession</button>
                        <button className="ta-btn-ghost" onClick={() => setConcedingId(null)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Dispute form */}
                  {disputingResultId === s.id && (
                    <div style={{ marginTop: 8, padding: 12, background: "rgba(212,168,67,0.09)", border: "1.5px solid #EA580C", borderRadius: 0 }}>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#EA580C", fontWeight: 700, marginBottom: 6 }}>DISPUTE THIS REJECTION</div>
                      <p style={{ fontSize: 12, color: "var(--text-sec)", marginBottom: 8, lineHeight: 1.6 }}>
                        Challenge the jury's rejection. Provide additional evidence and reasoning. A new jury will review. If upheld, your reputation is restored and the disputer gains credit.
                      </p>
                      {resultDisputeError && <div className="ta-error">{resultDisputeError}</div>}
                      <div className="ta-field"><label>Why was the rejection wrong? *</label><textarea value={resultDisputeForm.reasoning} onChange={e => setResultDisputeForm({ ...resultDisputeForm, reasoning: e.target.value })} rows={3} placeholder="Explain why the jury's rejection was incorrect. Provide additional context the jury may have missed..." /></div>
                      <EvidenceFields evidence={resultDisputeForm.evidence} onChange={ev => setResultDisputeForm({ ...resultDisputeForm, evidence: ev })} />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button className="ta-btn-primary" style={{ background: "#EA580C" }} onClick={() => submitResultDispute(s.id)}>File Dispute</button>
                        <button className="ta-btn-ghost" onClick={() => setDisputingResultId(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
          );
        })}
      </div>}
      </div>}

      {/* My Results Tab — submission history (approved/resolved) */}
      {tab === "myresults" && (myApproved.length === 0 ? <Empty text="No approved submissions yet. Your approved corrections and affirmations will appear here." /> : <div>
        <p style={{ fontSize: 13, color: "var(--text-sec)", marginBottom: 12, lineHeight: 1.6 }}>Your submissions that were approved by jury vote — your contribution to the assembly record.</p>
        {myApproved.sort((a, b) => new Date(b.resolvedAt || b.createdAt) - new Date(a.resolvedAt || a.createdAt)).map(s => {
          let domain = "";
          try { domain = new URL(String(s.url)).hostname.replace(/^www\./, ""); } catch {}
          return (
          <div key={s.id}>
          <AssemblyTab orgId={s.orgId} orgName={s.orgName} />
          <div className="ta-card" style={{ borderLeft: `4px solid ${s.status === "consensus" ? "#7C3AED" : "#059669"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>{sDate(s.resolvedAt || s.createdAt)}</span>
              <StatusPill status={s.status} />
            </div>
            {domain && <div style={{ fontSize: 10, color: "var(--gold)", marginBottom: 4 }}>{domain}</div>}
            <SubHeadline sub={s} size={14} />
            {s.reasoning && <div style={{ fontSize: 12, color: "var(--text-sec)", lineHeight: 1.6, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.reasoning}</div>}
            {s.evidence && s.evidence.length > 0 && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{s.evidence.length} evidence source{s.evidence.length > 1 ? "s" : ""}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="ta-btn-ghost" style={{ fontSize: 10, color: "var(--gold)" }} onClick={() => { if (typeof navigateToRecord === "function") navigateToRecord(s.id); else window.open("/record/" + s.id, "_blank"); }}>Open Full Record</button>
              <button className="ta-btn-ghost" style={{ fontSize: 10, color: "var(--text-muted)" }} onClick={() => { const url = window.location.origin + "/record/" + s.id; navigator.clipboard?.writeText(url); }}>Copy Link</button>
            </div>
          </div>
          </div>
          );
        })}
      </div>)}

      {/* Story Proposals Tab */}
      {tab === "stories" && (storyProposals.length === 0 ? <Empty text="No story proposals awaiting your review." /> : <div>
        <p style={{ fontSize: 13, color: "var(--text-sec)", marginBottom: 12, lineHeight: 1.6 }}>Story pages track real-world events across multiple submissions. Vote on whether these stories deserve their own page.</p>
        {storyProposals.map(sp => {
          const isReviewing = reviewingId === sp.id;
          return (
            <div key={sp.id} className="ta-card" style={{ borderLeft: "4px solid #8B5CF6" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>{safe(sp.submittedBy)} · {safe(sp.orgName)} · {sDate(sp.createdAt)}</span>
                <span style={{ fontSize: 10, padding: "2px 7px", background: "var(--card-bg)", color: "#7C3AED", borderRadius: 0, fontFamily: "var(--mono)", textTransform: "uppercase", fontWeight: 700 }}>Story Proposal</span>
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{safe(sp.title)}</div>
              <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7, marginBottom: 10, whiteSpace: "pre-wrap" }}>{safe(sp.description)}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
                Jurors: {(sp.jurors || []).length} assigned · Votes: {Object.keys(sp.votes || {}).length}/{sp.jurySeats || "?"}
              </div>
              {!isReviewing ? (
                <button className="ta-btn-primary" style={{ fontSize: 12 }} onClick={() => { setReviewingId(sp.id); setVoteNote(""); }}>Review & Vote</button>
              ) : (
                <div style={{ padding: 12, background: "var(--card-bg)", borderRadius: 0, border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-muted)", marginBottom: 8 }}>YOUR VOTE</div>
                  <textarea
                    className="ta-input"
                    style={{ width: "100%", marginBottom: 10, padding: "8px 12px", fontSize: 13, minHeight: 60, resize: "vertical" }}
                    placeholder="Optional note explaining your reasoning..."
                    value={voteNote}
                    onChange={e => setVoteNote(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ta-btn-primary" style={{ background: "var(--green)" }} onClick={async () => {
                      const res = await fetch(`/api/stories/${sp.id}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve: true, note: voteNote, role: sp.juryRole || "in_group" }) });
                      if (res.ok) { setReviewingId(null); load(); }
                    }}>Approve</button>
                    <button className="ta-btn-primary" style={{ background: "var(--red)" }} onClick={async () => {
                      const res = await fetch(`/api/stories/${sp.id}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve: false, note: voteNote, role: sp.juryRole || "in_group" }) });
                      if (res.ok) { setReviewingId(null); load(); }
                    }}>Reject</button>
                    <button className="ta-link-btn" onClick={() => setReviewingId(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>)}

      {/* DI Management Tab */}
      {tab === "di" && <DIPanelContent user={user} subs={subs} onReload={load} />}

      {/* Concession Confirmation Modal */}
      {showConcedeConfirm && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(10,10,6,0.94)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowConcedeConfirm(null)}>
          <div style={{ border: "1px solid var(--border)", padding: 20, textAlign: "center", maxWidth: 340, background: "var(--card-bg)" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#7C3AED", marginBottom: 6 }}>Concession is Permanent</div>
            <div style={{ fontSize: 12, color: "var(--text-sec)", marginBottom: 14, lineHeight: 1.6 }}>
              By conceding, you accept the jury's rejection. This cannot be undone. If you realize you were correct later on, <strong style={{ color: "var(--red)" }}>it will be too late to earn back reputation</strong>. If you believe you were right, dispute instead.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="ta-btn-primary" style={{ background: "#7C3AED", padding: "8px 20px", fontSize: 11, fontWeight: 700, letterSpacing: 1 }} onClick={() => { submitConcession(showConcedeConfirm); setShowConcedeConfirm(null); }}>YES, CONCEDE</button>
              <button style={{ padding: "8px 16px", fontSize: 11, border: "1px solid var(--border)", color: "var(--text-sec)", cursor: "pointer", background: "none" }} onClick={() => setShowConcedeConfirm(null)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

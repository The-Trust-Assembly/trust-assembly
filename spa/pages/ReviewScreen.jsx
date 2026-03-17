import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { SK, MAX_SHARED_ASSEMBLIES, NEWS_RUBRIC, FUN_RUBRIC } from "../lib/constants";
import { sDate, anonName } from "../lib/utils";
import { sG, isWildWestMode } from "../lib/storage";
import { getMajority, W, computeJuryScore } from "../lib/scoring";
import { isDIUser, hasActiveDeceptionPenalty, deceptionPenaltyRemaining } from "../lib/permissions";
import { recuseJuror } from "../lib/jury";
import { clearDraft } from "../lib/hooks";
import { SubHeadline, StatusPill, RatingInput, DeliberateLieCheckbox, LegalDisclaimer, AuditTrail, Empty, Loader } from "../components/ui";
import DIPanelContent from "../components/DIPanelContent";

const DRAFT_DEBOUNCE = 500;

export default function ReviewScreen({ user }) {
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

  const load = useCallback(async () => {
    const ww = await isWildWestMode();
    setWildWest(ww);
    // ── Load all data from relational API (single source of truth) ──
    const allSubs = (await sG(SK.SUBS)) || {};
    const allDisputes = (await sG(SK.DISPUTES)) || {};
    // Also merge review queue items (may include jury-specific data)
    try {
      const [queueRes, diRes] = await Promise.all([
        fetch("/api/reviews/queue"),
        fetch("/api/submissions/di-queue"),
      ]);
      if (queueRes.ok) {
        const queueData = await queueRes.json();
        if (queueData.submissions) {
          for (const relSub of queueData.submissions) { allSubs[relSub.id] = { ...allSubs[relSub.id], ...relSub }; }
        }
        if (queueData.disputes) {
          for (const relDisp of queueData.disputes) { allDisputes[relDisp.id] = { ...allDisputes[relDisp.id], ...relDisp }; }
        }
        if (queueData.myDisputes) {
          for (const relDisp of queueData.myDisputes) { allDisputes[relDisp.id] = { ...allDisputes[relDisp.id], ...relDisp }; }
        }
      }
      if (diRes.ok) {
        const diData = await diRes.json();
        if (diData.submissions) {
          for (const relSub of diData.submissions) { allSubs[relSub.id] = { ...allSubs[relSub.id], ...relSub }; }
        }
      }
    } catch (e) { console.warn("Failed to fetch review queue:", e); }
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
    setReviewingId(subId); load();
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
    setReviewingId(null); setVoteNote(""); setNewsRating(5); setFunRating(5); setLieChecked(false); setEditVotes({}); setVaultVotes({}); load();
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
  const igQ = wildWest
    ? all.filter(s => reviewStatuses.has(s.status) && myOrgs.has(s.orgId) && isEligibleReviewer(s) && !s.votes[user.username])
    : all.filter(s => s.status === "pending_review" && s.jurors.includes(user.username) && !s.votes[user.username]);
  const cgQ = all.filter(s => s.status === "cross_review" && s.crossGroupJurors.includes(user.username) && !s.crossGroupVotes[user.username]);
  const dQ = Object.values(disputes || {}).filter(d => d.status === "pending_review" && d.jurors.includes(user.username) && !d.votes[user.username]);
  // All disputes involving the current user (filed by them or against their submissions)
  const myDisputes = Object.values(disputes || {}).filter(d => d.disputedBy === user.username || d.originalSubmitter === user.username);
  const diQ = all.filter(s => s.status === "di_pending" && (s.diPartner === user.username || (s.isDI && s.diPartner === user.username)));
  // Show DI tab if user has any DI relationship, pending items, or pending link requests
  const pendingDILinks = Object.values(diLinkReqs).filter(r => r.partnerUsername === user.username && r.status === "pending");
  const hasDIPartnership = !!user.diPartner || all.some(s => s.isDI && s.diPartner === user.username) || diQ.length > 0 || pendingDILinks.length > 0;

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
    setReviewingId(null); setVoteNote(""); setLieChecked(false); load();
  };

  const renderItem = (sub, isCross) => {
    const seats = isCross ? (sub.crossGroupJurySize || sub.crossGroupJurors.length) : (sub.jurySeats || sub.jurors.length);
    const accepted = isCross ? (sub.crossGroupAcceptedJurors || []).length : (sub.acceptedJurors || []).length;
    const votesIn = isCross ? Object.keys(sub.crossGroupVotes || {}).length : Object.keys(sub.votes || {}).length;
    const needed = getMajority(seats);
    return (
    <div key={sub.id} className="ta-card" style={{ borderLeft: `4px solid ${isCross ? "#0D9488" : "#D97706"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}>{sub.orgName} · {sDate(sub.createdAt)}{sub.isDI ? " · 🤖 DI" : ""}</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#475569", background: "#F1F5F9", padding: "1px 5px", borderRadius: 8 }}>Seated {accepted}/{seats} · Voted {votesIn}/{seats} · need {needed}</span>
          <StatusPill status={sub.status} />
        </div>
      </div>
      <a href={sub.url} target="_blank" rel="noopener" style={{ fontSize: 10, color: "#0D9488", wordBreak: "break-all" }}>{sub.url}</a>
      {isCross && <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#0D9488", padding: "4px 8px", background: "#F0FDFA", borderRadius: 8, marginTop: 6 }}>🌐 Cross-group jury: {juryTotal} jurors · ≤{MAX_SHARED_ASSEMBLIES} shared non-GP memberships per pair · No members of {sub.orgName}</div>}
      <div style={{ margin: "8px 0", padding: 10, background: "#F9FAFB", borderRadius: 8 }}>
        <SubHeadline sub={sub} />
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
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>{sub.inlineEdits.length} In-Line Edit{sub.inlineEdits.length > 1 ? "s" : ""} — {reviewingId === sub.id ? "vote on each" : "line-by-line review"}</div>
          {sub.inlineEdits.map((e, i) => (
            <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < sub.inlineEdits.length - 1 ? "1px solid #E2E8F0" : "none" }}>
              <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 4 }}>
                <span style={{ textDecoration: "line-through", color: "#64748B" }}>{e.original}</span> → <span style={{ color: "#DC2626", fontWeight: 600 }}>{e.replacement}</span>
                {e.reasoning && <div style={{ fontSize: 12, color: "#475569", marginTop: 1 }}>↳ {e.reasoning}</div>}
              </div>
              {reviewingId === sub.id && (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button onClick={() => setEditVotes(v => ({ ...v, [i]: true }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: editVotes[i] === true ? "#059669" : "#CBD5E1", background: editVotes[i] === true ? "#ECFDF5" : "#fff", color: editVotes[i] === true ? "#059669" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✓ Approve Edit</button>
                  <button onClick={() => setEditVotes(v => ({ ...v, [i]: false }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: editVotes[i] === false ? "#DC2626" : "#CBD5E1", background: editVotes[i] === false ? "#FEF2F2" : "#fff", color: editVotes[i] === false ? "#DC2626" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✗ Reject Edit</button>
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
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 8 }}>📎 {sub.linkedVaultEntries.length} Linked Vault Entr{sub.linkedVaultEntries.length === 1 ? "y" : "ies"} — vote on each</div>
          {sub.linkedVaultEntries.map(e => {
            const tc = { correction: ["🏛", "#059669", "#ECFDF5"], argument: ["⚔️", "#0D9488", "#F0FDFA"], belief: ["🧭", "#7C3AED", "#F3E8F9"] }[e.type] || ["📎", "#475569", "#F1F5F9"];
            return <div key={e.id} style={{ marginBottom: 8, padding: "8px 10px", background: tc[2], border: `1px solid ${tc[1]}30`, borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: tc[1], fontWeight: 700 }}>{tc[0]} Existing {e.type}{e.survivalCount > 0 ? ` · survived ${e.survivalCount} review${e.survivalCount !== 1 ? "s" : ""}` : ""}</div>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: "#1E293B", marginBottom: reviewingId === sub.id ? 6 : 0 }}>{e.label}</div>
              {e.detail && <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>Source: {e.detail}</div>}
              {reviewingId === sub.id && (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button onClick={() => setVaultVotes(v => ({ ...v, [e.id]: true }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes[e.id] === true ? "#059669" : "#CBD5E1", background: vaultVotes[e.id] === true ? "#ECFDF5" : "#fff", color: vaultVotes[e.id] === true ? "#059669" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✓ Still Applies</button>
                  <button onClick={() => setVaultVotes(v => ({ ...v, [e.id]: false }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes[e.id] === false ? "#DC2626" : "#CBD5E1", background: vaultVotes[e.id] === false ? "#FEF2F2" : "#fff", color: vaultVotes[e.id] === false ? "#DC2626" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✗ No Longer Valid</button>
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
        <div style={{ marginTop: 12, padding: 14, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 10 }}>Headline Correction Verdict</div>
          <RatingInput label="How Newsworthy" value={newsRating} onChange={setNewsRating} rubric={NEWS_RUBRIC} />
          <RatingInput label="How Interesting" value={funRating} onChange={setFunRating} rubric={FUN_RUBRIC} />
          <div className="ta-field"><label>Review Note (permanent, public){voteNote.trim().length < 50 && <span style={{ color: "#DC2626", fontSize: 10, marginLeft: 6 }}>Min 50 chars required for rejections ({voteNote.trim().length}/50)</span>}</label><textarea value={voteNote} onChange={e => setVoteNote(e.target.value)} rows={2} placeholder="Explain your reasoning... (minimum 50 characters required for rejections)" /></div>
          <DeliberateLieCheckbox checked={lieChecked} onChange={setLieChecked} />
          <div style={{ position: "sticky", bottom: 0, background: "linear-gradient(transparent, #FFFFFF 8px)", paddingTop: 10, paddingBottom: 4, zIndex: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="ta-btn-primary" style={{ background: "#059669", flex: 1 }} onClick={() => castVote(sub.id, true, isCross)}>✓ Approve</button>
              <button className="ta-btn-primary" style={{ background: "#DC2626", flex: 1, opacity: voteNote.trim().length < 50 ? 0.6 : 1 }} onClick={() => castVote(sub.id, false, isCross)}>✗ Reject{voteNote.trim().length < 50 ? ` (${50 - voteNote.trim().length} more chars needed)` : ""}</button>
              <button className="ta-btn-ghost" onClick={() => setReviewingId(null)}>Cancel</button>
              <button className="ta-btn-primary" style={{ background: "#EA580C" }} onClick={async () => { const r = await recuseJuror(sub.id, user.username, isCross); if (r.success) { setReviewingId(null); load(); } }}>⚖ Recuse</button>
            </div>
            <LegalDisclaimer short />
          </div>
        </div>
      ) : (() => {
        const accepted = isCross ? (sub.crossGroupAcceptedJurors || []) : (sub.acceptedJurors || []);
        const seats = isCross ? (sub.crossGroupJurySize || sub.crossGroupJurors.length) : (sub.jurySeats || sub.jurors.length);
        const alreadyAccepted = accepted.includes(user.username);
        const startReview = () => {
          setReviewingId(sub.id); setVoteNote(""); setNewsRating(5); setFunRating(5); setLieChecked(false);
          const ev = {}; if (sub.inlineEdits) sub.inlineEdits.forEach((_, i) => { ev[i] = true; }); setEditVotes(ev);
          const vv = {}; if (sub.linkedVaultEntries) sub.linkedVaultEntries.forEach(e => { vv[e.id] = true; }); setVaultVotes(vv);
        };
        return (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#475569", marginBottom: 4 }}>{accepted.length}/{seats} seats filled · {seats - accepted.length} remaining</div>
            {!alreadyAccepted
              ? <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6, padding: "6px 8px", background: "#F9FAFB", border: "1px solid #E2E8F0", borderRadius: 8 }}>You'll have 6 hours to complete your review. If you're unable to finish, your seat will be opened to another juror.</div>
              : <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6, padding: "6px 8px", background: "#F9FAFB", border: "1px solid #E2E8F0", borderRadius: 8 }}>Your 6-hour review window is still active. Pick up where you left off.</div>
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
  ); };

  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Review Queue</h2>

      {/* What you're about to do */}
      <div style={{ padding: "14px 16px", background: "#fff", border: "1px solid #CBD5E1", borderLeft: "4px solid #CA8A04", borderRadius: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontFamily: "var(--serif)", fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>
          You're reviewing submissions from fellow citizens.
        </div>
        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
          Read the headline, the proposed correction, and the reasoning. Then vote to approve or reject. Your verdict is permanent and public — take your time, weigh the evidence.
        </div>
      </div>

      {hasActiveDeceptionPenalty(user) && <div style={{ padding: 10, background: "#EBD5D3", border: "1.5px solid #991B1B", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#991B1B", lineHeight: 1.6 }}>⚠ <strong>All voting rights suspended</strong> — Deception penalty active for {deceptionPenaltyRemaining(user)} more days. You cannot serve on juries during this period.</div>}
      {isDIUser(user) && <div style={{ padding: 10, background: "#EEF2FF", border: "1.5px solid #4F46E5", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#4F46E5", lineHeight: 1.6 }}>🤖 <strong>Digital Intelligences cannot serve on juries or vote.</strong> Humans review, DIs submit. Your partner @{user.diPartner} handles review duties.</div>}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid #E2E8F0" }}>
        {[["ingroup", "In-Group", igQ.length], ["crossgroup", "Cross-Group", cgQ.length], ["disputes", "Disputes", dQ.length], ["mydisputes", "My Disputes", myDisputes.length], ...(hasDIPartnership ? [["di", "🤖 DI Queue", diQ.length]] : [])].map(([k, l, c]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: tab === k ? "2px solid #2563EB" : "2px solid transparent", marginBottom: -2, fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", color: tab === k ? "#2563EB" : "#64748B", fontWeight: tab === k ? 700 : 400 }}>
            {l} {c > 0 && <span style={{ background: k === "disputes" ? "#EA580C" : k === "di" ? "#4F46E5" : "#DC2626", color: "#fff", borderRadius: "50%", padding: "1px 5px", fontSize: 10, marginLeft: 4 }}>{c}</span>}
          </button>
        ))}
      </div>
      {tab === "ingroup" && (igQ.length === 0 ? <Empty text="No in-group reviews waiting." /> : igQ.map(s => renderItem(s, false)))}
      {tab === "crossgroup" && (cgQ.length === 0 ? <Empty text="No cross-group reviews waiting." /> : <div><p style={{ fontSize: 13, color: "#475569", marginBottom: 12, lineHeight: 1.6 }}>These corrections were approved by another Assembly and now face cross-group review. Jury size scales with the number of qualifying Assemblies in the ecosystem. No two jurors share more than 2 non-GP Assembly memberships — your perspective is independent by design.</p>{cgQ.map(s => renderItem(s, true))}</div>)}
      {tab === "disputes" && (dQ.length === 0 ? <Empty text="No disputes awaiting your review." /> : <div>
        <p style={{ fontSize: 13, color: "#475569", marginBottom: 12, lineHeight: 1.6 }}>Intra-Assembly disputes. A member is challenging another member's submission. Upholding the dispute means the submission was wrong. Dismissing means the original stands. Winners gain significant reputation.</p>
        {dQ.map(d => (
          <div key={d.id} className="ta-card" style={{ borderLeft: "4px solid #EA580C" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}>⚖ {anonName(d.disputedBy, d.anonMap, d.resolvedAt)} vs {anonName(d.originalSubmitter, d.anonMap, d.resolvedAt)} · {d.orgName} · {sDate(d.createdAt)}</span>
              <span style={{ fontSize: 10, padding: "2px 7px", background: "#FFF7ED", color: "#EA580C", borderRadius: 8, fontFamily: "var(--mono)", textTransform: "uppercase", fontWeight: 700 }}>Dispute</span>
            </div>
            <div style={{ padding: 10, background: "#F9FAFB", borderRadius: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#475569", marginBottom: 3 }}>ORIGINAL SUBMISSION BY {anonName(d.originalSubmitter, d.anonMap, d.resolvedAt)}</div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600, color: "#0F172A" }}>{d.submissionHeadline}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 6, lineHeight: 1.8 }}>{d.submissionReasoning}</div>
            </div>
            <div style={{ padding: 12, background: "#FFF7ED", border: "1px solid #EA580C", borderRadius: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#EA580C", marginBottom: 4 }}>DISPUTE BY {anonName(d.disputedBy, d.anonMap, d.resolvedAt)}</div>
              <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.8 }}>{d.reasoning}</div>
              {d.evidence && d.evidence.length > 0 && <div style={{ marginTop: 6 }}>{d.evidence.map((e, i) => <div key={i} style={{ fontSize: 12 }}><a href={e.url} target="_blank" rel="noopener" style={{ color: "#0D9488" }}>{e.url}</a>{e.explanation && <div style={{ color: "#475569" }}>↳ {e.explanation}</div>}</div>)}</div>}
            </div>
            {reviewingId === d.id ? (
              <div style={{ padding: 14, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8 }}>
                <div style={{ padding: 8, background: "#FFFBEB", border: "1px solid #CA8A04", borderRadius: 8, marginBottom: 10, fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
                  <strong style={{ color: "#CA8A04" }}>⚖ Dispute Stakes:</strong> If upheld, the disputer earns a <strong>+{W.disputeWin} point reward</strong> for catching the error. If dismissed, the disputer takes drag — same as being wrong. The original submitter faces the inverse. Your vote here has significant consequences.
                </div>
                <div className="ta-field"><label>Review Note (permanent, public)</label><textarea value={voteNote} onChange={e => setVoteNote(e.target.value)} rows={2} /></div>
                <DeliberateLieCheckbox checked={lieChecked} onChange={setLieChecked} />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="ta-btn-primary" style={{ background: "#EA580C" }} onClick={() => castDisputeVote(d.id, true)}>⚖ Uphold Dispute</button>
                  <button className="ta-btn-primary" style={{ background: "#059669" }} onClick={() => castDisputeVote(d.id, false)}>✓ Dismiss (Original Stands)</button>
                  <button className="ta-btn-ghost" onClick={() => setReviewingId(null)}>Cancel</button>
                </div>
              </div>
            ) : <button className="ta-btn-secondary" style={{ marginTop: 6 }} onClick={() => { setReviewingId(d.id); setVoteNote(""); setLieChecked(false); }}>Review Dispute</button>}
            <AuditTrail entries={d.auditTrail} />
          </div>
        ))}
      </div>)}

      {/* My Disputes Tab — shows all disputes filed by or against the current user */}
      {tab === "mydisputes" && (myDisputes.length === 0 ? <Empty text="No disputes involve you. Disputes you file or disputes against your submissions will appear here." /> : <div>
        <p style={{ fontSize: 13, color: "#475569", marginBottom: 12, lineHeight: 1.6 }}>All disputes involving your submissions — either filed by you or filed against your work. Track the status and outcome of each dispute.</p>
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
            <div key={d.id} className="ta-card" style={{ borderLeft: `4px solid ${statusColor}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}>
                  {isDisputer ? "⚖ You disputed" : "⚖ Disputed against you"} · {d.orgName} · {sDate(d.createdAt)}
                </span>
                <span style={{ fontSize: 10, padding: "2px 7px", background: d.status === "pending_review" ? "#FFFBEB" : d.status === "upheld" ? "#FEF2F2" : "#ECFDF5", color: statusColor, borderRadius: 8, fontFamily: "var(--mono)", textTransform: "uppercase", fontWeight: 700 }}>{statusLabel}</span>
              </div>
              <div style={{ padding: 10, background: "#F9FAFB", borderRadius: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#475569", marginBottom: 3 }}>ORIGINAL SUBMISSION</div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600, color: "#0F172A" }}>{d.submissionHeadline}</div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 4, lineHeight: 1.6 }}>{d.submissionReasoning}</div>
              </div>
              <div style={{ padding: 10, background: "#FFF7ED", border: "1px solid #EA580C40", borderRadius: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#EA580C", marginBottom: 3 }}>DISPUTE REASONING</div>
                <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.6 }}>{d.reasoning}</div>
                {d.evidence && d.evidence.length > 0 && <div style={{ marginTop: 6 }}>{d.evidence.map((e, i) => <div key={i} style={{ fontSize: 12 }}><a href={e.url} target="_blank" rel="noopener" style={{ color: "#0D9488" }}>{e.url}</a>{e.explanation && <div style={{ color: "#475569" }}>↳ {e.explanation}</div>}</div>)}</div>}
              </div>
              {d.status !== "pending_review" && <div style={{ padding: 10, background: d.status === "upheld" ? "#FEF2F2" : "#ECFDF5", borderRadius: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: statusColor, marginBottom: 3 }}>OUTCOME</div>
                <div style={{ fontSize: 13, color: "#1E293B" }}>{d.status === "upheld" ? "The dispute was upheld — the original submission was found to be wrong." : "The dispute was dismissed — the original submission stands."}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Votes: {upheldCount} uphold / {rejectedCount} dismiss</div>
              </div>}
              {d.status === "pending_review" && <div style={{ fontSize: 11, color: "#D97706" }}>Jury review in progress — {voteCount}/{d.jurors.length} votes cast</div>}
              {jurorNotes.length > 0 && <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 4 }}>Juror Notes</div>
                {jurorNotes.map((jn, i) => <div key={i} style={{ fontSize: 12, padding: "6px 8px", marginBottom: 4, background: jn.approve ? "#ECFDF5" : "#FEF2F2", borderRadius: 6, borderLeft: `3px solid ${jn.approve ? "#059669" : "#DC2626"}`, lineHeight: 1.5 }}>
                  <span style={{ fontSize: 10, color: jn.approve ? "#059669" : "#DC2626", fontFamily: "var(--mono)", fontWeight: 700 }}>{jn.approve ? "UPHOLD" : "DISMISS"}</span> — {jn.note}
                </div>)}
              </div>}
              <AuditTrail entries={d.auditTrail} />
            </div>
          );
        })}
      </div>)}

      {/* DI Management Tab */}
      {tab === "di" && <DIPanelContent user={user} subs={subs} onReload={load} />}
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SK, MAX_ORGS, ADMIN_USERNAME, CROSS_GROUP_DECEPTION_MULT } from "../lib/constants";
import { sDate } from "../lib/utils";
import { sG } from "../lib/storage";
import { W, computeAssemblyReputation, getMajority } from "../lib/scoring";
import { checkEnrollment } from "../lib/permissions";
import { getJurySize, getSuperJurySize, getConcessionRecovery } from "../lib/jury";
import { UsernameLink, SubHeadline, StatusPill, InviteCTA, Empty, Loader } from "../components/ui";
import AssemblyGuide from "../components/AssemblyGuide";
import { queryKeys } from "../lib/queryKeys";

async function proposeConcession(orgId, proposerUsername, subId, reasoning) {
  try {
    const res = await fetch("/api/concessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: subId, reasoning: reasoning.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: data.error || "Failed to create concession" };
    }
    const data = await res.json();
    return data.data || data;
  } catch (e) {
    return { error: "Network error creating concession" };
  }
}

async function voteConcession(concessionId, voterUsername, approve) {
  try {
    const res = await fetch(`/api/concessions/${concessionId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: data.error || "Failed to vote on concession" };
    }
    const data = await res.json();
    return data.data || data;
  } catch (e) {
    return { error: "Network error voting on concession" };
  }
}

export default function OrgScreen({ user, onUpdate, onViewCitizen }) {
  const qc = useQueryClient();
  const invalidateOrgs = () => { qc.invalidateQueries({ queryKey: queryKeys.orgs }); qc.invalidateQueries({ queryKey: queryKeys.users }); qc.invalidateQueries({ queryKey: queryKeys.applications }); };
  const [orgs, setOrgs] = useState(null); const [subs, setSubs] = useState(null); const [apps, setApps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false); const [newOrg, setNewOrg] = useState({ name: "", description: "", charter: "" });
  const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const [search, setSearch] = useState(""); const [sortBy, setSortBy] = useState("activity");
  const [showGuide, setShowGuide] = useState(false);
  const [viewingOrg, setViewingOrg] = useState(null); // Assembly detail/profile view
  const [concessions, setConcessions] = useState(null);
  const [concessionReason, setConcessionReason] = useState("");

  const load = useCallback(async () => {
    const [o, s, a, c] = await Promise.all([sG(SK.ORGS), sG(SK.SUBS), sG(SK.APPS), sG("ta-concessions")]);
    setOrgs(o || {}); setSubs(s || {}); setApps(a || {}); setConcessions(c || {}); setLoading(false);
    invalidateOrgs();
  }, []);
  useEffect(() => { load(); }, [load]);

  const orgStats = useMemo(() => {
    if (!orgs || !subs) return {};
    const st = {};
    for (const [oid, org] of Object.entries(orgs)) {
      const os = Object.values(subs).filter(s => s.orgId === oid);
      const approved = os.filter(s => ["approved", "consensus", "cross_review"].includes(s.status)).length;
      const consensus = os.filter(s => s.status === "consensus").length;
      const lastAct = os.length > 0 ? Math.max(...os.map(s => new Date(s.resolvedAt || s.createdAt).getTime())) : new Date(org.createdAt).getTime();
      const dsa = Math.max(1, (Date.now() - lastAct) / 86400000);
      st[oid] = { total: os.length, approved, consensus, activityScore: org.members.length * 2 + approved * 5 + consensus * 15 + 10 / dsa, juryReady: org.members.length >= 5 };
    }
    return st;
  }, [orgs, subs]);

  const myOrgIds = user.orgIds || (user.orgId ? [user.orgId] : []);
  const isMember = (oid) => myOrgIds.includes(oid);

  const updateUser = async (updates) => {
    // Update profile via relational API
    try {
      await fetch(`/api/users/${user.username}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch (e) { console.warn("Failed to update user profile:", e); }
    onUpdate({ ...user, ...updates });
  };

  const createOrg = async () => {
    setError(""); if (!newOrg.name.trim()) return setError("Name required."); if (!newOrg.description.trim()) return setError("Description required.");
    if (myOrgIds.length >= MAX_ORGS) return setError(`You can join up to ${MAX_ORGS} assemblies.`);
    // ── Create assembly via relational API (single source of truth) ──
    try {
      const res = await fetch("/api/orgs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newOrg.name.trim(), description: newOrg.description.trim(), charter: newOrg.charter.trim() }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || "Failed to create assembly"); return; }
      const data = await res.json();
      const id = data.data?.id || data.id;
      const newIds = [...myOrgIds, id];
      await updateUser({ orgId: id, orgIds: newIds });
      // Refresh org list from server
      const orgsRes = await fetch("/api/orgs"); if (orgsRes.ok) { const orgsData = await orgsRes.json(); const orgMap = {}; for (const o of (orgsData.organizations || orgsData.data || [])) { orgMap[o.id] = o; } setOrgs(orgMap); }
    } catch (e) { setError("Network error creating assembly"); return; }
    setCreating(false); setNewOrg({ name: "", description: "", charter: "" });
  };

  const [joinReason, setJoinReason] = useState(""); const [joinLink, setJoinLink] = useState("");
  const [applyingTo, setApplyingTo] = useState(null);

  const submitApplication = async (oid) => {
    const o = orgs[oid]; if (!o) return;
    setError(""); setSuccess("");
    if (isMember(oid)) return setError("Already a member.");
    if (myOrgIds.length >= MAX_ORGS) return setError(`You can join up to ${MAX_ORGS} assemblies. Leave one first.`);
    if (!joinReason.trim()) return setError("Please explain why you want to join.");
    if (joinLink.trim() && !/^https?:\/\/.+\..+/.test(joinLink.trim())) return setError("Link must start with http:// or https://");

    // ── Submit application via relational API (single source of truth) ──
    const enr = checkEnrollment(o);
    try {
      const res = await fetch(`/api/orgs/${oid}/applications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: joinReason.trim(), link: joinLink.trim() || null }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || "Failed to submit application"); return; }
    } catch (e) { setError("Network error submitting application"); return; }
    setApplyingTo(null); setJoinReason(""); setJoinLink("");
    if (enr.mode === "tribal") {
      setSuccess(`Application submitted to ${o.name}. The founder must approve your request.`);
    } else {
      setSuccess(`Application submitted to ${o.name}. ${enr.sponsors} qualified sponsor${enr.sponsors > 1 ? "s" : ""} must vouch for you.`);
    }
  };

  const joinOrg = async (oid) => {
    const o = orgs[oid]; if (!o) return;
    setError(""); setSuccess("");
    if (isMember(oid)) return setError("Already a member.");
    if (myOrgIds.length >= MAX_ORGS) return setError(`You can join up to ${MAX_ORGS} assemblies. Leave one first.`);
    const enr = checkEnrollment(o);

    if (enr.mode === "tribal" || enr.mode === "sponsor") {
      // Show application form
      setApplyingTo(oid);
      return;
    }

    // ── Open enrollment — join via relational API (single source of truth) ──
    // The server handles membership, jury assignment for pending_jury submissions, and audit logging.
    try {
      const res = await fetch(`/api/orgs/${oid}/join`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || "Failed to join assembly"); return; }
    } catch (e) { setError("Network error joining assembly"); return; }
    const newIds = [...myOrgIds, oid];
    await updateUser({ orgId: oid, orgIds: newIds });
    // Refresh org list from server
    try {
      const orgsRes = await fetch("/api/orgs"); if (orgsRes.ok) { const orgsData = await orgsRes.json(); const orgMap = {}; for (const o of (orgsData.organizations || orgsData.data || [])) { orgMap[o.id] = o; } setOrgs(orgMap); }
    } catch (e) { /* will refresh on next load */ }
  };

  const leaveOrg = async (oid) => {
    setError("");
    // ── Leave assembly via relational API (single source of truth) ──
    try {
      const res = await fetch(`/api/orgs/${oid}/leave`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || "Failed to leave assembly"); return; }
    } catch (e) { setError("Network error leaving assembly"); return; }
    const newIds = myOrgIds.filter(id => id !== oid);
    const newActive = user.orgId === oid ? newIds[0] : user.orgId;
    await updateUser({ orgId: newActive, orgIds: newIds });
    // Refresh org list from server
    try {
      const orgsRes = await fetch("/api/orgs"); if (orgsRes.ok) { const orgsData = await orgsRes.json(); const orgMap = {}; for (const o of (orgsData.organizations || orgsData.data || [])) { orgMap[o.id] = o; } setOrgs(orgMap); }
    } catch (e) { /* will refresh on next load */ }
  };

  const followedOrgIds = user.followedOrgIds || [];
  const isFollowing = (oid) => followedOrgIds.includes(oid);
  const followOrg = async (oid) => {
    try {
      const newFollowed = [...followedOrgIds, oid];
      await updateUser({ followedOrgIds: newFollowed });
      setSuccess(`Following assembly.`);
      setTimeout(() => setSuccess(""), 2000);
    } catch (e) { setError("Failed to follow assembly. Please try again."); }
  };
  const unfollowOrg = async (oid) => {
    try {
      const newFollowed = followedOrgIds.filter(id => id !== oid);
      await updateUser({ followedOrgIds: newFollowed });
    } catch (e) { setError("Failed to unfollow. Please try again."); }
  };

  const switchActive = async (oid) => {
    if (!isMember(oid)) return;
    setError("");
    try {
      const res = await fetch(`/api/users/${user.username}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: oid }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to set active assembly. Please try again.");
        return;
      }
    } catch (e) {
      setError("Network error setting active assembly. Please try again.");
      return;
    }
    onUpdate({ ...user, orgId: oid });
    setSuccess("Active assembly updated.");
    setTimeout(() => setSuccess(""), 2000);
  };

  const sponsorApp = async (appId) => {
    const allApps = apps;
    const app = allApps[appId]; if (!app || app.status !== "pending") return;
    setError("");

    // Use relational API — server handles membership, audit, and validation
    try {
      const res = await fetch(`/api/orgs/${app.orgId}/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to approve application");
        return;
      }
    } catch (e) { setError("Network error approving application"); return; }
    // Refresh data from server
    load();
  };

  const rejectApp = async (appId) => {
    const allApps = apps;
    const app = allApps[appId]; if (!app || app.status !== "pending") return;

    // Use relational API — server handles status update and audit
    try {
      const res = await fetch(`/api/orgs/${app.orgId}/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to reject application");
        return;
      }
    } catch (e) { setError("Network error rejecting application"); return; }
    load();
  };

  if (loading) return <Loader />;

  // ── Assembly Profile View ──
  if (viewingOrg && orgs[viewingOrg]) {
    const vo = orgs[viewingOrg];
    const vStats = orgStats[viewingOrg] || {};
    const rep = computeAssemblyReputation(vo, subs);
    const voSubs = Object.values(subs || {}).filter(s => s.orgId === viewingOrg);
    const crossRejected = voSubs.filter(s => s.status === "consensus_rejected");
    const enrollment = checkEnrollment(vo);
    const myConcessions = Object.values(concessions || {}).filter(c => c.orgId === viewingOrg);
    const pendingConcessions = myConcessions.filter(c => c.status === "pending_review");
    const canPropose = isMember(viewingOrg);

    const handleProposeConcession = async (subId) => {
      if (!concessionReason.trim()) return setError("Reasoning required for concession proposal.");
      const result = await proposeConcession(viewingOrg, user.username, subId, concessionReason);
      if (result.error) return setError(result.error);
      setConcessionReason(""); setSuccess("Concession proposed. Super jury will decide."); load();
    };

    const handleConcessionVote = async (cId, approve) => {
      const result = await voteConcession(cId, user.username, approve);
      if (result.error) return alert(result.error);
      load();
    };

    return (
      <div>
        <div className="ta-section-rule" />
        <button className="ta-btn-ghost" onClick={() => setViewingOrg(null)} style={{ marginBottom: 10 }}>← Back to Assemblies</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 className="ta-section-head" style={{ margin: 0 }}>{vo.name}</h2>
          {!isMember(viewingOrg) && (
            isFollowing(viewingOrg)
              ? <button className="ta-btn-secondary" style={{ fontSize: 10, padding: "4px 12px" }} onClick={() => unfollowOrg(viewingOrg)}>Following ✓</button>
              : <button className="ta-btn-secondary" style={{ fontSize: 10, padding: "4px 12px", borderColor: "#0D9488", color: "#0D9488" }} onClick={() => followOrg(viewingOrg)}>Follow</button>
          )}
        </div>
        {error && <div className="ta-error">{error}</div>}
        {success && <div className="ta-success">{success}</div>}

        {/* Assembly Identity */}
        <div className="ta-card" style={{ borderLeft: `4px solid ${vo.isGeneralPublic ? "#0D9488" : "#0F172A"}` }}>
          <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.6, marginBottom: 8 }}>{vo.description}</div>
          {vo.charter && <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic", paddingLeft: 10, borderLeft: "2px solid #CBD5E1" }}>{vo.charter}</div>}
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B", marginTop: 8 }}>
            Founded by @{vo.createdBy} · {sDate(vo.createdAt)} · {vo.members.length} members · {enrollment.label} · Jury: {getJurySize(vo.members.length)} · Super jury: {getSuperJurySize(vo.members.length)}
          </div>
        </div>

        {/* Cross-Group Reputation */}
        <div className="ta-card" style={{ borderLeft: "4px solid #7C3AED" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7C3AED", marginBottom: 10, fontWeight: 700 }}>Cross-Group Reputation</div>
          {!rep.confidence ? (
            <div style={{ fontSize: 13, color: "#475569" }}>
              {rep.total === 0 ? "No cross-group reviews completed yet." : `${rep.total}/20 cross-group reviews completed. Trust Score displays at 20.`}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
              {[["#7C3AED", rep.trustScore + "%", "Trust Score"], ["#059669", rep.survivals + "/" + rep.total, "Survivals"], ["#991B1B", rep.deceptionFindings, "Deception Findings"], ["#CA8A04", rep.cassandraIndex, "Dispute Index"]].map(([c, v, l], i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 700, color: c }}>{v}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748B" }}>{l}</div>
                </div>
              ))}
            </div>
          )}
          {rep.deceptionFindings > 0 && <div style={{ padding: 8, background: "#EBD5D3", border: "1px solid #991B1B", borderRadius: 8, marginTop: 8, fontSize: 12, color: "#991B1B", fontWeight: 600 }}>
            ⚠ {rep.deceptionFindings} cross-group deception finding{rep.deceptionFindings > 1 ? "s" : ""} — external jurors found content this Assembly approved to be deliberately misleading ({CROSS_GROUP_DECEPTION_MULT}× penalty each).
          </div>}
          {rep.concessions > 0 && <div style={{ padding: 8, background: "#F5F3FF", border: "1px solid #9B7DB8", borderRadius: 8, marginTop: 8, fontSize: 12, color: "#7C3AED" }}>
            This Assembly has conceded {rep.concessions} time{rep.concessions > 1 ? "s" : ""} — acknowledging when cross-group review found them wrong.
          </div>}
          <div style={{ marginTop: 10, padding: 10, background: "#F1F5F9", borderRadius: 8, fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
            <strong>How this works:</strong> Trust Score measures what percentage of this Assembly's approved corrections also survive cross-group review, weighted by combined jury rigor (internal jury size + cross-group jury size). Internal approval rates are self-grading — cross-group survival is the only fair measure. Score requires 20+ cross-group reviews for confidence. No time decay — the permanent record is the reputation.
          </div>
        </div>

        {/* Concessions */}
        {canPropose && <div className="ta-card" style={{ borderLeft: "4px solid #7C3AED" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7C3AED", marginBottom: 8, fontWeight: 700 }}>⚖ Concessions</div>
          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
            When a cross-group rejection occurs, any member can propose the Assembly concede. A <strong>super jury of {getSuperJurySize(vo.members.length)}</strong> decides. One concession per week gets full recovery — no reputation loss. Additional concessions in the same week recover 90%. After the first week, recovery decays (90% at 2 weeks, 50% at 1 month, down to 5% after 3 months). Individual dispute winners keep their full {W.disputeWin}× reward regardless — the Assembly does not share in that reward.
          </div>
          {/* Pending concession votes I'm on */}
          {pendingConcessions.filter(c => c.jurors.includes(user.username) && !c.votes[user.username]).map(c => {
            const cSub = subs[c.subId];
            return (
              <div key={c.id} className="ta-card" style={{ borderLeft: "4px solid #EA580C", marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#EA580C", marginBottom: 4, fontWeight: 700 }}>SUPER JURY CONCESSION VOTE</div>
                <div style={{ fontSize: 12, marginBottom: 4 }}><strong>@{c.proposedBy}</strong> proposes the Assembly concede on:</div>
                {cSub && <div style={{ padding: 8, background: "#F9FAFB", borderRadius: 8, marginBottom: 6 }}>
                  <SubHeadline sub={cSub} size={12} />
                  <div style={{ fontFamily: "var(--serif)", color: "#DC2626", fontWeight: 700, fontSize: 14 }}>{cSub.replacement}</div>
                </div>}
                <div style={{ fontSize: 12, color: "#1E293B", marginBottom: 6 }}>{c.reasoning}</div>
                <div style={{ fontSize: 10, color: "#D97706", fontFamily: "var(--mono)", marginBottom: 6 }}>Recovery if passed now: {Math.round(getConcessionRecovery(c.rejectedAt, 0) * 100)}% max (first this week — additional concessions in same week: 90%). Clock is ticking.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="ta-btn-primary" style={{ background: "#7C3AED" }} onClick={() => handleConcessionVote(c.id, true)}>✓ Concede</button>
                  <button className="ta-btn-primary" style={{ background: "#DC2626" }} onClick={() => handleConcessionVote(c.id, false)}>✗ Hold Position</button>
                </div>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B", marginTop: 4 }}>{Object.keys(c.votes).length}/{c.jurors.length} votes · Needs {getMajority(c.jurors.length)}</div>
              </div>
            );
          })}
          {/* Cross-group rejections eligible for concession */}
          {crossRejected.length > 0 && <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#475569", marginBottom: 6 }}>Cross-Group Rejections ({crossRejected.length})</div>
            {crossRejected.slice(0, 5).map(s => {
              const alreadyConceded = myConcessions.some(c => c.subId === s.id && c.status !== "rejected");
              const recovery = getConcessionRecovery(s.resolvedAt);
              return (
                <div key={s.id} style={{ padding: 8, background: "#F9FAFB", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 12 }}><SubHeadline sub={s} size={12} /></div>
                  <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B", marginTop: 3 }}>by {s.submittedBy === ADMIN_USERNAME ? "👑 " : ""}@{s.submittedBy} · Rejected {sDate(s.resolvedAt)} · Recovery: {Math.round(recovery * 100)}%</div>
                  {alreadyConceded ? <div style={{ fontSize: 10, color: "#7C3AED", fontFamily: "var(--mono)", marginTop: 3 }}>Concession proposed</div> : (
                    <div style={{ marginTop: 6 }}>
                      <textarea value={concessionReason} onChange={e => setConcessionReason(e.target.value)} placeholder="Why should the Assembly concede?" rows={2} style={{ width: "100%", padding: 6, border: "1px solid #CBD5E1", fontSize: 12, borderRadius: 8, boxSizing: "border-box", fontFamily: "var(--body)" }} />
                      <button className="ta-btn-secondary" style={{ marginTop: 4, fontSize: 10 }} onClick={() => handleProposeConcession(s.id)}>Propose Concession</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>}
          {/* Past concessions */}
          {myConcessions.filter(c => c.status !== "pending_review").length > 0 && <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#475569", marginBottom: 4 }}>Concession History</div>
            {myConcessions.filter(c => c.status !== "pending_review").map(c => (
              <div key={c.id} style={{ padding: 6, fontSize: 12, color: c.status === "approved" ? "#7C3AED" : "#64748B", borderLeft: `3px solid ${c.status === "approved" ? "#7C3AED" : "#CBD5E1"}`, paddingLeft: 8, marginBottom: 4 }}>
                {c.status === "approved" ? `✓ Conceded (${Math.round(c.recoveryAtResolution * 100)}% recovery)` : "✗ Held position"} — {sDate(c.resolvedAt)}
              </div>
            ))}
          </div>}
        </div>}

        {/* Activity Stats */}
        <div className="ta-card">
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 8 }}>Activity</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
            {[["#0F172A", vStats.total || 0, "Submissions"], ["#059669", vStats.approved || 0, "Approved"], ["#7C3AED", vStats.consensus || 0, "Consensus"], ["#0D9488", vo.members.length, "Members"]].map(([c, v, l], i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, color: c }}>{v}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748B" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Submissions */}
        {(() => {
          const resolvedSubs = voSubs
            .filter(s => ["approved", "consensus", "rejected", "consensus_rejected", "disputed"].includes(s.status))
            .sort((a, b) => new Date(b.resolvedAt || b.createdAt) - new Date(a.resolvedAt || a.createdAt));
          const displaySubs = resolvedSubs.slice(0, 10);
          return displaySubs.length > 0 && (
            <div className="ta-card">
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 8 }}>Recent Submissions ({resolvedSubs.length} total)</div>
              {displaySubs.map(s => {
                const approveCount = Object.values(s.votes || {}).filter(v => v.approve).length;
                const rejectCount = Object.values(s.votes || {}).filter(v => !v.approve).length;
                return (
                  <div key={s.id} style={{ padding: "8px 10px", marginBottom: 6, background: "#F9FAFB", border: "1px solid #E2E8F0", borderRadius: 8, borderLeft: `3px solid ${s.status === "approved" || s.status === "consensus" ? "#059669" : s.status === "rejected" || s.status === "consensus_rejected" ? "#DC2626" : "#D97706"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}>
                        <UsernameLink username={s.submittedBy} onClick={onViewCitizen} /> · {sDate(s.resolvedAt || s.createdAt)}
                        {s.isDI ? " · 🤖 DI" : ""}{s.trustedSkip ? " · 🛡" : ""}
                      </span>
                      <StatusPill status={s.status} />
                    </div>
                    <SubHeadline sub={s} size={12} />
                    <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B", marginTop: 4 }}>
                      {approveCount + rejectCount > 0 && <span>{approveCount}↑ {rejectCount}↓</span>}
                      {s.evidence && s.evidence.length > 0 && <span> · 📎 {s.evidence.length}</span>}
                      {s.inlineEdits && s.inlineEdits.length > 0 && <span> · {s.inlineEdits.length} edits</span>}
                    </div>
                  </div>
                );
              })}
              {resolvedSubs.length > 10 && (
                <div style={{ textAlign: "center", marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "#64748B" }}>Showing 10 of {resolvedSubs.length} submissions</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Members */}
        <div className="ta-card">
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 8 }}>Members ({vo.members.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {vo.members.slice(0, 50).map(m => <span key={m} style={{ fontSize: 10, fontFamily: "var(--mono)", padding: "2px 6px", background: "#F1F5F9", borderRadius: 8, color: "#1E293B" }}><UsernameLink username={m} onClick={onViewCitizen} /></span>)}
            {vo.members.length > 50 && <span style={{ fontSize: 10, color: "#64748B" }}>+{vo.members.length - 50} more</span>}
          </div>
        </div>
      </div>
    );
  }

  const activeOrg = user.orgId ? orgs[user.orgId] : null;
  const myOrgs = myOrgIds.map(id => orgs[id]).filter(Boolean);
  const orgList = Object.values(orgs || {}).filter(o => {
    if (o.isGeneralPublic) return false;
    if (isMember(o.id)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase(); return o.name.toLowerCase().includes(q) || (o.description || "").toLowerCase().includes(q);
  }).sort((a, b) => { const sa = orgStats[a.id] || { activityScore: 0 }; const sb = orgStats[b.id] || { activityScore: 0 }; if (sortBy === "members") return b.members.length - a.members.length; if (sortBy === "newest") return new Date(b.createdAt) - new Date(a.createdAt); if (sortBy === "az") return a.name.localeCompare(b.name); return sb.activityScore - sa.activityScore; });
  const sorts = [["activity", "Active"], ["members", "Members"], ["newest", "New"], ["az", "A–Z"]];

  // Pending apps for assemblies I'm in — filtered by role:
  // Tribal mode: only the founder sees these
  // Sponsor mode: only members who could potentially sponsor see these
  const pendingApps = Object.values(apps || {}).filter(a => {
    if (a.status !== "pending" || !isMember(a.orgId) || a.userId === user.username) return false;
    const org = orgs[a.orgId];
    if (!org) return false;
    const founders = org.founders || [org.createdBy];
    if (a.mode === "tribal") {
      // Only the founder sees tribal admission requests
      return founders.includes(user.username);
    }
    // Sponsor mode: show to members who have at least submitted or reviewed in this assembly
    // (founders always see them too)
    if (founders.includes(user.username)) return true;
    const orgSubs = Object.values(subs || {}).filter(s => s.orgId === a.orgId);
    const hasSubmitted = orgSubs.some(s => s.submittedBy === user.username);
    const hasJudged = orgSubs.some(s => (s.votes && s.votes[user.username]) || (s.crossGroupVotes && s.crossGroupVotes[user.username]));
    return hasSubmitted || hasJudged;
  });
  // My pending apps
  const myPendingApps = Object.values(apps || {}).filter(a => a.status === "pending" && a.userId === user.username);

  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Trust Assemblies</h2>

      <button onClick={() => setShowGuide(g => !g)} style={{ background: showGuide ? "#2563EB" : "#F9FAFB", color: showGuide ? "#fff" : "#1E293B", border: "1.5px solid #CBD5E1", padding: "6px 14px", fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer", borderRadius: 8, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {showGuide ? "✕ Hide Guide" : "📖 How Assemblies Work"}
      </button>

      {showGuide && <AssemblyGuide />}
      {error && <div className="ta-error">{error}</div>}
      {success && <div className="ta-success">{success}</div>}

      {/* My Assemblies */}
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 8 }}>Your Assemblies ({myOrgs.length}/{MAX_ORGS})</div>
      {myOrgs.map(o => {
        const isActive = user.orgId === o.id;
        const isGP = !!o.isGeneralPublic;
        const st = orgStats[o.id] || {};
        return (
          <div key={o.id} className="ta-card" style={{ borderLeft: `4px solid ${isActive ? "#059669" : isGP ? "#0D9488" : "#CBD5E1"}`, opacity: isActive ? 1 : 0.85 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                  <strong style={{ fontSize: 15, fontFamily: "var(--serif)", cursor: "pointer", textDecoration: "underline", textDecorationColor: "#CBD5E1" }} onClick={() => setViewingOrg(o.id)}>{o.name}</strong>
                  {isActive && <span style={{ fontSize: 8, padding: "2px 6px", background: "#ECFDF5", color: "#059669", borderRadius: 8, fontFamily: "var(--mono)", fontWeight: 700 }}>★ ACTIVE</span>}
                  {isGP && <span style={{ fontSize: 8, padding: "2px 6px", background: "#F0FDFA", color: "#0D9488", borderRadius: 8, fontFamily: "var(--mono)", fontWeight: 700 }}>🏛 HOME</span>}
                </div>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B" }}>{o.members.length} members · {(() => { const enr = checkEnrollment(o); const founders = o.founders || [o.createdBy]; const isFounder = founders.includes(user.username); if (enr.mode === "tribal" && isFounder) return "You are the founder"; return enr.label; })()}{st.total > 0 ? ` · ${st.total} subs` : ""}{(() => { const r = computeAssemblyReputation(o, subs); return r.confidence ? ` · Trust: ${r.trustScore}%` : r.total > 0 ? ` · ${r.total}/20 reviews` : ""; })()}</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {!isActive && <button className="ta-btn-secondary" style={{ fontSize: 10, padding: "4px 10px" }} onClick={() => switchActive(o.id)}>Set Active</button>}
                {!isGP && <button className="ta-btn-ghost" style={{ color: "#DC2626", fontSize: 10, padding: "4px 8px" }} onClick={() => { if (window.confirm(`Leave "${o.name}"? You'll need to re-apply to rejoin.`)) leaveOrg(o.id); }}>Leave</button>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Following */}
      {(() => {
        const followedOrgs = followedOrgIds.map(id => orgs[id]).filter(Boolean).filter(o => !isMember(o.id));
        if (followedOrgs.length === 0) return null;
        return <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#0D9488", marginBottom: 8 }}>Following ({followedOrgs.length})</div>
          {followedOrgs.map(o => {
            const st = orgStats[o.id] || {};
            return (
              <div key={o.id} className="ta-card" style={{ borderLeft: "4px solid #94A3B8", opacity: 0.85 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 15, fontFamily: "var(--serif)", cursor: "pointer", textDecoration: "underline", textDecorationColor: "#CBD5E1" }} onClick={() => setViewingOrg(o.id)}>{o.name}</strong>
                    <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B" }}>{o.members.length} members{st.total > 0 ? ` · ${st.total} subs` : ""}</div>
                  </div>
                  <button className="ta-btn-ghost" style={{ color: "#64748B", fontSize: 10 }} onClick={() => unfollowOrg(o.id)}>Unfollow</button>
                </div>
              </div>
            );
          })}
        </div>;
      })()}

      {/* Pending apps I've submitted */}
      {myPendingApps.length > 0 && <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#EA580C", marginBottom: 6 }}>Your Pending Applications</div>
        {myPendingApps.map(a => (
          <div key={a.id} className="ta-card" style={{ borderLeft: "4px solid #D97706", fontSize: 12, padding: 12 }}>
            <strong>{a.orgName}</strong> — {a.mode === "tribal" ? "Awaiting founder approval" : `${a.sponsors.length}/${a.sponsorsNeeded} sponsors`}
            {a.reason && <div style={{ fontSize: 12, color: "#1E293B", marginTop: 4, fontStyle: "italic" }}>"{a.reason}"</div>}
            <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>Applied {sDate(a.createdAt)}</div>
          </div>
        ))}
      </div>}

      {/* Admission Requests — Tribal (founder) and Sponsor */}
      {pendingApps.length > 0 && <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#0D9488", marginBottom: 6 }}>Admission Requests ({pendingApps.length})</div>
        {pendingApps.map(a => {
          const org = orgs[a.orgId];
          const founders = org?.founders || [org?.createdBy];
          const isFounder = founders.includes(user.username);
          const isTribal = a.mode === "tribal";
          const alreadySponsored = a.sponsors.includes(user.username);
          return (
            <div key={a.id} className="ta-card" style={{ borderLeft: `4px solid ${isTribal ? "#EA580C" : "#0D9488"}`, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, marginBottom: 4 }}><strong>{a.userId === ADMIN_USERNAME ? "👑 " : ""}@{a.displayName}</strong> wants to join <strong>{a.orgName}</strong></div>
                  {isTribal && <span style={{ fontSize: 8, padding: "1px 5px", background: "#FFFBEB", color: "#A16207", borderRadius: 8, fontFamily: "var(--mono)", fontWeight: 700, display: "inline-block", marginBottom: 4 }}>Tribal Rule — Founder Approval</span>}
                  {!isTribal && <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4 }}>{a.sponsors.length}/{a.sponsorsNeeded} sponsor{a.sponsorsNeeded > 1 ? "s" : ""} · Applied {sDate(a.createdAt)}</div>}
                  {a.reason && <div style={{ fontSize: 12, color: "#1E293B", lineHeight: 1.6, padding: 8, background: "#F9FAFB", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 4 }}><div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 3 }}>Why They Want to Join</div>{a.reason}</div>}
                  {a.link && <a href={a.link} target="_blank" rel="noopener" style={{ fontSize: 12, color: "#0D9488", wordBreak: "break-all" }}>🔗 {a.link}</a>}
                  {a.sponsors.length > 0 && <div style={{ fontSize: 10, color: "#64748B", marginTop: 3 }}>Vouched by: {a.sponsors.map(s => "@" + s).join(", ")}</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 10 }}>
                  {isTribal ? (
                    isFounder ? <>
                      <button className="ta-btn-secondary" style={{ fontSize: 10, padding: "4px 10px", background: "#059669", color: "#fff", border: "none" }} onClick={() => sponsorApp(a.id)}>✓ Admit</button>
                      <button className="ta-btn-ghost" style={{ fontSize: 10, padding: "4px 10px", color: "#DC2626" }} onClick={() => rejectApp(a.id)}>✗ Reject</button>
                    </> : <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B" }}>Founder decides</span>
                  ) : (
                    alreadySponsored ?
                      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#059669", fontWeight: 700 }}>✓ Sponsored</span> :
                      <button className="ta-btn-secondary" style={{ fontSize: 10, padding: "4px 10px" }} onClick={() => sponsorApp(a.id)}>Vouch</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>}

      {/* Application form modal */}
      {applyingTo && orgs[applyingTo] && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "#FFFFFF", padding: 24, borderRadius: 8, maxWidth: 500, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Apply to {orgs[applyingTo].name}</div>
          {checkEnrollment(orgs[applyingTo]).mode === "tribal" && <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#A16207", marginBottom: 8 }}>⚠ Tribal Rule — the founder will review your application personally.</div>}
          {checkEnrollment(orgs[applyingTo]).mode === "sponsor" && <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#0D9488", marginBottom: 8 }}>{checkEnrollment(orgs[applyingTo]).sponsors} qualified sponsor{checkEnrollment(orgs[applyingTo]).sponsors > 1 ? "s" : ""} will need to vouch for you.</div>}
          {orgs[applyingTo].charter && <div style={{ padding: 10, background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 3 }}>Assembly Charter</div>
            <div style={{ fontSize: 12, color: "#1E293B", lineHeight: 1.6 }}>{orgs[applyingTo].charter}</div>
          </div>}
          <div className="ta-field"><label>Why do you want to join? *</label><textarea value={joinReason} onChange={e => setJoinReason(e.target.value)} rows={3} placeholder="Tell the community what draws you here and what you hope to contribute..." maxLength={500} /></div>
          <div className="ta-field"><label>Link about yourself <span style={{ fontWeight: 400, color: "#64748B" }}>(optional)</span></label><input value={joinLink} onChange={e => setJoinLink(e.target.value)} placeholder="https://yourwebsite.com or social profile" /></div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="ta-btn-primary" onClick={() => submitApplication(applyingTo)}>Submit Application</button>
            <button className="ta-btn-ghost" onClick={() => { setApplyingTo(null); setJoinReason(""); setJoinLink(""); }}>Cancel</button>
          </div>
        </div>
      </div>}

      {/* Found / Discover */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <h3 className="ta-label" style={{ margin: 0 }}>Discover Assemblies</h3>
          <div style={{ display: "flex", gap: 4 }}>
            {!creating && myOrgIds.length < MAX_ORGS && <button onClick={() => setCreating(true)} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>+ Found</button>}
            {sorts.map(([k, l]) => <button key={k} onClick={() => setSortBy(k)} style={{ padding: "3px 8px", fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", background: sortBy === k ? "#2563EB" : "#F9FAFB", color: sortBy === k ? "#fff" : "#64748B", border: `1px solid ${sortBy === k ? "#2563EB" : "#E2E8F0"}`, borderRadius: 8, cursor: "pointer" }}>{l}</button>)}
          </div>
        </div>

        {creating && <div className="ta-card" style={{ marginBottom: 14 }}>
          <div className="ta-field"><label>Name *</label><input value={newOrg.name} onChange={e => setNewOrg({ ...newOrg, name: e.target.value })} /></div>
          <div className="ta-field"><label>Description *</label><input value={newOrg.description} onChange={e => setNewOrg({ ...newOrg, description: e.target.value })} /></div>
          <div className="ta-field"><label>Charter</label><textarea value={newOrg.charter} onChange={e => setNewOrg({ ...newOrg, charter: e.target.value })} rows={2} /></div>
          <div style={{ display: "flex", gap: 10 }}><button className="ta-btn-primary" onClick={createOrg}>Found Assembly</button><button className="ta-btn-ghost" onClick={() => setCreating(false)}>Cancel</button></div>
        </div>}

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assemblies..." style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #CBD5E1", background: "#fff", fontSize: 13, borderRadius: 8, marginBottom: 12, boxSizing: "border-box" }} />

        {orgList.length === 0 ? <Empty text="No other assemblies to discover." /> : orgList.map(o => {
          const st = orgStats[o.id] || {}; const enr = checkEnrollment(o);
          const hasPending = Object.values(apps || {}).some(a => a.userId === user.username && a.orgId === o.id && a.status === "pending");
          const atLimit = myOrgIds.length >= MAX_ORGS;
          return (
            <div key={o.id} className="ta-card" style={{ borderLeft: `4px solid ${st.juryReady ? "#059669" : "#D97706"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 15, fontFamily: "var(--serif)", cursor: "pointer", textDecoration: "underline", textDecorationColor: "#CBD5E1" }} onClick={() => setViewingOrg(o.id)}>{o.name}</strong>
                    {st.juryReady ? <span style={{ fontSize: 8, padding: "1px 5px", background: "#ECFDF5", color: "#059669", borderRadius: 8, fontFamily: "var(--mono)", textTransform: "uppercase", fontWeight: 700 }}>Active</span> : <span style={{ fontSize: 8, padding: "1px 5px", background: "#FFFBEB", color: "#D97706", borderRadius: 8, fontFamily: "var(--mono)", fontWeight: 700 }}>+{Math.max(0, 5 - o.members.length)}</span>}
                    {enr.mode !== "open" && <span style={{ fontSize: 8, padding: "1px 5px", background: enr.mode === "tribal" ? "#FFF7ED" : "#FFF7ED", color: enr.mode === "tribal" ? "#EA580C" : "#EA580C", borderRadius: 8, fontFamily: "var(--mono)", fontWeight: 700 }}>{enr.label}</span>}
                  </div>
                  {o.description && <p style={{ color: "#1E293B", margin: "2px 0 6px", fontSize: 13, lineHeight: 1.6 }}>{o.description}</p>}
                  {o.charter && <p style={{ color: "#475569", margin: "0 0 6px", fontSize: 12, lineHeight: 1.6, fontStyle: "italic" }}>Charter: {o.charter.substring(0, 120)}{o.charter.length > 120 ? "..." : ""}</p>}
                  <div style={{ display: "flex", gap: 12, fontSize: 10, fontFamily: "var(--mono)", color: "#64748B", flexWrap: "wrap" }}>
                    <span>{o.members.length} members</span>
                    {o.createdBy && <span>Founded by @{o.createdBy}</span>}
                    {st.total > 0 && <span>{st.total} subs</span>}
                    {st.approved > 0 && <span style={{ color: "#059669" }}>{st.approved} approved</span>}
                    {st.consensus > 0 && <span style={{ color: "#7C3AED" }}>{st.consensus} consensus</span>}
                    {(() => { const r = computeAssemblyReputation(o, subs); return r.confidence ? <span style={{ color: "#7C3AED", fontWeight: 700 }}>Trust: {r.trustScore}%</span> : null; })()}
                  </div>
                </div>
                <div style={{ marginLeft: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                  {hasPending ? <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#EA580C" }}>Pending...</span>
                  : atLimit ? <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B" }}>{MAX_ORGS}/{MAX_ORGS}</span>
                  : enr.mode === "open" ? <button className="ta-btn-secondary" onClick={() => joinOrg(o.id)}>Join</button>
                  : enr.mode === "tribal" ? <button className="ta-btn-secondary" style={{ borderColor: "#EA580C", color: "#EA580C" }} onClick={() => joinOrg(o.id)}>Apply</button>
                  : <button className="ta-btn-secondary" onClick={() => joinOrg(o.id)}>Apply</button>}
                  {isFollowing(o.id)
                    ? <button className="ta-btn-ghost" style={{ fontSize: 10, padding: "2px 8px", color: "#64748B" }} onClick={() => unfollowOrg(o.id)}>Unfollow</button>
                    : <button className="ta-btn-ghost" style={{ fontSize: 10, padding: "2px 8px", color: "#0D9488" }} onClick={() => followOrg(o.id)}>Follow</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {activeOrg && (activeOrg.founders || [activeOrg.createdBy]).includes(user.username) && <InviteCTA orgName={activeOrg.name} memberCount={activeOrg.members.length} />}
    </div>
  );
}

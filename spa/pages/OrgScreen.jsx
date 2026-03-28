import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SK, MAX_ORGS, ADMIN_USERNAME, CROSS_GROUP_DECEPTION_MULT } from "../lib/constants";
import { sDate } from "../lib/utils";
import { sG } from "../lib/storage";
import { W, computeAssemblyReputation, getMajority } from "../lib/scoring";
import { checkEnrollment } from "../lib/permissions";
import { getJurySize, getSuperJurySize, getConcessionRecovery } from "../lib/jury";
import { UsernameLink, SubHeadline, StatusPill, InviteCTA, Empty, Loader, Icon } from "../components/ui";
import AssemblyGuide from "../components/AssemblyGuide";
import { queryKeys } from "../lib/queryKeys";

function OrgAvatar({ org, size = 48 }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0, border: "1px solid var(--border)", overflow: "hidden", background: "var(--bg)" }}>
      {org.avatar ? (
        <img src={org.avatar} width={size} height={size} alt={org.name} style={{ objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 900, color: "var(--text-muted)", fontFamily: "var(--serif)" }}>{(org.name || "?")[0]}</div>
      )}
    </div>
  );
}

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

export default function OrgScreen({ user, onUpdate, onViewCitizen, initialViewingOrg, onViewingOrgChange }) {
  const qc = useQueryClient();
  const invalidateOrgs = () => { qc.invalidateQueries({ queryKey: queryKeys.orgs }); qc.invalidateQueries({ queryKey: queryKeys.users }); qc.invalidateQueries({ queryKey: queryKeys.applications }); };
  const [orgs, setOrgs] = useState(null); const [subs, setSubs] = useState(null); const [apps, setApps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false); const [newOrg, setNewOrg] = useState({ name: "", description: "", charter: "" });
  const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const [search, setSearch] = useState(""); const [sortBy, setSortBy] = useState("activity");
  const [showGuide, setShowGuide] = useState(false);
  const [viewingOrg, setViewingOrgRaw] = useState(initialViewingOrg || null); // Assembly detail/profile view
  const setViewingOrg = (id) => { setViewingOrgRaw(id); if (!id && onViewingOrgChange) onViewingOrgChange(); };
  useEffect(() => { if (initialViewingOrg) setViewingOrgRaw(initialViewingOrg); }, [initialViewingOrg]);
  const [concessions, setConcessions] = useState(null);
  const [editingCharter, setEditingCharter] = useState(false);
  const [charterDraft, setCharterDraft] = useState("");
  const [concessionReason, setConcessionReason] = useState("");

  const load = useCallback(async () => {
    const [o, s, a, c] = await Promise.all([sG(SK.ORGS), sG(SK.SUBS), sG(SK.APPS), sG("ta-concessions")]);
    setOrgs(o || {}); setSubs(s || {}); setApps(a || {}); setConcessions(c || {}); setLoading(false);
    invalidateOrgs();
    // Load followed orgs from relational API
    try {
      const res = await fetch("/api/users/me/assemblies");
      if (res.ok) {
        const data = await res.json();
        const followed = (data.data?.followed || data.followed || []).map(f => f.id);
        if (followed.length > 0) setFollowedOrgIds(followed);
      }
    } catch (e) { /* will use local state */ }
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

  const [followedOrgIds, setFollowedOrgIds] = useState(user.followedOrgIds || []);
  const isFollowing = (oid) => followedOrgIds.includes(oid);
  const followOrg = async (oid) => {
    try {
      const res = await fetch(`/api/orgs/${oid}/follow`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) { const data = await res.json().catch(() => ({})); if (res.status !== 409) { setError(data.error || "Failed to follow assembly"); return; } }
      setFollowedOrgIds(prev => prev.includes(oid) ? prev : [...prev, oid]);
      setSuccess("Following assembly.");
      setTimeout(() => setSuccess(""), 2000);
    } catch (e) { setError("Failed to follow assembly. Please try again."); }
  };
  const unfollowOrg = async (oid) => {
    try {
      const res = await fetch(`/api/orgs/${oid}/follow`, { method: "DELETE", headers: { "Content-Type": "application/json" } });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || "Failed to unfollow"); return; }
      setFollowedOrgIds(prev => prev.filter(id => id !== oid));
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

  // Compute Wild West status for accurate jury size display
  const totalCitizens = Object.values(orgs || {}).reduce((set, o) => { (o.members || []).forEach(m => set.add(m)); return set; }, new Set()).size;
  const wildWest = totalCitizens < 100;

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
              : <button className="ta-btn-secondary" style={{ fontSize: 10, padding: "4px 12px", borderColor: "#0D9488", color: "var(--gold)" }} onClick={() => followOrg(viewingOrg)}>Follow</button>
          )}
        </div>
        {error && <div className="ta-error">{error}</div>}
        {success && <div className="ta-success">{success}</div>}

        {/* Assembly Identity */}
        <div className="ta-card" style={{ borderLeft: `4px solid ${vo.isGeneralPublic ? "#0D9488" : "var(--text)"}` }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 8 }}>
            {/* Assembly avatar — clickable for founders under 50 members */}
            {(() => {
              const isFounderForAvatar = (vo.founders || [vo.createdBy]).includes(user.username);
              const canUploadAvatar = isFounderForAvatar && vo.members.length < 50 && !vo.isGeneralPublic;
              const handleAvatarClick = () => {
                if (!canUploadAvatar) return;
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/jpeg,image/png,image/webp";
                input.onchange = async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  // Client-side validation
                  const validTypes = ["image/jpeg", "image/png", "image/webp"];
                  if (!validTypes.includes(file.type)) {
                    setError("Only JPEG, PNG, and WebP images are accepted.");
                    return;
                  }
                  if (file.size > 2 * 1024 * 1024) {
                    setError("Image must be under 2MB. Try a smaller file.");
                    return;
                  }
                  // Resize to 256x256 square
                  const canvas = document.createElement("canvas");
                  canvas.width = 256; canvas.height = 256;
                  const ctx = canvas.getContext("2d");
                  const img = new Image();
                  img.onload = async () => {
                    const s = Math.min(img.width, img.height);
                    const sx = (img.width - s) / 2;
                    const sy = (img.height - s) / 2;
                    ctx.drawImage(img, sx, sy, s, s, 0, 0, 256, 256);
                    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
                    try {
                      const res = await fetch(`/api/orgs/${viewingOrg}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatar: dataUrl }) });
                      if (res.ok) {
                        // Update local state immediately so image displays without waiting for refetch
                        setOrgs(prev => {
                          const updated = { ...prev };
                          if (updated[viewingOrg]) updated[viewingOrg] = { ...updated[viewingOrg], avatar: dataUrl };
                          return updated;
                        });
                        setSuccess("Assembly image updated successfully.");
                        setTimeout(() => setSuccess(""), 3000);
                      } else {
                        const d = await res.json().catch(() => ({}));
                        setError(d.error || "Failed to update image. Please try again.");
                      }
                    } catch { setError("Network error uploading image."); }
                  };
                  img.onerror = () => { setError("Could not read image file. Try a different file."); };
                  img.src = URL.createObjectURL(file);
                };
                input.click();
              };
              return (
                <div title={canUploadAvatar ? "Click to upload image (JPEG, PNG, or WebP, max 2MB)" : ""} style={{ width: 80, height: 80, flexShrink: 0, border: "1px solid var(--border)", overflow: "hidden", background: "var(--bg)", cursor: canUploadAvatar ? "pointer" : "default", position: "relative" }} onClick={handleAvatarClick}>
                  {vo.avatar ? (
                    <img src={vo.avatar} width={80} height={80} alt={vo.name} style={{ objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, color: "var(--text-muted)", fontFamily: "var(--serif)" }}>{(vo.name || "?")[0]}</div>
                  )}
                  {canUploadAvatar && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 7, textAlign: "center", padding: "2px 0", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{vo.avatar ? "Change" : "Upload"}</div>}
                </div>
              );
            })()}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>{vo.description}</div>
            </div>
          </div>
          {vo.charter && !editingCharter && <div style={{ fontSize: 12, color: "var(--text-sec)", fontStyle: "italic", paddingLeft: 10, borderLeft: "2px solid var(--border)" }}>{vo.charter}</div>}
          {!vo.charter && !editingCharter && <div style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>No charter set</div>}
          {(() => {
            const isFounderOfThis = (vo.founders || [vo.createdBy]).includes(user.username);
            const canEdit = isFounderOfThis && vo.members.length < 50 && !vo.isGeneralPublic;
            if (!canEdit) return null;
            if (editingCharter) return (
              <div style={{ marginTop: 6 }}>
                <textarea value={charterDraft} onChange={e => setCharterDraft(e.target.value)} rows={3} placeholder="Write your assembly's charter..." maxLength={10000} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text)", fontSize: 12, borderRadius: 0, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button className="ta-btn-primary" style={{ fontSize: 10, padding: "4px 12px" }} onClick={async () => {
                    try {
                      const res = await fetch(`/api/orgs/${viewingOrg}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ charter: charterDraft }) });
                      if (res.ok) { setEditingCharter(false); setSuccess("Charter updated."); load(); setTimeout(() => setSuccess(""), 3000); }
                      else { const d = await res.json().catch(() => ({})); setError(d.error || "Failed to update charter"); }
                    } catch { setError("Network error updating charter"); }
                  }}>Save Charter</button>
                  <button className="ta-btn-ghost" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => setEditingCharter(false)}>Cancel</button>
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>Charter becomes permanent at 50 members ({vo.members.length}/50)</div>
              </div>
            );
            return <button className="ta-btn-ghost" style={{ fontSize: 9, color: "var(--gold)", marginTop: 4 }} onClick={() => { setEditingCharter(true); setCharterDraft(vo.charter || ""); }}>Edit Charter</button>;
          })()}
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-muted)", marginTop: 8 }}>
            Founded by @{vo.createdBy} · {sDate(vo.createdAt)} · {vo.members.length} members · {enrollment.label} · Jury: {wildWest ? 1 : getJurySize(vo.members.length)} · Super jury: {wildWest ? "N/A" : getSuperJurySize(vo.members.length)}
          </div>
        </div>

        {/* Cross-Group Reputation */}
        <div className="ta-card" style={{ borderLeft: "4px solid #7C3AED" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7C3AED", marginBottom: 10, fontWeight: 700 }}>Cross-Group Reputation</div>
          {!rep.confidence ? (
            <div style={{ fontSize: 13, color: "var(--text-sec)" }}>
              {rep.total === 0 ? "No cross-group reviews completed yet." : `${rep.total}/20 cross-group reviews completed. Trust Score displays at 20.`}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
              {[["#7C3AED", rep.trustScore + "%", "Trust Score"], ["#059669", rep.survivals + "/" + rep.total, "Survivals"], ["#991B1B", rep.deceptionFindings, "Deception Findings"], ["#CA8A04", rep.cassandraIndex, "Dispute Index"]].map(([c, v, l], i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 700, color: c }}>{v}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>{l}</div>
                </div>
              ))}
            </div>
          )}
          {rep.deceptionFindings > 0 && <div style={{ padding: 8, background: "rgba(196,74,58,0.09)", border: "1px solid #991B1B", borderRadius: 0, marginTop: 8, fontSize: 12, color: "var(--red)", fontWeight: 600 }}>
            {rep.deceptionFindings} cross-group deception finding{rep.deceptionFindings > 1 ? "s" : ""} — external jurors found content this Assembly approved to be deliberately misleading ({CROSS_GROUP_DECEPTION_MULT}× penalty each).
          </div>}
          {rep.concessions > 0 && <div style={{ padding: 8, background: "var(--card-bg)", border: "1px solid #9B7DB8", borderRadius: 0, marginTop: 8, fontSize: 12, color: "#7C3AED" }}>
            This Assembly has conceded {rep.concessions} time{rep.concessions > 1 ? "s" : ""} — acknowledging when cross-group review found them wrong.
          </div>}
          <div style={{ marginTop: 10, padding: 10, background: "var(--card-bg)", borderRadius: 0, fontSize: 12, color: "var(--text-sec)", lineHeight: 1.6 }}>
            <strong>How this works:</strong> Trust Score measures what percentage of this Assembly's approved corrections also survive cross-group review, weighted by combined jury rigor (internal jury size + cross-group jury size). Internal approval rates are self-grading — cross-group survival is the only fair measure. Score requires 20+ cross-group reviews for confidence. No time decay — the permanent record is the reputation.
          </div>
        </div>

        {/* Concessions */}
        {canPropose && <div className="ta-card" style={{ borderLeft: "4px solid #7C3AED" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7C3AED", marginBottom: 8, fontWeight: 700 }}><Icon name="jury" size={16} /> Concessions</div>
          <div style={{ fontSize: 12, color: "var(--text-sec)", lineHeight: 1.6, marginBottom: 10 }}>
            When a cross-group rejection occurs, any member can propose the Assembly concede. {wildWest ? <strong>In Wild West mode, concessions require 1 reviewer.</strong> : <span>A <strong>super jury of {getSuperJurySize(vo.members.length)}</strong> decides.</span>} One concession per week gets full recovery — no reputation loss. Additional concessions in the same week recover 90%. After the first week, recovery decays (90% at 2 weeks, 50% at 1 month, down to 5% after 3 months). Individual dispute winners keep their full {W.disputeWin}× reward regardless — the Assembly does not share in that reward.
          </div>
          {/* Pending concession votes I'm on */}
          {pendingConcessions.filter(c => c.jurors.includes(user.username) && !c.votes[user.username]).map(c => {
            const cSub = subs[c.subId];
            return (
              <div key={c.id} className="ta-card" style={{ borderLeft: "4px solid #EA580C", marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#EA580C", marginBottom: 4, fontWeight: 700 }}>SUPER JURY CONCESSION VOTE</div>
                <div style={{ fontSize: 12, marginBottom: 4 }}><strong>@{c.proposedBy}</strong> proposes the Assembly concede on:</div>
                {cSub && <div style={{ padding: 8, background: "var(--card-bg)", borderRadius: 0, marginBottom: 6 }}>
                  <SubHeadline sub={cSub} size={12} />
                  <div style={{ fontFamily: "var(--serif)", color: "var(--red)", fontWeight: 700, fontSize: 14 }}>{cSub.replacement}</div>
                </div>}
                <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 6 }}>{c.reasoning}</div>
                <div style={{ fontSize: 10, color: "var(--gold)", fontFamily: "var(--mono)", marginBottom: 6 }}>Recovery if passed now: {Math.round(getConcessionRecovery(c.rejectedAt, 0) * 100)}% max (first this week — additional concessions in same week: 90%). Clock is ticking.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="ta-btn-primary" style={{ background: "#7C3AED" }} onClick={() => handleConcessionVote(c.id, true)}>✓ Concede</button>
                  <button className="ta-btn-primary" style={{ background: "var(--red)" }} onClick={() => handleConcessionVote(c.id, false)}>✗ Hold Position</button>
                </div>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-muted)", marginTop: 4 }}>{Object.keys(c.votes).length}/{c.jurors.length} votes · Needs {getMajority(c.jurors.length)}</div>
              </div>
            );
          })}
          {/* Cross-group rejections eligible for concession */}
          {crossRejected.length > 0 && <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-sec)", marginBottom: 6 }}>Cross-Group Rejections ({crossRejected.length})</div>
            {crossRejected.slice(0, 5).map(s => {
              const alreadyConceded = myConcessions.some(c => c.subId === s.id && c.status !== "rejected");
              const recovery = getConcessionRecovery(s.resolvedAt);
              return (
                <div key={s.id} style={{ padding: 8, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0, marginBottom: 6 }}>
                  <div style={{ fontSize: 12 }}><SubHeadline sub={s} size={12} /></div>
                  <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-muted)", marginTop: 3 }}>by {s.submittedBy === ADMIN_USERNAME ? <><Icon name="crown" size={14} />{" "}</> : ""}@{s.submittedBy} · Rejected {sDate(s.resolvedAt)} · Recovery: {Math.round(recovery * 100)}%</div>
                  {alreadyConceded ? <div style={{ fontSize: 10, color: "#7C3AED", fontFamily: "var(--mono)", marginTop: 3 }}>Concession proposed</div> : (
                    <div style={{ marginTop: 6 }}>
                      <textarea value={concessionReason} onChange={e => setConcessionReason(e.target.value)} placeholder="Why should the Assembly concede?" rows={2} style={{ width: "100%", padding: 6, border: "1px solid var(--border)", fontSize: 12, borderRadius: 0, boxSizing: "border-box", fontFamily: "var(--body)" }} />
                      <button className="ta-btn-secondary" style={{ marginTop: 4, fontSize: 10 }} onClick={() => handleProposeConcession(s.id)}>Propose Concession</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>}
          {/* Past concessions */}
          {myConcessions.filter(c => c.status !== "pending_review").length > 0 && <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-sec)", marginBottom: 4 }}>Concession History</div>
            {myConcessions.filter(c => c.status !== "pending_review").map(c => (
              <div key={c.id} style={{ padding: 6, fontSize: 12, color: c.status === "approved" ? "#7C3AED" : "#64748B", borderLeft: `3px solid ${c.status === "approved" ? "#7C3AED" : "var(--border)"}`, paddingLeft: 8, marginBottom: 4 }}>
                {c.status === "approved" ? `✓ Conceded (${Math.round(c.recoveryAtResolution * 100)}% recovery)` : "✗ Held position"} — {sDate(c.resolvedAt)}
              </div>
            ))}
          </div>}
        </div>}

        {/* Activity Stats */}
        <div className="ta-card">
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", marginBottom: 8 }}>Activity</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
            {[["var(--text)", vStats.total || 0, "Submissions"], ["#059669", vStats.approved || 0, "Approved"], ["#7C3AED", vStats.consensus || 0, "Consensus"], ["#0D9488", vo.members.length, "Members"]].map(([c, v, l], i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, color: c }}>{v}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>{l}</div>
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
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", marginBottom: 8 }}>Recent Submissions ({resolvedSubs.length} total)</div>
              {displaySubs.map(s => {
                const approveCount = Object.values(s.votes || {}).filter(v => v.approve).length;
                const rejectCount = Object.values(s.votes || {}).filter(v => !v.approve).length;
                return (
                  <div key={s.id} style={{ padding: "8px 10px", marginBottom: 6, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0, borderLeft: `3px solid ${s.status === "approved" || s.status === "consensus" ? "#059669" : s.status === "rejected" || s.status === "consensus_rejected" ? "#DC2626" : "#D97706"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>
                        <UsernameLink username={s.submittedBy} onClick={onViewCitizen} /> · {sDate(s.resolvedAt || s.createdAt)}
                        {s.isDI && <><span> · </span><Icon name="robot" size={14} /> DI</>}{s.trustedSkip && <><span> · </span><Icon name="trust-badge" size={14} /></>}
                      </span>
                      <StatusPill status={s.status} />
                    </div>
                    <SubHeadline sub={s} size={12} />
                    <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-muted)", marginTop: 4 }}>
                      {approveCount + rejectCount > 0 && <span>{approveCount}↑ {rejectCount}↓</span>}
                      {s.evidence && s.evidence.length > 0 && <span> · {s.evidence.length}</span>}
                      {s.inlineEdits && s.inlineEdits.length > 0 && <span> · {s.inlineEdits.length} edits</span>}
                    </div>
                  </div>
                );
              })}
              {resolvedSubs.length > 10 && (
                <div style={{ textAlign: "center", marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Showing 10 of {resolvedSubs.length} submissions</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Members */}
        <div className="ta-card">
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", marginBottom: 8 }}>Members ({vo.members.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {vo.members.slice(0, 50).map(m => <span key={m} style={{ fontSize: 10, fontFamily: "var(--mono)", padding: "2px 6px", background: "var(--card-bg)", borderRadius: 0, color: "var(--text)" }}><UsernameLink username={m} onClick={onViewCitizen} /></span>)}
            {vo.members.length > 50 && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>+{vo.members.length - 50} more</span>}
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

  // Trusted contributor progress for an assembly
  const trustedProgress = (o) => {
    const mySubs = Object.values(subs || {}).filter(s => s.orgId === o.id && s.submittedBy === user.username);
    const approved = mySubs.filter(s => ["approved", "consensus", "cross_review"].includes(s.status));
    let streak = 0;
    const sorted = approved.sort((a, b) => new Date(b.resolvedAt || b.createdAt) - new Date(a.resolvedAt || a.createdAt));
    for (const s of sorted) { if (["approved", "consensus", "cross_review"].includes(s.status)) streak++; else break; }
    return { streak, required: 10 };
  };

  // User's role in an assembly
  const userRole = (o) => {
    const founders = o.founders || [o.createdBy];
    if (founders.includes(user.username)) return "Archivist";
    return "Member";
  };

  // Compute user's trust score within an assembly
  const userTrustInOrg = (o) => {
    const mySubs = Object.values(subs || {}).filter(s => s.orgId === o.id && s.submittedBy === user.username);
    const wins = mySubs.filter(s => ["approved", "consensus", "cross_review"].includes(s.status)).length;
    const losses = mySubs.filter(s => s.status === "rejected" || s.status === "consensus_rejected").length;
    return Math.round((100 + (wins * W.win) - (losses * W.loss)) * 10) / 10;
  };

  return (
    <div>
      <div className="ta-section-rule" />

      {/* Section label */}
      <div style={{ fontSize: 10, letterSpacing: 3, color: "var(--gold)", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>Assemblies</div>

      {/* Education text */}
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", lineHeight: 1.5, marginBottom: 8 }}>
        Assemblies are communities of verification. Each focuses on a different domain. Your submissions are reviewed by the assemblies you submit to, and you review work from fellow members.
      </div>

      {/* Info box: Join / Follow explanations */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", padding: "10px 14px", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.6 }}>
          <span style={{ color: "var(--green)", fontWeight: 700 }}>Join</span> an assembly to submit claims, vote on reviews, and build your trust score within that community. You can join up to <span style={{ color: "var(--gold)", fontWeight: 700 }}>{MAX_ORGS} assemblies</span> — choose where to invest your effort.
        </div>
        <div style={{ fontSize: 11, color: "var(--text-sec)", lineHeight: 1.6, marginTop: 6 }}>
          <span style={{ color: "var(--green)", fontWeight: 700 }}>Follow</span> an assembly to see its content in your feed without joining. You won't be able to submit or vote, but you can observe the deliberation and decide if it's worth your commitment.
        </div>
        {myOrgIds.length < MAX_ORGS && !creating && (
          <div style={{ fontSize: 11, color: "var(--text-sec)", lineHeight: 1.6, marginTop: 6 }}>
            <span style={{ color: "var(--gold)", fontWeight: 700 }}>Create</span> your own assembly if you see a gap. <span style={{ color: "var(--gold)", cursor: "pointer", textDecoration: "underline" }} onClick={() => setCreating(true)}>Propose a new assembly →</span>
          </div>
        )}
      </div>

      {/* How Assemblies Work CTA */}
      <button onClick={() => setShowGuide(g => !g)} style={{ background: showGuide ? "var(--gold)" : "transparent", color: showGuide ? "#0d0d0a" : "var(--text-sec)", border: "1px solid var(--border)", padding: "4px 12px", fontFamily: "var(--mono)", fontSize: 9, cursor: "pointer", borderRadius: 0, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {showGuide ? "Hide Guide" : "How Assemblies Work"}
      </button>
      {showGuide && <AssemblyGuide />}

      {/* Slot count */}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
        You are a member of <strong style={{ color: "var(--gold)" }}>{myOrgs.length} of {MAX_ORGS}</strong> assemblies.{" "}
        Following <strong style={{ color: "var(--gold)" }}>{followedOrgIds.filter(id => orgs[id] && !isMember(id)).length}</strong>.
      </div>

      {error && <div className="ta-error">{error}</div>}
      {success && <div className="ta-success">{success}</div>}

      {/* YOUR ASSEMBLIES */}
      <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 2, color: "var(--gold)", fontWeight: 700, marginBottom: 8 }}>
        Your assemblies ({myOrgs.length}/{MAX_ORGS} slots used)
      </div>

      {myOrgs.map(o => {
        const isActive = user.orgId === o.id;
        const isGP = !!o.isGeneralPublic;
        const st = orgStats[o.id] || {};
        const tp = trustedProgress(o);
        const role = userRole(o);
        const trust = userTrustInOrg(o);
        const inReview = Object.values(subs || {}).filter(s => s.orgId === o.id && ["pending_review", "pending_jury", "di_pending"].includes(s.status)).length;
        return (
          <div key={o.id} style={{ border: "1px solid rgba(212,168,67,0.27)", background: "var(--card-bg)", padding: 14, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
              <OrgAvatar org={o} size={48} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, cursor: "pointer" }} onClick={() => setViewingOrg(o.id)}><span style={{ color: "var(--gold)", marginRight: 4, fontSize: 10 }}>{"\u25B8"}</span>{o.name}</div>
                  <span style={{ fontSize: 8, padding: "2px 8px", background: "rgba(74,158,85,0.09)", border: "1px solid rgba(74,158,85,0.27)", color: "#4a9e55", fontWeight: 700, flexShrink: 0 }}>JOINED</span>
                </div>
                <div style={{ fontSize: 10, color: "var(--text-sec)", lineHeight: 1.5 }}>{o.description}</div>
              </div>
            </div>

            {/* Stat cards */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {[[o.members.length, "Citizens", "var(--gold)"], [st.total || 0, "Claims", "var(--text)"], [inReview, "In review", "var(--gold)"]].map(([v, l, c], i) => (
                <div key={i} style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", padding: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: c }}>{v}</div>
                  <div style={{ fontSize: 8, color: "var(--text-muted)", letterSpacing: 1, textTransform: "uppercase" }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Role · Trust */}
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
              Role: <span style={{ color: "var(--gold)", fontWeight: 600 }}>{role}</span> · Trust: <span style={{ color: "var(--gold)", fontWeight: 600 }}>{trust}</span>
            </div>

            {/* Trusted Contributor progress bar */}
            <div className="trust-bar">
              <div className="trust-bar-top" style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 3 }}>
                <span style={{ color: "var(--gold)", fontWeight: 600 }}>Trusted Contributor</span>
                <span style={{ color: "var(--text-muted)" }}>{tp.streak}/{tp.required}</span>
              </div>
              <div style={{ display: "flex", height: 4, background: "var(--border)" }}>
                <div style={{ background: "var(--gold)", width: `${Math.min(100, (tp.streak / tp.required) * 100)}%` }} />
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              {!isActive && <button className="ta-btn-secondary" style={{ fontSize: 10, padding: "4px 10px" }} onClick={() => switchActive(o.id)}>Set Active</button>}
              {!isGP && <button className="ta-btn-ghost" style={{ color: "var(--red)", fontSize: 10, padding: "4px 8px" }} onClick={() => { if (window.confirm(`Leave "${o.name}"? You'll need to re-apply to rejoin.`)) leaveOrg(o.id); }}>Leave</button>}
            </div>
          </div>
        );
      })}

      {/* FOLLOWING */}
      {(() => {
        const followedOrgs = followedOrgIds.map(id => orgs[id]).filter(Boolean).filter(o => !isMember(o.id));
        if (followedOrgs.length === 0) return null;
        return <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 2, color: "var(--gold)", fontWeight: 700, marginBottom: 4 }}>Following</div>
          <div style={{ fontSize: 10, color: "var(--text-sec)", marginBottom: 8 }}>You see content from these assemblies in your feed. Join to submit and vote.</div>
          {followedOrgs.map(o => {
            const st = orgStats[o.id] || {};
            const inReview = Object.values(subs || {}).filter(s => s.orgId === o.id && ["pending_review", "pending_jury", "di_pending"].includes(s.status)).length;
            return (
              <div key={o.id} style={{ border: "1px solid rgba(212,168,67,0.2)", background: "var(--card-bg)", padding: 14, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 6 }}>
                  <OrgAvatar org={o} size={48} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, cursor: "pointer" }} onClick={() => setViewingOrg(o.id)}><span style={{ color: "var(--gold)", marginRight: 4, fontSize: 10 }}>{"\u25B8"}</span>{o.name}</div>
                      <span style={{ fontSize: 8, padding: "2px 8px", background: "rgba(212,168,67,0.09)", border: "1px solid rgba(212,168,67,0.27)", color: "var(--gold)", fontWeight: 700, flexShrink: 0 }}>FOLLOWING</span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-sec)", lineHeight: 1.5 }}>{o.description}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
                  <span>{o.members.length} citizens</span><span>{st.total || 0} claims</span><span>{inReview} in review</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ fontSize: 8, padding: "4px 12px", background: "var(--gold)", color: "#0d0d0a", fontWeight: 700, cursor: "pointer", border: "none" }} onClick={() => joinOrg(o.id)}>JOIN THIS ASSEMBLY</button>
                  <button style={{ fontSize: 8, padding: "4px 12px", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer", background: "none" }} onClick={() => unfollowOrg(o.id)}>UNFOLLOW</button>
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
            {a.reason && <div style={{ fontSize: 12, color: "var(--text)", marginTop: 4, fontStyle: "italic" }}>"{a.reason}"</div>}
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Applied {sDate(a.createdAt)}</div>
          </div>
        ))}
      </div>}

      {/* Admission Requests — Tribal (founder) and Sponsor */}
      {pendingApps.length > 0 && <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--gold)", marginBottom: 6 }}>Admission Requests ({pendingApps.length})</div>
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
                  <div style={{ fontSize: 13, marginBottom: 4 }}><strong>{a.userId === ADMIN_USERNAME ? <><Icon name="crown" size={14} />{" "}</> : ""}@{a.displayName}</strong> wants to join <strong>{a.orgName}</strong></div>
                  {isTribal && <span style={{ fontSize: 8, padding: "1px 5px", background: "rgba(212,168,67,0.09)", color: "#A16207", borderRadius: 0, fontFamily: "var(--mono)", fontWeight: 700, display: "inline-block", marginBottom: 4 }}>Tribal Rule — Founder Approval</span>}
                  {!isTribal && <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{a.sponsors.length}/{a.sponsorsNeeded} sponsor{a.sponsorsNeeded > 1 ? "s" : ""} · Applied {sDate(a.createdAt)}</div>}
                  {a.reason && <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.6, padding: 8, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0, marginBottom: 4 }}><div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--text-sec)", marginBottom: 3 }}>Why They Want to Join</div>{a.reason}</div>}
                  {a.link && <a href={a.link} target="_blank" rel="noopener" style={{ fontSize: 12, color: "var(--gold)", wordBreak: "break-all" }}>{a.link}</a>}
                  {a.sponsors.length > 0 && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>Vouched by: {a.sponsors.map(s => "@" + s).join(", ")}</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 10 }}>
                  {isTribal ? (
                    isFounder ? <>
                      <button className="ta-btn-secondary" style={{ fontSize: 10, padding: "4px 10px", background: "var(--green)", color: "#fff", border: "none" }} onClick={() => sponsorApp(a.id)}>✓ Admit</button>
                      <button className="ta-btn-ghost" style={{ fontSize: 10, padding: "4px 10px", color: "var(--red)" }} onClick={() => rejectApp(a.id)}>✗ Reject</button>
                    </> : <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-muted)" }}>Founder decides</span>
                  ) : (
                    alreadySponsored ?
                      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--green)", fontWeight: 700 }}>✓ Sponsored</span> :
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
        <div style={{ background: "var(--card-bg)", padding: 24, borderRadius: 0, maxWidth: 500, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Apply to {orgs[applyingTo].name}</div>
          {checkEnrollment(orgs[applyingTo]).mode === "tribal" && <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#A16207", marginBottom: 8 }}>Tribal Rule — the founder will review your application personally.</div>}
          {checkEnrollment(orgs[applyingTo]).mode === "sponsor" && <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--gold)", marginBottom: 8 }}>{checkEnrollment(orgs[applyingTo]).sponsors} qualified sponsor{checkEnrollment(orgs[applyingTo]).sponsors > 1 ? "s" : ""} will need to vouch for you.</div>}
          {orgs[applyingTo].charter && <div style={{ padding: 10, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--text-sec)", marginBottom: 3 }}>Assembly Charter</div>
            <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.6 }}>{orgs[applyingTo].charter}</div>
          </div>}
          <div className="ta-field"><label>Why do you want to join? *</label><textarea value={joinReason} onChange={e => setJoinReason(e.target.value)} rows={3} placeholder="Tell the community what draws you here and what you hope to contribute..." maxLength={500} /></div>
          <div className="ta-field"><label>Link about yourself <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span></label><input value={joinLink} onChange={e => setJoinLink(e.target.value)} placeholder="https://yourwebsite.com or social profile" /></div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="ta-btn-primary" onClick={() => submitApplication(applyingTo)}>Submit Application</button>
            <button className="ta-btn-ghost" onClick={() => { setApplyingTo(null); setJoinReason(""); setJoinLink(""); }}>Cancel</button>
          </div>
        </div>
      </div>}

      {/* DISCOVER ASSEMBLIES */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 2, color: "var(--gold)", fontWeight: 700, marginBottom: 8 }}>
          Discover assemblies
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {sorts.map(([k, l]) => <button key={k} onClick={() => setSortBy(k)} style={{ padding: "3px 8px", fontSize: 8, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 0.5, background: sortBy === k ? "var(--gold)" : "none", color: sortBy === k ? "#0d0d0a" : "var(--text-sec)", border: `1px solid ${sortBy === k ? "var(--gold)" : "var(--border)"}`, cursor: "pointer", fontWeight: sortBy === k ? 700 : 400 }}>{l}</button>)}
        </div>

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assemblies..." style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", background: "var(--card-bg)", fontSize: 11, borderRadius: 0, marginBottom: 10, boxSizing: "border-box", color: "var(--text)" }} />

        {orgList.length === 0 ? <Empty text="No other assemblies to discover." /> : orgList.map(o => {
          const st = orgStats[o.id] || {}; const enr = checkEnrollment(o);
          const hasPending = Object.values(apps || {}).some(a => a.userId === user.username && a.orgId === o.id && a.status === "pending");
          const atLimit = myOrgIds.length >= MAX_ORGS;
          return (
            <div key={o.id} style={{ border: "1px solid var(--border)", background: "var(--card-bg)", padding: 14, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <OrgAvatar org={o} size={48} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, cursor: "pointer" }} onClick={() => setViewingOrg(o.id)}><span style={{ color: "var(--gold)", marginRight: 4, fontSize: 10 }}>{"\u25B8"}</span>{o.name}</div>
                  {o.description && <div style={{ fontSize: 10, color: "var(--text-sec)", lineHeight: 1.5, marginBottom: 6 }}>{o.description}</div>}
                  <div style={{ display: "flex", gap: 16, fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
                    <span>{o.members.length} citizens</span>
                    {st.total > 0 && <span>{st.total} claims</span>}
                    {(() => { const inR = Object.values(subs || {}).filter(s => s.orgId === o.id && ["pending_review", "pending_jury"].includes(s.status)).length; return <span>{inR} in review</span>; })()}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {hasPending ? <span style={{ fontSize: 8, fontFamily: "var(--mono)", padding: "4px 12px", color: "#EA580C", border: "1px solid #EA580C" }}>PENDING...</span>
                    : atLimit ? <span style={{ fontSize: 8, fontFamily: "var(--mono)", padding: "4px 12px", color: "var(--text-muted)", border: "1px solid var(--border)" }}>{MAX_ORGS}/{MAX_ORGS}</span>
                    : <button style={{ fontSize: 8, padding: "4px 12px", background: "var(--gold)", color: "#0d0d0a", fontWeight: 700, cursor: "pointer", border: "none" }} onClick={() => joinOrg(o.id)}>{enr.mode === "open" ? "JOIN" : "APPLY"}</button>}
                    {isFollowing(o.id)
                      ? <button style={{ fontSize: 8, padding: "4px 12px", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer", background: "none" }} onClick={() => unfollowOrg(o.id)}>UNFOLLOW</button>
                      : <button style={{ fontSize: 8, padding: "4px 12px", border: "1px solid rgba(212,168,67,0.27)", color: "var(--gold)", cursor: "pointer", background: "none", fontWeight: 700 }} onClick={() => followOrg(o.id)}>FOLLOW</button>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* START YOUR OWN ASSEMBLY */}
      {myOrgIds.length < MAX_ORGS && !creating && (
        <div style={{ border: "1px solid var(--gold)", background: "rgba(212,168,67,0.03)", padding: 16, margin: "16px 0 12px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gold)", marginBottom: 6 }}>Start your own assembly</div>
          <div style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.6, marginBottom: 8 }}>
            See a gap in how the world's information is being reviewed? Create an assembly to fill it. As the founder, you shape the community from day one:
          </div>
          <div style={{ fontSize: 11, color: "var(--text-sec)", lineHeight: 1.8, marginBottom: 4 }}><span style={{ color: "var(--gold)", fontWeight: 600 }}>Set the tone.</span> You approve or reject the first citizens who apply to join. The early members define the culture of deliberation.</div>
          <div style={{ fontSize: 11, color: "var(--text-sec)", lineHeight: 1.8, marginBottom: 4 }}><span style={{ color: "var(--gold)", fontWeight: 600 }}>Focus the lens.</span> Define what your assembly cares about — a topic, a method, a standard of evidence. The more specific, the more valuable.</div>
          <div style={{ fontSize: 11, color: "var(--text-sec)", lineHeight: 1.8, marginBottom: 4 }}><span style={{ color: "var(--gold)", fontWeight: 600 }}>Build your perspective.</span> Your assembly's verdicts become part of the public record. Over time, your community's pattern of corrections and affirmations tells a story about what it values.</div>
          <div style={{ fontSize: 11, color: "var(--text-sec)", lineHeight: 1.8, marginBottom: 4 }}><span style={{ color: "var(--gold)", fontWeight: 600 }}>Grow your influence.</span> Other assemblies can adopt your Story Artifacts and reference your verdicts. A well-run assembly becomes an institution.</div>
          <button onClick={() => setCreating(true)} style={{ fontSize: 10, padding: "8px 20px", background: "var(--gold)", color: "#0d0d0a", fontWeight: 700, letterSpacing: 1, cursor: "pointer", border: "none", marginTop: 12 }}>PROPOSE A NEW ASSEMBLY</button>
        </div>
      )}

      {creating && <div style={{ border: "1px solid var(--gold)", background: "var(--card-bg)", padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gold)", marginBottom: 8 }}>Found a New Assembly</div>
        <div className="ta-field"><label>Name *</label><input value={newOrg.name} onChange={e => setNewOrg({ ...newOrg, name: e.target.value })} /></div>
        <div className="ta-field"><label>Description *</label><input value={newOrg.description} onChange={e => setNewOrg({ ...newOrg, description: e.target.value })} /></div>
        <div className="ta-field"><label>Charter</label><textarea value={newOrg.charter} onChange={e => setNewOrg({ ...newOrg, charter: e.target.value })} rows={2} /></div>
        <div style={{ display: "flex", gap: 10 }}><button className="ta-btn-primary" onClick={createOrg}>Found Assembly</button><button className="ta-btn-ghost" onClick={() => setCreating(false)}>Cancel</button></div>
      </div>}

      {activeOrg && (activeOrg.founders || [activeOrg.createdBy]).includes(user.username) && <InviteCTA orgName={activeOrg.name} memberCount={activeOrg.members.length} />}
    </div>
  );
}

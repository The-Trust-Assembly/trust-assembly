import { useState, useEffect } from "react";
import { SK, ADMIN_USERNAME, MAX_ORGS, PROFILES } from "../lib/constants";
import { sG } from "../lib/storage";
import { fDate, daysSince } from "../lib/utils";
import { computeProfile, computeBadges, computeJuryScore } from "../lib/scoring";
import { hasActiveDeceptionPenalty, deceptionPenaltyRemaining, isDIUser, getTrustedProgress } from "../lib/permissions";
import { Badge, ScoreBreakdown, CitizenBadges, UsernameLink } from "../components/ui";
import JuryScoreCard from "../components/JuryScoreCard";

export default function ProfileScreen({ user, onViewCitizen }) {
  const [u, setU] = useState(user);
  const [orgs, setOrgs] = useState({});
  const [allUsers, setAllUsers] = useState({});
  const [allSubs, setAllSubs] = useState({});
  const [juryScore, setJuryScore] = useState(null);
  const [diAgents, setDiAgents] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { (async () => {
    try {
      const all = (await sG(SK.USERS)) || {}; if (all[user.username]) setU(all[user.username]);
      setAllUsers(all);
      const o = (await sG(SK.ORGS)) || {}; setOrgs(o);
      setAllSubs((await sG(SK.SUBS)) || {});
      const js = await computeJuryScore(user.username);
      setJuryScore(js);
      setDiAgents(Object.values(all).filter(x => x.isDI && x.diPartner === user.username));
      setLoadError("");
    } catch (e) {
      console.error("ProfileScreen load error:", e);
      setLoadError("Failed to load profile data. Please refresh.");
    }
  })(); }, [user.username]);
  const p = computeProfile(u, { allUsers, allOrgs: orgs, allSubs });
  const pi = PROFILES[p.profile];
  const myOrgIds = u.orgIds || (u.orgId ? [u.orgId] : []);
  const myOrgs = myOrgIds.map(id => orgs[id]).filter(Boolean);
  if (loadError) return <div className="ta-error" style={{ margin: 20 }}>{loadError}</div>;
  return (
    <div>
      <div className="ta-section-rule" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="ta-section-head" style={{ margin: 0 }}>Citizen Record</h2>
        {!showDeleteConfirm && <button onClick={() => setShowDeleteConfirm(true)} style={{ fontSize: 11, fontFamily: "var(--mono)", padding: "5px 12px", background: "transparent", color: "#DC2626", border: "1px solid #DC262640", borderRadius: 6, cursor: "pointer", letterSpacing: "0.03em" }}>Delete Account</button>}
      </div>

      {showDeleteConfirm && (
        <div style={{ margin: "12px 0", padding: 16, background: "#FEF2F2", border: "2px solid #DC2626", borderRadius: 8 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#DC2626", fontWeight: 700, marginBottom: 8 }}>Permanently Delete Account</div>
          <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.7, marginBottom: 10 }}>
            This action is <strong>permanent and cannot be undone</strong>. If you proceed:
          </div>
          <div style={{ fontSize: 12, color: "#991B1B", lineHeight: 1.8, marginBottom: 12, paddingLeft: 8 }}>
            <div>Your username on all past submissions will be replaced with random characters.</div>
            <div>Your votes, review history, and reputation data will be permanently removed.</div>
            <div>Your assembly memberships and jury assignments will be deleted.</div>
            <div>Your personal information (name, email, demographics) will be erased.</div>
          </div>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>Type <strong>@{u.username}</strong> to confirm:</div>
          <input value={deleteInput} onChange={e => setDeleteInput(e.target.value)} placeholder={"@" + u.username} style={{ width: "100%", maxWidth: 280, padding: "6px 10px", fontSize: 13, border: "1px solid #E2E8F0", borderRadius: 6, fontFamily: "var(--mono)", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button disabled={deleteInput !== "@" + u.username || deleting} onClick={async () => {
              setDeleting(true);
              try {
                const res = await fetch("/api/users/me/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmUsername: u.username }) });
                if (res.ok) { await fetch("/api/auth/logout", { method: "POST" }); window.location.reload(); }
                else { const d = await res.json().catch(() => ({})); alert(d.error || "Failed to delete account"); setDeleting(false); }
              } catch { alert("Network error"); setDeleting(false); }
            }} style={{ fontSize: 11, fontFamily: "var(--mono)", padding: "6px 16px", background: deleteInput === "@" + u.username && !deleting ? "#DC2626" : "#E2E8F0", color: deleteInput === "@" + u.username && !deleting ? "#fff" : "#94A3B8", border: "none", borderRadius: 6, cursor: deleteInput === "@" + u.username && !deleting ? "pointer" : "not-allowed", fontWeight: 700 }}>{deleting ? "Deleting..." : "Permanently Delete My Account"}</button>
            <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }} style={{ fontSize: 11, fontFamily: "var(--mono)", padding: "6px 16px", background: "#F1F5F9", color: "#475569", border: "none", borderRadius: 6, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Visible Penalty Banner */}
      {hasActiveDeceptionPenalty(u) && (() => {
        const days = deceptionPenaltyRemaining(u);
        return (
          <div style={{ padding: 14, background: "#EBD5D3", border: "2px solid #991B1B", borderRadius: 8, marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#991B1B", fontWeight: 700, marginBottom: 6 }}>⚠ Deliberate Deception Penalty — Active</div>
            <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.6 }}>
              A jury found one of your submissions to be a deliberate deception. The following restrictions are in effect for <strong>{days} more day{days !== 1 ? "s" : ""}</strong>:
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#991B1B", lineHeight: 1.8 }}>
              <div>🚫 <strong>All voting suspended</strong> — you cannot serve on juries</div>
              <div>🚫 <strong>Sponsorship suspended</strong> — you cannot vouch for new members</div>
              <div>🚫 <strong>Assembly creation suspended</strong> — you cannot found new Assemblies</div>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>You may still submit corrections. Accurate submissions during the penalty period rebuild your reputation.</div>
          </div>
        );
      })()}

      <div className="ta-card" style={{ borderLeft: `4px solid ${isDIUser(u) ? "#4F46E5" : pi.color}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 22, fontFamily: "var(--serif)" }}>
              {isDIUser(u) ? <span style={{ marginRight: 6 }}>🤖</span> : u.username === ADMIN_USERNAME ? <span style={{ marginRight: 6 }}>👑</span> : null}
              @{u.displayName || u.username}
            </h3>
            <div style={{ color: "#475569", fontSize: 13, marginTop: 3 }}>{u.username === ADMIN_USERNAME ? "👑 " : ""}@{u.username}</div>
            {isDIUser(u) && <div style={{ marginTop: 4, fontSize: 12, fontFamily: "var(--mono)", color: "#4F46E5" }}>Digital Intelligence · Partner: <UsernameLink username={u.diPartner} onClick={onViewCitizen} style={{ fontSize: 12, color: "#4F46E5" }} /> · {u.diApproved ? "✓ Approved" : "⏳ Pending"}</div>}
          </div>
          <Badge profile={p.profile} score={p.trustScore} />
        </div>
        {/* Org memberships */}
        {myOrgs.length > 0 && <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {myOrgs.map(o => <span key={o.id} style={{ fontSize: 10, padding: "2px 7px", fontFamily: "var(--mono)", borderRadius: 8, background: o.id === u.orgId ? "#059669" : o.isGeneralPublic ? "#F0FDFA" : "#F1F5F9", color: o.id === u.orgId ? "#fff" : o.isGeneralPublic ? "#0D9488" : "#475569", fontWeight: o.id === u.orgId ? 700 : 400 }}>{o.isGeneralPublic ? "🏛" : "⬡"} {o.name}{o.id === u.orgId ? " ★" : ""}</span>)}
        </div>}
        <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>{myOrgs.length}/{MAX_ORGS} assemblies</div>
        {/* Profile explanation */}
        <div style={{ marginTop: 14, padding: 12, background: "#F1F5F9", borderRadius: 8 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: pi.color, marginBottom: 4 }}>Profile: {p.profile}</div>
          <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.6 }}>{pi.desc}</div>
        </div>
        <div style={{ marginTop: 12 }}>
          <ScoreBreakdown p={p} />
        </div>
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {[["#059669", p.wins, "Wins"], ["#DC2626", p.losses, "Losses"], ["#991B1B", p.lies, "Lies"], ["#CA8A04", p.disputeWins, "Disp. Wins"]].map(([c, n, l], i) => (
            <div key={i} style={{ textAlign: "center", padding: 8, background: "#F1F5F9", borderRadius: 8 }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 700, color: c }}>{n}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748B", marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 8 }}>
          {[["#0D9488", p.streak, "Streak"], ["#EA580C", p.disputeLosses, "Disp. Losses"], [pi.color, p.avgNews, "News"], [pi.color, p.avgFun, "Fun"]].map(([c, n, l], i) => (
            <div key={i} style={{ textAlign: "center", padding: 8, background: "#F1F5F9", borderRadius: 8 }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 700, color: c }}>{n}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748B", marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "#475569" }}><strong>{p.streak}</strong>/{p.required} wins for {p.highTrust ? "maintained " : ""}high trust</div>
        <div style={{ background: "#E2E8F0", borderRadius: 8, height: 8, overflow: "hidden", marginTop: 4 }}><div style={{ width: `${Math.min(100, (p.streak / p.required) * 100)}%`, height: "100%", background: p.highTrust ? "#059669" : "#0D9488", borderRadius: 8 }} /></div>

        {/* Per-Assembly Trusted Contributor Status */}
        {myOrgs.length > 0 && <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 6 }}>🛡 Trusted Contributor Status (per Assembly)</div>
          {myOrgs.map(o => {
            const tp = getTrustedProgress(u, o.id);
            return (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 12 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#475569", minWidth: 120 }}>{o.name}</span>
                <div style={{ flex: 1, background: "#E2E8F0", borderRadius: 8, height: 6, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (tp.current / tp.needed) * 100)}%`, height: "100%", background: tp.isTrusted ? "#059669" : "#0D9488", borderRadius: 8, transition: "width 0.3s" }} />
                </div>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: tp.isTrusted ? "#059669" : "#64748B", fontWeight: tp.isTrusted ? 700 : 400, minWidth: 60, textAlign: "right" }}>
                  {tp.isTrusted ? "🛡 TRUSTED" : `${tp.current}/${tp.needed}`}
                </span>
              </div>
            );
          })}
        </div>}
      </div>
      {/* Jury Score */}
      <JuryScoreCard username={u.username} />
      {/* Citizen Badges */}
      <div className="ta-card">
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 10, fontWeight: 700 }}>🏅 Badges</div>
        <CitizenBadges badges={computeBadges(u, allUsers, orgs, allSubs)} />
      </div>
      {/* Registered Digital Intelligences */}
      {diAgents.length > 0 && <div className="ta-card" style={{ borderLeft: "4px solid #4F46E5" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4F46E5", marginBottom: 8, fontWeight: 700 }}>🤖 Registered Digital Intelligences</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {diAgents.map(di => <UsernameLink key={di.username} username={di.username} onClick={onViewCitizen} style={{ fontSize: 12 }} />)}
        </div>
      </div>}
      <div className="ta-card">
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "3px 12px", fontSize: 13 }}>
          {[["Username", "@" + u.username], ["Signed Up", fDate(u.signupDate)], ["Account Age", daysSince(u.signupDate) + " days"]].map(([l, v], i) => (
            <div key={i} style={{ display: "contents" }}>
              <div style={{ color: "#64748B", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", padding: "3px 0" }}>{l}</div>
              <div style={{ color: "#1E293B", padding: "3px 0" }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, padding: 8, background: "#F1F5F9", borderRadius: 8, fontSize: 10, color: "#475569", lineHeight: 1.6 }}>
          <strong>🔒 Private to you:</strong> Name ({u.realName}), Email ({u.email || "—"}), Gender ({u.gender || "—"}), Location ({u.country ? (u.state ? u.state + ", " + u.country : u.country) : u.location || "—"}), Political Affiliation ({u.politicalAffiliation || "Not specified"}). These are never shown to other users — only your @username appears publicly.
        </div>
      </div>
    </div>
  );
}

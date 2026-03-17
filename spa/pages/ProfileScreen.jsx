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
  useEffect(() => { (async () => {
    const all = (await sG(SK.USERS)) || {}; if (all[user.username]) setU(all[user.username]);
    setAllUsers(all);
    const o = (await sG(SK.ORGS)) || {}; setOrgs(o);
    setAllSubs((await sG(SK.SUBS)) || {});
    const js = await computeJuryScore(user.username);
    setJuryScore(js);
    setDiAgents(Object.values(all).filter(x => x.isDI && x.diPartner === user.username));
  })(); }, [user.username]);
  const p = computeProfile(u, { allUsers, allOrgs: orgs, allSubs });
  const pi = PROFILES[p.profile];
  const myOrgIds = u.orgIds || (u.orgId ? [u.orgId] : []);
  const myOrgs = myOrgIds.map(id => orgs[id]).filter(Boolean);
  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Citizen Record</h2>

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

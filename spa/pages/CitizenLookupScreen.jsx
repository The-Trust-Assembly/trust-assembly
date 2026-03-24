import { useState, useEffect } from "react";
import { SK, ADMIN_USERNAME, PROFILES } from "../lib/constants";
import { sG } from "../lib/storage";
import { fDate, sDate, daysSince } from "../lib/utils";
import { computeProfile, computeBadges } from "../lib/scoring";
import { isDIUser } from "../lib/permissions";
import { Badge, CitizenBadges, StatusPill, SubHeadline, UsernameLink, Empty, Loader, Icon } from "../components/ui";
import JuryScoreCard from "../components/JuryScoreCard";

export default function CitizenLookupScreen({ username, onBack, onViewCitizen }) {
  const [u, setU] = useState(null);
  const [orgs, setOrgs] = useState({});
  const [subs, setSubs] = useState({});
  const [allUsers, setAllUsers] = useState({});
  const [diAgents, setDiAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const loadData = async () => {
    try {
      const all = (await sG(SK.USERS)) || {};
      const target = all[username];
      if (!target) { setNotFound(true); setLoading(false); return; }
      setU(target);
      setAllUsers(all);
      setOrgs((await sG(SK.ORGS)) || {});
      setSubs((await sG(SK.SUBS)) || {});
      // Find DI agents registered to this user
      const agents = Object.values(all).filter(x => x.isDI && x.diPartner === username);
      setDiAgents(agents);
      setNotFound(false);
    } catch (e) {
      console.warn("[CitizenLookup] data load failed:", e);
    }
    setLoading(false);
  };
  useEffect(() => { loadData(); }, [username]);
  if (loading) return <Loader />;
  if (notFound) return <div><div className="ta-section-rule" /><button className="ta-btn-ghost" onClick={onBack} style={{ marginBottom: 10 }}>← Back</button><Empty text={`Citizen @${username} not found.`} /></div>;
  const p = computeProfile(u, { allUsers, allOrgs: orgs, allSubs: subs });
  const pi = PROFILES[p.profile];
  const myOrgIds = u.orgIds || (u.orgId ? [u.orgId] : []);
  const myOrgs = myOrgIds.map(id => orgs[id]).filter(Boolean);
  const userSubs = Object.values(subs).filter(s => s.submittedBy === username).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return (
    <div>
      <div className="ta-section-rule" />
      <button className="ta-btn-ghost" onClick={onBack} style={{ marginBottom: 10 }}>← Back</button>
      <h2 className="ta-section-head">Citizen Record</h2>
      <div className="ta-card" style={{ borderLeft: `4px solid ${isDIUser(u) ? "#4F46E5" : pi.color}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 22, fontFamily: "var(--serif)" }}>
              {isDIUser(u) ? <span style={{ marginRight: 6 }}><Icon name="robot" size={14} /></span> : u.username === ADMIN_USERNAME ? <span style={{ marginRight: 6 }}><Icon name="crown" size={14} /></span> : null}
              @{u.displayName || u.username}
            </h3>
            {isDIUser(u) && <div style={{ marginTop: 4, fontSize: 12, fontFamily: "var(--mono)", color: "var(--gold)" }}>Digital Intelligence · Partner: <UsernameLink username={u.diPartner} onClick={onViewCitizen} /> · {u.diApproved ? "✓ Approved" : "Pending"}</div>}
          </div>
          <Badge profile={p.profile} score={p.trustScore} />
        </div>
        {myOrgs.length > 0 && <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {myOrgs.map(o => <span key={o.id} style={{ fontSize: 10, padding: "2px 7px", fontFamily: "var(--mono)", borderRadius: 0, background: o.isGeneralPublic ? "#F0FDFA" : "var(--card-bg)", color: o.isGeneralPublic ? "#0D9488" : "#475569" }}>{o.isGeneralPublic ? <><Icon name="vault" size={10} /> </> : ""}{o.name}</span>)}
        </div>}
        <div style={{ marginTop: 14, padding: 12, background: "var(--card-bg)", borderRadius: 0 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: pi.color, marginBottom: 4 }}>Profile: {p.profile}</div>
          <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>{pi.desc}</div>
        </div>
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {[["#059669", p.wins, "Wins"], ["#DC2626", p.losses, "Losses"], ["#CA8A04", p.disputeWins, "Disp. Wins"], ["#0D9488", p.streak, "Streak"]].map(([c, n, l], i) => (
            <div key={i} style={{ textAlign: "center", padding: 8, background: "var(--card-bg)", borderRadius: 0 }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 700, color: c }}>{n}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-sec)" }}>Signed up {fDate(u.signupDate)} · {daysSince(u.signupDate)} days</div>
      </div>
      <JuryScoreCard username={username} />
      {/* Citizen Badges */}
      <div className="ta-card">
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", marginBottom: 10, fontWeight: 700 }}>Badges</div>
        <CitizenBadges badges={computeBadges(u, allUsers, orgs, subs)} />
      </div>
      {/* Registered Digital Intelligences */}
      {diAgents.length > 0 && <div className="ta-card" style={{ borderLeft: "4px solid #4F46E5" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)", marginBottom: 8, fontWeight: 700 }}><Icon name="robot" size={12} /> Registered Digital Intelligences</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {diAgents.map(di => <UsernameLink key={di.username} username={di.username} onClick={onViewCitizen} style={{ fontSize: 12 }} />)}
        </div>
      </div>}
      {/* Recent submissions */}
      {userSubs.length > 0 && <div className="ta-card">
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", marginBottom: 8 }}>Recent Submissions ({userSubs.length})</div>
        {userSubs.slice(0, 10).map(sub => (
          <div key={sub.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>{sub.orgName} · {sDate(sub.createdAt)}</span>
              <StatusPill status={sub.status} />
            </div>
            <SubHeadline sub={sub} size={12} />
          </div>
        ))}
      </div>}
    </div>
  );
}

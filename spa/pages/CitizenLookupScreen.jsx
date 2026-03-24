import { useState, useEffect } from "react";
import { SK, ADMIN_USERNAME, PROFILES } from "../lib/constants";
import { sG } from "../lib/storage";
import { fDate, sDate, daysSince } from "../lib/utils";
import { computeProfile, computeBadges } from "../lib/scoring";
import { isDIUser } from "../lib/permissions";
import { Badge, CitizenBadges, StatusPill, SubHeadline, UsernameLink, Empty, Loader } from "../components/ui";
import JuryScoreCard from "../components/JuryScoreCard";

export default function CitizenLookupScreen({ username, onBack, onViewCitizen }) {
  const [u, setU] = useState(null);
  const [orgs, setOrgs] = useState({});
  const [subs, setSubs] = useState({});
  const [allUsers, setAllUsers] = useState({});
  const [diAgents, setDiAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const loadData = async () => {
    try {
      const all = (await sG(SK.USERS)) || {};
      setAllUsers(all);
      if (!username) { setLoading(false); return; }
      const target = all[username];
      if (!target) { setNotFound(true); setLoading(false); return; }
      setU(target);
      setOrgs((await sG(SK.ORGS)) || {});
      setSubs((await sG(SK.SUBS)) || {});
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

  // Search mode — no username provided
  if (!username) {
    const q = searchQuery.toLowerCase().replace(/^@/, "");
    const citizens = Object.values(allUsers).filter(u => !u.isDI);
    const filtered = q ? citizens.filter(c => (c.displayName || c.username).toLowerCase().includes(q) || c.username.toLowerCase().includes(q)) : citizens;
    const sorted = filtered.sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username));
    return (
      <div>
        <div className="ta-section-rule" />
        <h2 className="ta-section-head">Citizen Directory</h2>
        <div className="ta-field" style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Search citizens by name or username..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ fontSize: 14 }}
          />
        </div>
        {sorted.length === 0 ? (
          <Empty text={q ? `No citizens matching "${searchQuery}".` : "No citizens registered yet."} />
        ) : (
          <div>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 10, fontFamily: "var(--mono)" }}>{sorted.length} citizen{sorted.length !== 1 ? "s" : ""}</div>
            {sorted.slice(0, 50).map(c => (
              <div key={c.username} style={{ padding: "8px 0", borderBottom: "1px solid #E2E8F0", cursor: "pointer" }} onClick={() => onViewCitizen(c.username)}>
                <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 500 }}>@{c.displayName || c.username}</span>
                {c.username !== (c.displayName || c.username) && <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: 6 }}>({c.username})</span>}
              </div>
            ))}
            {sorted.length > 50 && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 10, textAlign: "center" }}>Showing first 50 of {sorted.length} citizens. Use search to narrow results.</div>}
          </div>
        )}
      </div>
    );
  }

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
              {isDIUser(u) ? <span style={{ marginRight: 6 }}>🤖</span> : u.username === ADMIN_USERNAME ? <span style={{ marginRight: 6 }}>👑</span> : null}
              @{u.displayName || u.username}
            </h3>
            {isDIUser(u) && <div style={{ marginTop: 4, fontSize: 12, fontFamily: "var(--mono)", color: "#4F46E5" }}>Digital Intelligence · Partner: <UsernameLink username={u.diPartner} onClick={onViewCitizen} /> · {u.diApproved ? "✓ Approved" : "⏳ Pending"}</div>}
          </div>
          <Badge profile={p.profile} score={p.trustScore} />
        </div>
        {myOrgs.length > 0 && <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {myOrgs.map(o => <span key={o.id} style={{ fontSize: 10, padding: "2px 7px", fontFamily: "var(--mono)", borderRadius: 8, background: o.isGeneralPublic ? "#F0FDFA" : "#F1F5F9", color: o.isGeneralPublic ? "#0D9488" : "#475569" }}>{o.isGeneralPublic ? "🏛" : "⬡"} {o.name}</span>)}
        </div>}
        <div style={{ marginTop: 14, padding: 12, background: "#F1F5F9", borderRadius: 8 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: pi.color, marginBottom: 4 }}>Profile: {p.profile}</div>
          <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.6 }}>{pi.desc}</div>
        </div>
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {[["#059669", p.wins, "Wins"], ["#DC2626", p.losses, "Losses"], ["#CA8A04", p.disputeWins, "Disp. Wins"], ["#0D9488", p.streak, "Streak"]].map(([c, n, l], i) => (
            <div key={i} style={{ textAlign: "center", padding: 8, background: "#F1F5F9", borderRadius: 8 }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 700, color: c }}>{n}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748B", marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>Signed up {fDate(u.signupDate)} · {daysSince(u.signupDate)} days</div>
      </div>
      <JuryScoreCard username={username} />
      {/* Citizen Badges */}
      <div className="ta-card">
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 10, fontWeight: 700 }}>🏅 Badges</div>
        <CitizenBadges badges={computeBadges(u, allUsers, orgs, subs)} />
      </div>
      {/* Registered Digital Intelligences */}
      {diAgents.length > 0 && <div className="ta-card" style={{ borderLeft: "4px solid #4F46E5" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4F46E5", marginBottom: 8, fontWeight: 700 }}>🤖 Registered Digital Intelligences</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {diAgents.map(di => <UsernameLink key={di.username} username={di.username} onClick={onViewCitizen} style={{ fontSize: 12 }} />)}
        </div>
      </div>}
      {/* Recent submissions */}
      {userSubs.length > 0 && <div className="ta-card">
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 8 }}>Recent Submissions ({userSubs.length})</div>
        {userSubs.slice(0, 10).map(sub => (
          <div key={sub.id} style={{ padding: "8px 0", borderBottom: "1px solid #E2E8F0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}>{sub.orgName} · {sDate(sub.createdAt)}</span>
              <StatusPill status={sub.status} />
            </div>
            <SubHeadline sub={sub} size={12} />
          </div>
        ))}
      </div>}
    </div>
  );
}

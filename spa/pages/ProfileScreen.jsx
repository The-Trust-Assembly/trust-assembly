import { useState, useEffect } from "react";
import { SK, ADMIN_USERNAME, MAX_ORGS, PROFILES } from "../lib/constants";
import { sG } from "../lib/storage";
import { fDate, sDate, daysSince } from "../lib/utils";
import { computeProfile, computeBadges, computeJuryScore } from "../lib/scoring";
import { hasActiveDeceptionPenalty, deceptionPenaltyRemaining, isDIUser, getTrustedProgress } from "../lib/permissions";
import { Badge, ScoreBreakdown, CitizenBadges, UsernameLink, StatusPill, SubHeadline, Icon } from "../components/ui";
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
  const [openRibbons, setOpenRibbons] = useState({ trust: true, subs: false, reviews: false, disputes: false, di: false, settings: false });
  const toggle = (key) => setOpenRibbons(prev => ({ ...prev, [key]: !prev[key] }));

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
  const mySubs = Object.values(allSubs).filter(s => s.submittedBy === user.username).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const approvedCount = mySubs.filter(s => ["approved", "consensus", "cross_review"].includes(s.status)).length;
  const rejectedCount = mySubs.filter(s => s.status === "rejected").length;

  if (loadError) return <div className="ta-error" style={{ margin: 20 }}>{loadError}</div>;

  const initials = (u.displayName || u.username || "??").slice(0, 2).toUpperCase();

  return (
    <div>
      {/* Profile header */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: "var(--bg)", flexShrink: 0 }}>{initials}</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{u.displayName || u.username}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>@{u.username} · Joined {fDate(u.signupDate)}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 8, padding: "2px 8px", background: "rgba(212,168,67,0.09)", border: "1px solid rgba(212,168,67,0.27)", color: "var(--gold)", fontWeight: 700 }}>{p.profile.toUpperCase()}</span>
            <span style={{ fontSize: 8, padding: "2px 8px", border: "1px solid var(--border)", color: "var(--text-sec)" }}>{myOrgs.length} assembl{myOrgs.length !== 1 ? "ies" : "y"}</span>
          </div>
        </div>
      </div>

      {/* Deception penalty */}
      {hasActiveDeceptionPenalty(u) && (
        <div style={{ padding: 10, background: "rgba(196,74,58,0.09)", border: "1px solid rgba(196,74,58,0.27)", marginBottom: 10 }}>
          <div style={{ fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: "var(--red)", fontWeight: 700, marginBottom: 4 }}>Deception Penalty — {deceptionPenaltyRemaining(u)} days remaining</div>
          <div style={{ fontSize: 10, color: "var(--text-sec)", lineHeight: 1.5 }}>Voting, sponsorship, and assembly creation suspended. You may still submit corrections.</div>
        </div>
      )}

      {/* Stats row */}
      <div className="stat-row">
        <div className="stat-card"><div className="stat-num" style={{ color: "var(--gold)" }}>{p.trustScore}</div><div className="stat-label">Global trust</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: "#fff" }}>{mySubs.length}</div><div className="stat-label">Submissions</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: "var(--green)" }}>{approvedCount}</div><div className="stat-label">Approved</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: "var(--red)" }}>{rejectedCount}</div><div className="stat-label">Rejected</div></div>
      </div>

      {/* 01: Trust by assembly */}
      <div className="ribbon">
        <div className={`ribbon-head ${openRibbons.trust ? "open" : "closed"}`} onClick={() => toggle("trust")}>
          <div><span className="ribbon-num">01</span><span className="ribbon-title">Trust by assembly</span></div>
          <span className="ribbon-arrow" style={{ transform: openRibbons.trust ? "rotate(180deg)" : "none" }}>▼</span>
        </div>
        {openRibbons.trust && (
          <div className="ribbon-body">
            {myOrgs.map(o => {
              const tp = getTrustedProgress(u, o.id);
              return (
                <div key={o.id} style={{ background: "var(--card-bg)", border: "1px solid rgba(212,168,67,0.27)", padding: 12, marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{o.name}</span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Role: <span style={{ color: "var(--gold)", fontWeight: 600 }}>{p.profile}</span> · Trust: <span style={{ color: "var(--gold)", fontWeight: 600 }}>{p.trustScore}</span></span>
                  </div>
                  <div className="trust-bar">
                    <div className="trust-top"><span className="trust-name">Trusted Contributor</span><span className="trust-count">{tp.current}/{tp.needed}</span></div>
                    <div className="trust-track"><div className="trust-fill" style={{ width: `${Math.min(100, (tp.current / tp.needed) * 100)}%` }} /></div>
                  </div>
                </div>
              );
            })}
            <ScoreBreakdown p={p} />
          </div>
        )}
      </div>

      {/* 02: My submissions */}
      <div className="ribbon">
        <div className={`ribbon-head ${openRibbons.subs ? "open" : "closed"}`} onClick={() => toggle("subs")}>
          <div><span className="ribbon-num">02</span><span className="ribbon-title">My submissions</span><span className="ribbon-meta">{mySubs.length} total</span></div>
          <span className="ribbon-arrow" style={{ transform: openRibbons.subs ? "rotate(180deg)" : "none" }}>▼</span>
        </div>
        {openRibbons.subs && (
          <div className="ribbon-body">
            <div style={{ fontSize: 10, color: "var(--text-sec)", marginBottom: 8 }}>{mySubs.length} total · {approvedCount} approved · {rejectedCount} rejected</div>
            {mySubs.slice(0, 20).map(sub => (
              <div key={sub.id} style={{ background: "var(--card-bg)", border: "1px solid var(--border)", padding: "10px 12px", marginBottom: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className={`type-badge ${sub.submissionType === "affirmation" ? "type-affirmation" : "type-correction"}`}>
                      {sub.submissionType === "affirmation" ? "AFFIRMATION" : "CORRECTION"}
                    </span>
                    <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{sub.orgName} · {sDate(sub.createdAt)}</span>
                  </div>
                  <StatusPill status={sub.status} />
                </div>
                <SubHeadline sub={sub} size={11} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 03: Jury score */}
      <div className="ribbon">
        <div className={`ribbon-head ${openRibbons.reviews ? "open" : "closed"}`} onClick={() => toggle("reviews")}>
          <div><span className="ribbon-num">03</span><span className="ribbon-title">My reviews</span></div>
          <span className="ribbon-arrow" style={{ transform: openRibbons.reviews ? "rotate(180deg)" : "none" }}>▼</span>
        </div>
        {openRibbons.reviews && (
          <div className="ribbon-body">
            <JuryScoreCard username={u.username} />
          </div>
        )}
      </div>

      {/* 04: Badges */}
      <div className="ribbon">
        <div className={`ribbon-head ${openRibbons.disputes ? "open" : "closed"}`} onClick={() => toggle("disputes")}>
          <div><span className="ribbon-num">04</span><span className="ribbon-title">Badges</span></div>
          <span className="ribbon-arrow" style={{ transform: openRibbons.disputes ? "rotate(180deg)" : "none" }}>▼</span>
        </div>
        {openRibbons.disputes && (
          <div className="ribbon-body">
            <CitizenBadges badges={computeBadges(u, allUsers, orgs, allSubs)} />
          </div>
        )}
      </div>

      {/* 05: DI Agents */}
      <div className="ribbon">
        <div className={`ribbon-head ${openRibbons.di ? "open" : "closed"}`} onClick={() => toggle("di")}>
          <div><span className="ribbon-num">05</span><span className="ribbon-title">Digital intelligence agents</span></div>
          <span className="ribbon-arrow" style={{ transform: openRibbons.di ? "rotate(180deg)" : "none" }}>▼</span>
        </div>
        {openRibbons.di && (
          <div className="ribbon-body">
            {diAgents.length === 0 ? (
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>No DI agents registered. Register an AI agent to pre-screen articles and prepare draft submissions.</div>
            ) : (
              diAgents.map(di => (
                <div key={di.username} style={{ background: "var(--card-bg)", border: "1px solid rgba(74,158,85,0.27)", padding: 12, marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>DI Agent: <UsernameLink username={di.username} onClick={onViewCitizen} /></div>
                    <span style={{ fontSize: 8, padding: "2px 6px", background: "rgba(74,158,85,0.09)", border: "1px solid rgba(74,158,85,0.27)", color: "var(--green)", fontWeight: 700 }}>{di.diApproved ? "ACTIVE" : "PENDING"}</span>
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)" }}>Registered {fDate(di.signupDate)}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 06: Settings */}
      <div className="ribbon">
        <div className={`ribbon-head ${openRibbons.settings ? "open" : "closed"}`} onClick={() => toggle("settings")}>
          <div><span className="ribbon-num">06</span><span className="ribbon-title">Settings</span></div>
          <span className="ribbon-arrow" style={{ transform: openRibbons.settings ? "rotate(180deg)" : "none" }}>▼</span>
        </div>
        {openRibbons.settings && (
          <div className="ribbon-body">
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "3px 12px", fontSize: 11 }}>
              {[["Username", "@" + u.username], ["Signed Up", fDate(u.signupDate)], ["Account Age", daysSince(u.signupDate) + " days"]].map(([l, v], i) => (
                <div key={i} style={{ display: "contents" }}>
                  <div style={{ color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", padding: "3px 0" }}>{l}</div>
                  <div style={{ color: "var(--text)", padding: "3px 0" }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, padding: 8, background: "var(--card-bg)", border: "1px solid var(--border)", fontSize: 9, color: "var(--text-muted)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--gold)" }}>Private to you:</strong> Name ({u.realName}), Email ({u.email || "—"}), Gender ({u.gender || "—"}), Location ({u.country ? (u.state ? u.state + ", " + u.country : u.country) : u.location || "—"}), Political Affiliation ({u.politicalAffiliation || "Not specified"}).
            </div>
          </div>
        )}
      </div>

      {/* Delete account */}
      <div style={{ margin: "16px 0 8px", padding: 14, border: "1px solid rgba(196,74,58,0.27)", background: "rgba(196,74,58,0.03)" }}>
        {!showDeleteConfirm ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--red)", marginBottom: 2 }}>Delete your account</div>
              <div style={{ fontSize: 10, color: "var(--text-sec)", lineHeight: 1.5 }}>This permanently removes your account, submissions, reviews, and trust score. This cannot be undone.</div>
            </div>
            <button onClick={() => setShowDeleteConfirm(true)} style={{ fontSize: 9, padding: "6px 14px", border: "1px solid var(--red)", color: "var(--red)", fontWeight: 700, cursor: "pointer", flexShrink: 0, marginLeft: 12, background: "none" }}>DELETE ACCOUNT</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "var(--red)", fontWeight: 700, marginBottom: 8 }}>Permanently Delete Account</div>
            <div style={{ fontSize: 10, color: "var(--text-sec)", lineHeight: 1.6, marginBottom: 8 }}>Type <strong style={{ color: "var(--text)" }}>@{u.username}</strong> to confirm:</div>
            <input value={deleteInput} onChange={e => setDeleteInput(e.target.value)} placeholder={"@" + u.username} className="field-input" style={{ maxWidth: 280, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 6 }}>
              <button disabled={deleteInput !== "@" + u.username || deleting} onClick={async () => {
                setDeleting(true);
                try {
                  const res = await fetch("/api/users/me/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmUsername: u.username }) });
                  if (res.ok) { await fetch("/api/auth/logout", { method: "POST" }); window.location.reload(); }
                  else { const d = await res.json().catch(() => ({})); alert(d.error || "Failed to delete account"); setDeleting(false); }
                } catch { alert("Network error"); setDeleting(false); }
              }} style={{ fontSize: 9, padding: "6px 14px", background: deleteInput === "@" + u.username && !deleting ? "var(--red)" : "var(--border)", color: deleteInput === "@" + u.username && !deleting ? "#fff" : "var(--text-muted)", border: "none", cursor: deleteInput === "@" + u.username && !deleting ? "pointer" : "not-allowed", fontWeight: 700 }}>{deleting ? "Deleting..." : "PERMANENTLY DELETE"}</button>
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }} className="btn-muted">CANCEL</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

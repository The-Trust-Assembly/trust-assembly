import { useState, useEffect } from "react";
import { BADGE_TIER_STYLES, SK, PROFILES, ADMIN_USERNAME } from "../lib/constants";
import { fDate } from "../lib/utils";
import { sG } from "../lib/storage";
import { W } from "../lib/scoring";

export function CitizenBadges({ badges }) {
  if (!badges || badges.length === 0) return (
    <div style={{ padding: 12, background: "#F1F5F9", borderRadius: 8, fontSize: 12, color: "#64748B", textAlign: "center" }}>
      <div style={{ fontStyle: "italic", marginBottom: 6 }}>No badges earned yet.</div>
      <div style={{ fontSize: 11, color: "#94A3B8" }}>Badges are earned automatically through participation: submissions, joining assemblies, earning trusted status, and more. Each badge adds +1 to your Trust Score.</div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {badges.map((b, i) => {
        const ts = BADGE_TIER_STYLES[b.tier] || BADGE_TIER_STYLES.special;
        return (
          <div key={b.id + (b.detail || "") + i} title={b.desc + (b.detail ? ` — ${b.detail}` : "")} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "4px 8px", borderRadius: 8,
            background: ts.bg, border: `1.5px solid ${ts.border}`,
            fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600,
            color: ts.text, letterSpacing: "0.03em", cursor: "default",
            transition: "transform 0.15s", whiteSpace: "nowrap",
          }}>
            <span style={{ fontSize: 13, lineHeight: 1 }}>{b.icon}</span>
            <span>{b.label}{b.detail ? ` — ${b.detail}` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ScoreBreakdown({ p }) {
  const rawPts = (p.wins * W.win + p.disputeWins * W.disputeWin + p.streakBonus);
  const sqrtPts = Math.sqrt(rawPts);
  const qRaw = (parseFloat(p.avgNews) + parseFloat(p.avgFun)) / W.qualityDivisor;
  const qCapped = Math.min(qRaw, W.qualityCap);
  const qFinal = Math.pow(qCapped, W.qualityExp);
  const dragVal = parseFloat(p.drag);
  const baseVal = sqrtPts * qFinal / dragVal;
  const cassVal = parseFloat(p.cassandraBonus) || 0;
  const box = (label, value, detail, color, bg) => (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "6px 10px", background: bg || "#F1F5F9", borderRadius: 8, border: `1.5px solid ${color}`, minWidth: 56 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.08em", color, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{typeof value === "number" ? value.toFixed(1) : value}</div>
      {detail && <div style={{ fontFamily: "var(--mono)", fontSize: 7, color: "#64748B", marginTop: 3, textAlign: "center", lineHeight: 1.3, maxWidth: 90 }}>{detail}</div>}
    </div>
  );
  const op = (symbol) => (
    <div style={{ display: "inline-flex", alignItems: "center", padding: "0 4px", fontFamily: "var(--serif)", fontSize: 20, color: "#94A3B8", fontWeight: 300 }}>{symbol}</div>
  );
  return (
    <div style={{ padding: 14, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8 }}>
      {/* Friendly header */}
      <div style={{ fontFamily: "var(--serif)", fontSize: 15, color: "#0F172A", lineHeight: 1.5, marginBottom: 12 }}>
        We know this looks complicated. It's just math for <strong style={{ color: "#CA8A04" }}>try your best to do the right thing</strong>.
      </div>
      {/* Variable legend */}
      <div style={{ padding: 10, background: "#F1F5F9", borderRadius: 8, marginBottom: 14, fontSize: 11, lineHeight: 1.7, color: "#475569" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748B", marginBottom: 6 }}>What the variables mean</div>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px" }}>
          <span style={{ fontFamily: "var(--mono)", color: "#059669", fontWeight: 700 }}>Points</span><span>Your wins, dispute wins, and streak bonus — how much good work you've done</span>
          <span style={{ fontFamily: "var(--mono)", color: "#059669", fontWeight: 700 }}>√</span><span>Square root — more work helps, but you can't grind your way to the top</span>
          <span style={{ fontFamily: "var(--mono)", color: "#0D9488", fontWeight: 700 }}>Quality</span><span>How important and interesting jurors rated your work (average of News + Fun)</span>
          <span style={{ fontFamily: "var(--mono)", color: "#DC2626", fontWeight: 700 }}>Drag</span><span>Your losses and lies — this divides your score, so mistakes pull you down</span>
          <span style={{ fontFamily: "var(--mono)", color: "#CA8A04", fontWeight: 700 }}>Cassandra</span><span>Bonus for being right when everyone said you were wrong (added on top)</span>
          <span style={{ fontFamily: "var(--mono)", color: "#2563EB", fontWeight: 700 }}>Badges</span><span>+1 per badge earned — achievements from participation, milestones, and trust</span>
        </div>
      </div>
      {/* Result line */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--serif)", fontSize: 28, fontWeight: 700, color: "#0F172A" }}>{p.trustScore}</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#64748B", lineHeight: 1.3 }}>Trust Score</div>
      </div>
      {/* Visual formula */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
        {box("√ Points", sqrtPts, `${p.wins}W + ${p.disputeWins > 0 ? p.disputeWins + "DW·" + W.disputeWin + " + " : ""}${p.streakBonus}str = √${rawPts.toFixed(0)}`, "#059669")}
        {op("×")}
        {box("Quality", qFinal, `${p.avgNews}+${p.avgFun} ÷ ${W.qualityDivisor}${qRaw > W.qualityCap ? " cap " + W.qualityCap : ""} ^${W.qualityExp}`, "#0D9488")}
        {op("÷")}
        {box("Drag", dragVal, `1 + √loss${p.lies > 0 ? " + " + p.lies + "×" + W.lieDrag + " lie" : ""}`, "#DC2626", "#FEF2F2")}
        {cassVal > 0 && op("+")}
        {cassVal > 0 && box("Cassandra", cassVal, `${p.vindications} vindication${p.vindications !== 1 ? "s" : ""}`, "#CA8A04", "#FFFBEB")}
        {p.badgeCount > 0 && op("+")}
        {p.badgeCount > 0 && box("Badges", p.badgeBonus, `${p.badgeCount} badge${p.badgeCount !== 1 ? "s" : ""}`, "#2563EB", "#EFF6FF")}
      </div>
      {/* Component breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, lineHeight: 1.6, color: "#475569" }}>
        <div style={{ padding: 8, background: "#ECFDF5", borderRadius: 8 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", color: "#059669", marginBottom: 3 }}>Points (numerator)</div>
          <div>{p.wins} win{p.wins !== 1 ? "s" : ""} × {W.win}</div>
          {p.disputeWins > 0 && <div>{p.disputeWins} dispute win{p.disputeWins > 1 ? "s" : ""} × {W.disputeWin}</div>}
          <div>{p.streakBonus} streak bonus <span style={{ fontSize: 9, color: "#64748B" }}>({p.streak} ÷ {W.streakInterval})</span></div>
          <div style={{ borderTop: "1px solid #05966940", marginTop: 4, paddingTop: 4, fontWeight: 700 }}>√{rawPts.toFixed(0)} = {sqrtPts.toFixed(2)}</div>
        </div>
        <div style={{ padding: 8, background: "#F0FDFA", borderRadius: 8 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", color: "#0D9488", marginBottom: 3 }}>Quality (multiplier)</div>
          <div>News: {p.avgNews} + Fun: {p.avgFun}</div>
          <div>Raw: {qRaw.toFixed(2)}{qRaw > W.qualityCap ? ` → capped ${W.qualityCap}` : ""}</div>
          <div style={{ borderTop: "1px solid #0D948840", marginTop: 4, paddingTop: 4, fontWeight: 700 }}>{qCapped.toFixed(2)}^{W.qualityExp} = {qFinal.toFixed(2)}</div>
        </div>
        <div style={{ padding: 8, background: "#FEF2F2", borderRadius: 8 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", color: "#DC2626", marginBottom: 3 }}>Drag (divisor)</div>
          <div>Base: 1.0</div>
          {(p.losses - p.lies) > 0 && <div>+ √ {(p.losses - p.lies)} losses × {W.lossDrag}{p.disputeLosses > 0 ? ` + √ ${p.disputeLosses} disp × ${W.failedDisputeDrag}` : ""}</div>}
          {p.disputeLosses > 0 && (p.losses - p.lies) <= 0 && <div>+ √ {p.disputeLosses} failed disp × {W.failedDisputeDrag}</div>}
          {p.lies > 0 && <div style={{ color: "#991B1B", fontWeight: 700 }}>+ {p.lies} lie{p.lies > 1 ? "s" : ""} × {W.lieDrag} = +{(p.lies * W.lieDrag).toFixed(1)}</div>}
          <div style={{ borderTop: "1px solid #DC262640", marginTop: 4, paddingTop: 4, fontWeight: 700 }}>Total drag: {dragVal.toFixed(1)}</div>
        </div>
        {cassVal > 0 ? (
          <div style={{ padding: 8, background: "#FFFBEB", borderRadius: 8 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", color: "#CA8A04", marginBottom: 3 }}>Cassandra Bonus</div>
            <div>{p.vindications} vindication{p.vindications !== 1 ? "s" : ""}</div>
            <div>base({W.vindicationBase}) × impact × persistence</div>
            <div style={{ borderTop: "1px solid #CA8A0440", marginTop: 4, paddingTop: 4, fontWeight: 700 }}>+{cassVal.toFixed(1)} additive</div>
          </div>
        ) : (
          <div style={{ padding: 8, background: "#F1F5F9", borderRadius: 8, opacity: 0.6 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", color: "#64748B", marginBottom: 3 }}>Cassandra Bonus</div>
            <div style={{ fontSize: 10, color: "#94A3B8" }}>No vindications yet. This additive bonus activates when you are disputed, lose, refuse to concede, and are later proven right.</div>
          </div>
        )}
        <div style={{ padding: 8, background: p.badgeCount > 0 ? "#EFF6FF" : "#F1F5F9", borderRadius: 8, opacity: p.badgeCount > 0 ? 1 : 0.6 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", color: p.badgeCount > 0 ? "#2563EB" : "#64748B", marginBottom: 3 }}>Badge Bonus</div>
          {p.badgeCount > 0 ? <><div>{p.badgeCount} badge{p.badgeCount !== 1 ? "s" : ""} earned</div><div style={{ borderTop: "1px solid #2563EB40", marginTop: 4, paddingTop: 4, fontWeight: 700 }}>+{p.badgeBonus} additive</div></> : <div style={{ fontSize: 10, color: "#94A3B8" }}>Earn badges through participation. Each badge adds +1 to your Trust Score.</div>}
        </div>
      </div>
      {/* Election note */}
      <div style={{ marginTop: 10, fontSize: 9, color: "#94A3B8", fontFamily: "var(--mono)", lineHeight: 1.5 }}>
        All weights are community-votable in future elections. Formula shape is permanent; coefficients are democratic.
      </div>
    </div>
  );
}

export function Badge({ profile, score }) {
  const p = PROFILES[profile] || PROFILES["New Citizen"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 8, border: `1.5px solid ${p.color}`, color: p.color, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.color }} />{profile} · {score}
    </span>
  );
}

export function SubHeadline({ sub, size = 14 }) {
  const isAffirm = sub.submissionType === "affirmation";
  const oh = sub.originalHeadline && typeof sub.originalHeadline === "object" ? JSON.stringify(sub.originalHeadline) : sub.originalHeadline;
  const rp = sub.replacement && typeof sub.replacement === "object" ? JSON.stringify(sub.replacement) : sub.replacement;
  const au = sub.author && typeof sub.author === "object" ? JSON.stringify(sub.author) : sub.author;
  return (
    <div>
      {isAffirm ? (
        <div style={{ fontFamily: "var(--serif)", fontSize: size, color: "#059669", fontWeight: 700, marginBottom: 2 }}>✓ {oh}</div>
      ) : (
        <>
          <div style={{ fontFamily: "var(--serif)", textDecoration: "line-through", textDecorationColor: "#DC2626", color: "#475569", marginBottom: 3, fontSize: size }}>{oh}</div>
          {rp && <div style={{ fontFamily: "var(--serif)", color: "#DC2626", fontWeight: 700, fontSize: size + 2, marginTop: 1 }}>{rp}</div>}
        </>
      )}
      {au && <div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)", marginTop: 2 }}>Author: {au}</div>}
    </div>
  );
}

export function StatusPill({ status }) {
  const m = { di_pending: { bg: "#EEF2FF", c: "#4F46E5", l: "🤖 DI Pre-Review" }, pending_jury: { bg: "#FFFBEB", c: "#D97706", l: "Awaiting Jury" }, pending_review: { bg: "#FFF7ED", c: "#EA580C", l: "Under Review" }, approved: { bg: "#ECFDF5", c: "#059669", l: "Approved" }, rejected: { bg: "#FEF2F2", c: "#DC2626", l: "Rejected" }, cross_review: { bg: "#F0FDFA", c: "#0D9488", l: "Cross-Group" }, consensus: { bg: "#F5F3FF", c: "#7C3AED", l: "Consensus" }, consensus_rejected: { bg: "#EBD5D3", c: "#991B1B", l: "Consensus Rejected" }, disputed: { bg: "#FFF7ED", c: "#EA580C", l: "⚖ Disputed" }, upheld: { bg: "#EA580C", c: "#fff", l: "Dispute Upheld" }, dismissed: { bg: "#ECFDF5", c: "#059669", l: "Dispute Dismissed" } };
  const s = m[status] || { bg: "#eee", c: "#666", l: typeof status === "string" ? status : "unknown" };
  return <span style={{ fontSize: 10, padding: "2px 7px", background: s.bg, color: s.c, borderRadius: 8, fontFamily: "var(--mono)", textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap" }}>{s.l}</span>;
}

export function LegalDisclaimer({ short }) {
  if (short) return <div style={{ fontSize: 10, color: "#475569", fontFamily: "var(--mono)", lineHeight: 1.6, padding: "6px 0" }}>Digital Citizens are solely responsible for the content of their submissions. The Trust Assembly makes no claims regarding the accuracy of any submission.</div>;
  return (
    <div style={{ fontSize: 10, color: "#475569", fontFamily: "var(--mono)", lineHeight: 1.5, padding: 12, background: "#F1F5F9", borderRadius: 8, border: "1px solid #E2E8F0" }}>
      <strong>Legal Notice:</strong> The Trust Assembly is a platform for collaborative fact-checking and editorial review. All corrections, annotations, and standing corrections are submitted by Digital Citizens and represent their individual assessments. The Trust Assembly does not independently verify submissions and makes no representations regarding the accuracy, completeness, or reliability of any user-submitted content. Digital Citizens bear sole responsibility for the content they submit. Jury decisions reflect peer consensus, not institutional endorsement.
    </div>
  );
}

export function AuditTrail({ entries }) {
  const [open, setOpen] = useState(false);
  if (!entries || !Array.isArray(entries) || entries.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen(!open)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#64748B", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", padding: 0 }}>{open ? "▾" : "▸"} Audit Trail ({entries.length})</button>
      {open && <div style={{ marginTop: 6, padding: 10, background: "#EFF6FF", borderLeft: "3px solid #2563EB", fontSize: 10, fontFamily: "var(--mono)", maxHeight: 180, overflowY: "auto" }}>
        {entries.map((e, i) => <div key={i} style={{ marginBottom: 3, color: "#1E293B", lineHeight: 1.6 }}><span style={{ color: "#475569" }}>{fDate(e.time)}</span> — {typeof e.action === "object" ? JSON.stringify(e.action) : e.action}</div>)}
      </div>}
    </div>
  );
}

export function CrestIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3L17 5.5V11C17 14.8 14.2 18.2 12 19.3C9.8 18.2 7 14.8 7 11V5.5L12 3Z" stroke="#B8963E" strokeWidth="0.8" fill="none"/>
      <path d="M12 2L14 8H10L12 2Z" fill="#B8963E" opacity="0.9"/>
      <rect x="10" y="8" width="4" height="10" rx="0.5" fill="#B8963E" opacity="0.8"/>
      <path d="M7 18H17L18 22H6L7 18Z" fill="#B8963E" opacity="0.7"/>
      <circle cx="12" cy="4" r="2.5" fill="none" stroke="#B8963E" strokeWidth="0.7" opacity="0.35"/>
      <circle cx="12" cy="4" r="4.5" fill="none" stroke="#B8963E" strokeWidth="0.4" opacity="0.18"/>
      <line x1="6" y1="5" x2="8.5" y2="5" stroke="#B8963E" strokeWidth="0.5" opacity="0.3"/>
      <line x1="15.5" y1="5" x2="18" y2="5" stroke="#B8963E" strokeWidth="0.5" opacity="0.3"/>
    </svg>
  );
}

export function LighthouseIcon({ size = 12, color = "#B8963E" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <path d="M12 2L14 8H10L12 2Z" fill={color} opacity="0.9"/>
      <rect x="10" y="8" width="4" height="10" rx="0.5" fill={color} opacity="0.8"/>
      <path d="M7 18H17L18 22H6L7 18Z" fill={color} opacity="0.7"/>
    </svg>
  );
}

export function TABadge({ text, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}>
      <LighthouseIcon size={10} color="#B8963E" />
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, fontWeight: 600, color: "#B8963E", letterSpacing: "0.04em" }}>TRUST ASSEMBLY</span>
      <span style={{ fontSize: 8.5, fontWeight: 700, color, backgroundColor: color + "18", padding: "1px 5px", borderRadius: 6, fontFamily: "monospace" }}>{text}</span>
    </div>
  );
}

export function AttrLine({ label, org, votes, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color, opacity: 0.65 }}>
      <span style={{ fontWeight: 600, letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>{org}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>{votes}</span>
    </div>
  );
}

export function CitizenCounter() {
  const [count, setCount] = useState(0);
  const [orgStats, setOrgStats] = useState({ total: 0, large: 0 });
  useEffect(() => {
    (async () => {
      const u = (await sG(SK.USERS)) || {};
      const o = (await sG(SK.ORGS)) || {};
      setCount(Object.keys(u).filter(k => !k.startsWith("_")).length);
      const orgs = Object.values(o);
      setOrgStats({ total: orgs.length, large: orgs.filter(x => x.members.length >= 100).length });
    })();
    const i = setInterval(async () => {
      const u = (await sG(SK.USERS)) || {};
      setCount(Object.keys(u).filter(k => !k.startsWith("_")).length);
    }, 8000);
    return () => clearInterval(i);
  }, []);

  const juryRulesActive = orgStats.large > 0;
  const consensusActive = orgStats.large >= 5;

  return (
    <div style={{ textAlign: "center", padding: "16px 0 8px", borderBottom: "1px solid #E2E8F0", marginBottom: 16 }}>
      <div style={{ fontFamily: "var(--serif)", fontSize: 32, fontWeight: 700, color: "#0F172A" }}>{count}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "#64748B", marginBottom: 8 }}>Digital Citizens Registered</div>
      {count < 100 && (
        <div style={{ margin: "0 auto 12px", maxWidth: 520, padding: "12px 16px", background: "#FEF3C7", border: "2px solid #D97706", borderRadius: 10, textAlign: "left", lineHeight: 1.7 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#92400E", fontWeight: 700, marginBottom: 6, textAlign: "center" }}>Wild West Rules in Effect Until the System Has 100 Users</div>
          <div style={{ fontSize: 12, color: "#78350F" }}>
            <div style={{ marginBottom: 3 }}>1. Any assembly with at least two members can have jurors assigned</div>
            <div style={{ marginBottom: 3 }}>2. Your submissions only require one random reviewer</div>
            <div>3. Findings of deliberate deception are disabled</div>
          </div>
        </div>
      )}
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, maxWidth: 520, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: juryRulesActive ? "#059669" : "#CBD5E1", display: "inline-block" }} />
          <span>Advanced Jury Selection Rules activate for assemblies with 100+ citizens {juryRulesActive && <span style={{ color: "#059669", fontWeight: 700 }}>ACTIVE</span>}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: consensusActive ? "#7C3AED" : "#CBD5E1", display: "inline-block" }} />
          <span>Consensus Juries activate with 5+ assemblies of 100+ citizens ({orgStats.large}/5) {consensusActive && <span style={{ color: "#7C3AED", fontWeight: 700 }}>ACTIVE</span>}</span>
        </div>
      </div>
    </div>
  );
}

export function RatingInput({ label, value, onChange, rubric }) {
  const r = rubric || {};
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 4 }}>{label}: <strong style={{ fontSize: 14, color: "#0F172A" }}>{value}</strong>/10</label>
      <input type="range" min="1" max="10" value={value} onChange={(e) => onChange(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#0F172A" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}><span>1 — Low</span><span>10 — High</span></div>
      {r[value] && <div style={{ marginTop: 6, padding: "6px 10px", background: "#F1F5F9", borderRadius: 8, fontSize: 12, color: "#1E293B", lineHeight: 1.6, borderLeft: `3px solid ${value <= 3 ? "#64748B" : value <= 6 ? "#D97706" : value <= 8 ? "#0D9488" : "#7C3AED"}` }}>
        <strong>{value}/10:</strong> {r[value]}
      </div>}
      <div style={{ marginTop: 4, fontSize: 10, color: "#94A3B8", fontStyle: "italic" }}>Slide to see the rubric for each level — these anchors help calibrate your judgment across jurors.</div>
    </div>
  );
}

export function DeliberateLieCheckbox({ checked, onChange }) {
  return (
    <div style={{ margin: "12px 0", padding: 12, background: "#FEF2F2", border: "1.5px solid #DC2626", borderRadius: 8 }}>
      <label style={{ display: "flex", gap: 10, cursor: "pointer", alignItems: "flex-start" }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: "#DC2626", marginTop: 3, flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#991B1B", fontWeight: 700, marginBottom: 3 }}>⚠ Deliberate Deception Finding</div>
          <div style={{ fontSize: 12, lineHeight: 1.6, color: "#1E293B" }}>By checking this box, I certify that I personally believe this submission to be a <strong>deliberate lie, a gross misrepresentation, or an omission of context with the intent to deceive.</strong> I understand that this is a secret ballot that will significantly impact the trust score of the submitting citizen — not the article author. A simple majority of jurors checking this box triggers a Deliberate Deception Finding.</div>
        </div>
      </label>
    </div>
  );
}

export function EvidenceFields({ evidence, onChange }) {
  const add = () => onChange([...evidence, { url: "", explanation: "" }]);
  const update = (i, k, v) => { const n = [...evidence]; n[i] = { ...n[i], [k]: v }; onChange(n); };
  const remove = (i) => onChange(evidence.filter((_, idx) => idx !== i));
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 6 }}>Supporting Evidence</div>
      {evidence.map((e, i) => (
        <div key={i} style={{ padding: 10, background: "#F1F5F9", border: "1px solid #E2E8F0", marginBottom: 6, borderRadius: 8, position: "relative" }}>
          {evidence.length > 1 && <button onClick={() => remove(i)} style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 14 }}>×</button>}
          <div className="ta-field" style={{ marginBottom: 6 }}><label>Evidence URL #{i + 1}</label><input value={e.url} onChange={ev => update(i, "url", ev.target.value)} placeholder="https://..." /></div>
          <div className="ta-field" style={{ marginBottom: 0 }}><label>Why does this support your argument?</label><textarea value={e.explanation} onChange={ev => update(i, "explanation", ev.target.value)} rows={2} placeholder="What this source proves..." /></div>
        </div>
      ))}
      <button className="ta-btn-ghost" onClick={add} style={{ fontSize: 12 }}>+ Add Evidence</button>
    </div>
  );
}

export function InviteCTA({ orgName, memberCount }) {
  const [copied, setCopied] = useState(false);
  const needed = Math.max(0, 5 - memberCount);
  if (needed <= 0) return null;
  return (
    <div style={{ margin: "20px 0", padding: 20, background: "#EFF6FF", borderRadius: 8, color: "#1E293B", border: "1.5px solid #BFDBFE" }}>
      <div style={{ fontSize: 10, fontFamily: "var(--font)", textTransform: "uppercase", letterSpacing: "0.15em", color: "#2563EB", marginBottom: 6, fontWeight: 600 }}>Action Required</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Your Assembly Needs {needed} More Member{needed !== 1 ? "s" : ""}</div>
      <p style={{ color: "#475569", fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>Jury review requires 5+ members in <strong style={{ color: "#0F172A" }}>{orgName}</strong>. Submissions are queued until then.</p>
      <p style={{ color: "#475569", fontSize: 12, lineHeight: 1.6, marginBottom: 12, fontStyle: "italic" }}>This is by design. Can you convince just four people that your Assembly has a perspective worth defending? If so, you've earned the right to operate. If not, you haven't been promoted — you've been tested.</p>
      <button style={{ background: "#CA8A04", color: "#fff", border: "none", padding: "8px 16px", fontFamily: "var(--mono)", fontSize: 12, cursor: "pointer", borderRadius: 8, textTransform: "uppercase", letterSpacing: "0.05em" }} onClick={() => { navigator.clipboard?.writeText(`Join my Trust Assembly "${orgName}" — a system where the only way to win is by serving the truth.`).then(() => setCopied(true)); setTimeout(() => setCopied(false), 2000); }}>{copied ? "✓ Copied!" : "Copy Invite"}</button>
    </div>
  );
}

export function InlineEditsForm({ edits, onChange }) {
  const MAX_EDITS = 20;
  const addEdit = () => { if (edits.length < MAX_EDITS) onChange([...edits, { original: "", replacement: "", reasoning: "" }]); };
  const updateEdit = (i, field, val) => { const n = [...edits]; n[i] = { ...n[i], [field]: val }; onChange(n); };
  const removeEdit = (i) => onChange(edits.filter((_, idx) => idx !== i));

  // Auto-add a new blank when last one has content
  useEffect(() => {
    if (edits.length === 0 || edits.length >= MAX_EDITS) return;
    const last = edits[edits.length - 1];
    if (last.original || last.replacement) {
      const hasEmpty = !last.original && !last.replacement && !last.reasoning;
      if (!hasEmpty) addEdit();
    }
  }, [edits]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569" }}>In-Line Article Edits</div>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: edits.filter(e => e.original.trim()).length >= MAX_EDITS ? "#DC2626" : "#64748B" }}>{edits.filter(e => e.original.trim()).length}/{MAX_EDITS}</div>
      </div>
      {edits.map((edit, i) => (
        <div key={i} style={{ padding: 12, background: i % 2 === 0 ? "#FFFFFF" : "#F1F5F9", border: "1px solid #E2E8F0", marginBottom: 8, borderRadius: 8, position: "relative" }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B", marginBottom: 6 }}>Edit #{i + 1}</div>
          {edits.length > 1 && <button onClick={() => removeEdit(i)} style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 14 }}>×</button>}
          <div className="ta-field" style={{ marginBottom: 8 }}><label style={{ fontSize: 10 }}>Original Text (copy from article)</label><textarea value={edit.original} onChange={(e) => updateEdit(i, "original", e.target.value)} rows={2} placeholder="Paste the exact text from the article you want to correct" /></div>
          <div className="ta-field" style={{ marginBottom: 8 }}><label style={{ fontSize: 10 }}>Replacement Text <span style={{ color: "#DC2626" }}>— red pen</span></label><textarea value={edit.replacement} onChange={(e) => updateEdit(i, "replacement", e.target.value)} rows={2} placeholder="Your corrected version" style={{ borderColor: "#DC2626" }} /></div>
          <div className="ta-field" style={{ marginBottom: 0 }}><label style={{ fontSize: 10 }}>Reasoning</label><input value={edit.reasoning} onChange={(e) => updateEdit(i, "reasoning", e.target.value)} placeholder="Why is the original wrong or misleading?" /></div>
        </div>
      ))}
      {edits.length === 0 && <button className="ta-btn-secondary" onClick={addEdit} style={{ marginBottom: 8 }}>+ Add In-Line Edit</button>}
    </div>
  );
}

export function StandingCorrectionInput({ value, onChange }) {
  return (
    <div style={{ padding: 16, background: "#EFF6FF", border: "1px solid #CBD5E1", borderRadius: 8 }}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 4 }}>Standing Correction (Reusable Fact)</div>
      <p style={{ fontSize: 12, color: "#475569", marginBottom: 10, lineHeight: 1.6 }}>A Standing Correction is an assertion of verified fact that your Assembly can reuse across multiple articles. Once approved, it enters your Assembly's Fact Vault. In the future, AI will suggest applicable Standing Corrections for new articles.</p>
      <div className="ta-field" style={{ marginBottom: 8 }}><label style={{ fontSize: 10 }}>Factual Assertion</label><textarea value={value.assertion || ""} onChange={(e) => onChange({ ...value, assertion: e.target.value })} rows={2} placeholder='e.g. "The XYZ recall involved a software font-size update, not a physical vehicle recall."' /></div>
      <div className="ta-field" style={{ marginBottom: 0 }}><label style={{ fontSize: 10 }}>Supporting Evidence / Source</label><input value={value.evidence || ""} onChange={(e) => onChange({ ...value, evidence: e.target.value })} placeholder="Link or citation supporting this fact" /></div>
    </div>
  );
}

export function UsernameLink({ username, onClick, style }) {
  return <button onClick={() => onClick && onClick(username)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#2563EB", fontSize: 11, textDecoration: "underline", textDecorationColor: "#CBD5E1", ...style }}>{username === ADMIN_USERNAME ? "👑 " : ""}@{username}</button>;
}

export function Empty({ text }) { return <div style={{ textAlign: "center", padding: 36, color: "#475569", fontSize: 13 }}>{text}</div>; }
export function Loader() { return <div style={{ textAlign: "center", padding: 36, color: "#475569", fontFamily: "var(--mono)", fontSize: 12 }}>Loading...</div>; }

export function ExplainBox({ title, children, color = "#0D9488", icon = "📘" }) {
  return (
    <div style={{ margin: "14px 0", padding: 14, background: "#F0F4F8", border: `1.5px solid ${color}40`, borderLeft: `4px solid ${color}`, borderRadius: 8 }}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.1em", color, fontWeight: 700, marginBottom: 6 }}>{icon} {title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: "#1E293B" }}>{children}</div>
    </div>
  );
}

export function HighlightField({ label, value, color, note, isTextarea }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{
        padding: "9px 11px", border: `1.5px solid ${color || "#CBD5E1"}`, background: "#FFFFFF",
        fontSize: 14, lineHeight: 1.5, color: "#0F172A", borderRadius: 6,
        minHeight: isTextarea ? 60 : "auto", whiteSpace: isTextarea ? "pre-wrap" : "normal",
      }}>{value}</div>
      {note && <div style={{ fontSize: 12, color: "#475569", marginTop: 3, fontStyle: "italic" }}>{note}</div>}
    </div>
  );
}

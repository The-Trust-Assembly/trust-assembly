import { useState, useEffect } from "react";
import { SK } from "../lib/constants";
import { fDate, hotScore } from "../lib/utils";
import { sG } from "../lib/storage";
import { Loader, Empty, StatusPill, SubHeadline, AuditTrail, LegalDisclaimer, UsernameLink } from "../components/ui";

export default function ConsensusScreen({ onViewCitizen }) {
  const [subs, setSubs] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { const s = (await sG(SK.SUBS)) || {}; setSubs(Object.values(s).filter(x => x.status === "consensus").sort((a, b) => hotScore(b) - hotScore(a))); setLoading(false); })(); }, []);
  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">The Consensus</h2>
      <div style={{ padding: 20, background: "#F5F3FF", border: "1px solid #9B7DB8", borderRadius: 8, marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.15em", color: "#7C3AED", marginBottom: 6 }}>The Highest Prize</div>
        <p style={{ fontFamily: "var(--serif)", fontSize: 16, lineHeight: 1.5, color: "#0F172A", margin: "0 0 8px" }}>A consensus correction has survived the gauntlet. The submitter's assembly approved it. Then members of <em>other</em> assemblies independently agreed.</p>
        <p style={{ fontSize: 13, color: "#1E293B", margin: 0, lineHeight: 1.6 }}>Only the truth has the property that all people can recognize it.</p>
      </div>
      {loading ? <Loader /> : subs.length === 0 ? <Empty text="No consensus corrections yet. When a correction survives cross-group review, it appears here." /> :
        subs.map(sub => (
          <div key={sub.id} className="ta-card" style={{ borderLeft: "4px solid #7C3AED" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}><UsernameLink username={sub.submittedBy} onClick={onViewCitizen} /> · {sub.orgName} · {fDate(sub.resolvedAt)}</span><StatusPill status="consensus" /></div>
            <a href={sub.url} target="_blank" rel="noopener" style={{ fontSize: 10, color: "#0D9488", wordBreak: "break-all" }}>{sub.url}</a>
            <div style={{ margin: "8px 0", padding: 10, background: "#F9FAFB", borderRadius: 8 }}>
              <SubHeadline sub={sub} />
            </div>
            <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.8, marginBottom: 10 }}>{sub.reasoning}</div>
            <AuditTrail entries={sub.auditTrail} />
            <LegalDisclaimer short />
          </div>
        ))}
    </div>
  );
}

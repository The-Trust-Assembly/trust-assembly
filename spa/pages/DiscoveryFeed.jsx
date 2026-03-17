import { useState, useEffect } from "react";
import { SK, ADMIN_USERNAME } from "../lib/constants";
import { sDate, hotScore } from "../lib/utils";
import { sG } from "../lib/storage";
import { StatusPill, SubHeadline, LegalDisclaimer } from "../components/ui";

export default function DiscoveryFeed({ onLogin, onRegister }) {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { const s = (await sG(SK.SUBS)) || {}; setSubs(Object.values(s).sort((a, b) => hotScore(b) - hotScore(a))); setLoading(false); })(); }, []);
  if (loading || subs.length === 0) return null;
  return (
    <div style={{ marginTop: 36 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ width: 40, height: 2, background: "#CA8A04", margin: "0 auto 10px" }} />
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 20, margin: "0 0 3px" }}>Live Corrections</h2>
        <p style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.12em", color: "#64748B" }}>Ranked by trust & recency</p>
      </div>
      <div style={{ maxHeight: 440, overflowY: "auto", border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff" }}>
        {subs.slice(0, 20).map((sub, i) => (
          <div key={sub.id} style={{ padding: "14px 16px", borderBottom: "1px solid #EFF6FF", display: "flex", gap: 12 }}>
            <div style={{ minWidth: 28, textAlign: "center", paddingTop: 2, fontFamily: "var(--serif)", fontSize: 16, fontWeight: 700, color: sub.status === "consensus" ? "#7C3AED" : sub.status === "approved" ? "#059669" : "#64748B" }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}>{sub.submittedBy === ADMIN_USERNAME ? "\u{1F451} " : ""}@{sub.submittedBy} · {sub.orgName} · {sDate(sub.createdAt)}</span>
                <StatusPill status={sub.status} />
              </div>
              <SubHeadline sub={sub} size={12} />
              <a href={sub.url} target="_blank" rel="noopener" style={{ fontSize: 10, color: "#0D9488", wordBreak: "break-all", display: "block", marginTop: 3 }}>{sub.url}</a>
              <button className="ta-link-btn" style={{ fontSize: 12, marginTop: 4 }} onClick={onLogin}>Sign in to review →</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: 14 }}><button className="ta-btn-primary" onClick={onRegister}>Become a Digital Citizen</button></div>
      <LegalDisclaimer short />
    </div>
  );
}

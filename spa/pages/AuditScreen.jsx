import { useState, useEffect } from "react";
import { SK } from "../lib/constants";
import { fDate } from "../lib/utils";
import { sG } from "../lib/storage";
import { Loader, Empty } from "../components/ui";

export default function AuditScreen() {
  const [audit, setAudit] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { setAudit([...((await sG(SK.AUDIT)) || [])].reverse()); setLoading(false); })(); }, []);
  if (loading) return <Loader />;
  return (
    <div>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Transparency Ledger</h2>
      <p style={{ color: "#475569", marginBottom: 16, fontSize: 14, lineHeight: 1.6 }}>Every action. Nothing hidden. Nothing deleted.</p>
      {(!audit || audit.length === 0) ? <Empty text="No activity." /> :
        <div style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{audit.map((e, i) => (
          <div key={i} style={{ padding: "6px 10px", background: i % 2 === 0 ? "#F1F5F9" : "#FFFFFF", borderBottom: "1px solid #E2E8F0", lineHeight: 1.4 }}>
            <span style={{ color: "#64748B" }}>{fDate(e.time)}</span><br />{e.action}
          </div>
        ))}</div>}
    </div>
  );
}

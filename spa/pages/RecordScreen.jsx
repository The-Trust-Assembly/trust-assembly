import React, { useState, useEffect } from "react";
import { SK } from "../lib/constants";
import { sG } from "../lib/storage";
import { Loader, Empty } from "../components/ui";
import RecordDetailView from "../components/RecordDetailView";

export default function RecordScreen({ recordId, onBack, onViewCitizen }) {
  const [sub, setSub] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { const s = (await sG(SK.SUBS)) || {}; setSub(s[recordId] || null); setLoading(false); })(); }, [recordId]);
  if (loading) return <Loader />;
  if (!sub) return <div><button className="ta-btn-ghost" onClick={onBack} style={{ marginBottom: 10 }}>← Back</button><Empty text="Record not found." /></div>;
  return (
    <div>
      <button className="ta-btn-ghost" onClick={onBack} style={{ marginBottom: 10 }}>← Back to Record</button>
      <div className="ta-section-rule" /><h2 className="ta-section-head">Record Detail</h2>
      <div className="ta-card" style={{ borderLeft: `4px solid ${sub.status === "consensus" ? "#7C3AED" : sub.status === "approved" ? "#059669" : sub.status === "rejected" || sub.status === "disputed" ? "#DC2626" : "#D97706"}` }}>
        <RecordDetailView sub={sub} onViewCitizen={onViewCitizen} />
      </div>
    </div>
  );
}

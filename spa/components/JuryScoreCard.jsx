import React, { useState, useEffect } from "react";
import { computeJuryScore } from "../lib/scoring";

export default function JuryScoreCard({ username }) {
  const [js, setJs] = useState(null);
  useEffect(() => { computeJuryScore(username).then(setJs); }, [username]);
  if (!js || js.totalReviews === 0) return null;
  const items = [
    ["#0D9488", js.totalReviews, "Reviews"],
    ["#059669", js.consensusRate !== null ? js.consensusRate + "%" : "—", "Consensus"],
    ["#DC2626", js.overturnRate !== null ? js.overturnRate + "%" : "—", "Overturned"],
    ["#CA8A04", js.accusationRate !== null ? js.accusationRate + "%" : "—", "Lie Accuracy"],
  ];
  // Consensus health indicator
  const cHealth = js.consensusRate === null ? null : js.consensusRate >= 50 && js.consensusRate <= 85 ? "Healthy range" : js.consensusRate > 85 ? "High — possible rubber-stamping" : "Low — frequent dissenter";
  return (
    <div className="ta-card" style={{ borderLeft: "4px solid #0D9488" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#0D9488", marginBottom: 8, fontWeight: 600 }}>⚖ Jury Score</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {items.map(([c, n, l], i) => (
          <div key={i} style={{ textAlign: "center", padding: 8, background: "var(--card-bg)", borderRadius: 0 }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, color: c }}>{n}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginTop: 3 }}>{l}</div>
          </div>
        ))}
      </div>
      {cHealth && <div style={{ fontSize: 10, color: "var(--text-sec)", marginTop: 6 }}>Consensus alignment: <strong>{cHealth}</strong> (50–85% is normal)</div>}
      {js.lieFlags > 0 && <div style={{ fontSize: 10, color: "var(--text-sec)", marginTop: 3 }}>Deception flags: {js.lieFlagsCorrect}/{js.lieFlags} confirmed by jury</div>}
      {js.overturnEligible > 0 && js.overturnRate > 0 && <div style={{ fontSize: 10, color: "var(--red)", marginTop: 3 }}>⚠ {js.overturned} of {js.overturnEligible} juries you served on were overturned by dispute</div>}
    </div>
  );
}

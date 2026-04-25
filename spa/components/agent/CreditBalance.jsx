import React, { useState, useEffect } from "react";

// Trust Assembly Agent — credit balance display
// ------------------------------------------------
// Shows the user's current credit balance and a buy button.
// Loaded via GET /api/agent/credits.

const PACKS = [
  { credits: 25, price: "$5", perRun: "$0.20" },
  { credits: 60, price: "$10", perRun: "$0.17" },
  { credits: 150, price: "$20", perRun: "$0.13" },
];

export default function CreditBalance() {
  const [credits, setCredits] = useState(null);
  const [showBuy, setShowBuy] = useState(false);
  const [buyMessage, setBuyMessage] = useState("");

  useEffect(() => {
    fetch("/api/agent/credits")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setCredits(data.credits);
      })
      .catch(() => {});
  }, []);

  async function handleBuy(packSize) {
    setBuyMessage("");
    try {
      const res = await fetch("/api/agent/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: packSize }),
      });
      const data = await res.json();
      setBuyMessage(data.message || "Purchase coming soon.");
    } catch {
      setBuyMessage("Network error.");
    }
  }

  if (credits === null) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setShowBuy(!showBuy)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 12px",
          background: credits > 0 ? "var(--bg)" : "rgba(196, 77, 77, 0.15)",
          border: `1px solid ${credits > 0 ? "var(--border)" : "var(--red)"}`,
          borderRadius: 14,
          cursor: "pointer",
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: credits > 0 ? "var(--text)" : "var(--red)",
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: credits >= 5 ? "var(--green)" : credits > 0 ? "var(--gold)" : "var(--red)",
        }} />
        {credits} credit{credits === 1 ? "" : "s"}
      </button>

      {showBuy && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "16px 20px",
            width: 280,
            zIndex: 100,
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          }}
        >
          <div style={{
            fontFamily: "var(--serif)", fontSize: 14, fontWeight: 600,
            color: "var(--text)", marginBottom: 4,
          }}>
            Agent Credits
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
            Each run costs 1-3 credits depending on scope and platform count.
            You have <strong style={{ color: "var(--text)" }}>{credits}</strong> credit{credits === 1 ? "" : "s"} remaining.
          </div>

          {PACKS.map((pack) => (
            <button
              key={pack.credits}
              onClick={() => handleBuy(pack.credits)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                padding: "8px 12px",
                marginBottom: 6,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
                color: "var(--text)",
              }}
            >
              <span>
                <strong>{pack.credits} credits</strong>
                <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>({pack.perRun}/run)</span>
              </span>
              <span style={{
                fontFamily: "var(--mono)", fontWeight: 600,
                color: "var(--gold)",
              }}>
                {pack.price}
              </span>
            </button>
          ))}

          {buyMessage && (
            <div style={{
              marginTop: 8, padding: "8px 10px",
              background: "var(--bg)", borderRadius: 4,
              fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5,
            }}>
              {buyMessage}
            </div>
          )}

          <button
            onClick={() => setShowBuy(false)}
            style={{
              marginTop: 8, width: "100%", padding: "6px",
              border: "none", background: "transparent",
              color: "var(--text-muted)", fontSize: 11, cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

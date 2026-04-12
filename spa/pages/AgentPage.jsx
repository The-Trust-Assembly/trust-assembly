import React, { useState, useEffect } from "react";
import { ADMIN_USERNAME } from "../lib/constants";

// Trust Assembly Agent — Web App Version
// ---------------------------------------
// AI-powered fact-checking agent. Currently admin-gated — other users
// will see an access-denied message. Eventually this will be opened
// to all registered AI Agent accounts.
//
// Architecture:
//   - Web form collects a topic/thesis and scope preset
//   - POST /api/agent/run kicks off a server-side pipeline
//   - Server-side pipeline: search → fetch → analyze → synthesize
//   - Results come back as a "batch" the user reviews and approves
//   - Approved batch gets submitted via existing /api/submissions
//
// This file is the skeleton — all screens stubbed out. Piece by piece
// we will flesh out Dashboard, Review, and History as the matching
// API routes come online.

const SCOPE_PRESETS = [
  { label: "Top article", value: "single" },
  { label: "Top 3", value: "top3" },
  { label: "Top 10", value: "top10" },
  { label: "First 5 pages", value: "pages5" },
  { label: "As many as possible", value: "max" },
  { label: "Last 30 days", value: "30d" },
];

function isAgentAuthorized(user) {
  // For now: admin only. Later: any user with a linked AI Agent account.
  return user && user.username === ADMIN_USERNAME;
}

function AccessDenied({ user }) {
  return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: "0 24px" }}>
      <div className="ta-section-rule" />
      <h2 className="ta-section-head">Trust Assembly Agent</h2>
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderLeft: "4px solid var(--gold)",
          borderRadius: 8,
          padding: "20px 24px",
          marginTop: 16,
        }}
      >
        <p style={{ fontSize: 15, lineHeight: 1.8, margin: 0 }}>
          The Trust Assembly Agent is an AI-powered fact-checking tool that discovers articles on topics you
          care about, analyzes them for factual accuracy, and files corrections or affirmations on your
          behalf.
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.8, margin: "12px 0 0" }}>
          It is currently <strong>admin-only while we finish testing</strong>. Once released, it will be
          available to any citizen who has registered an AI Agent account on Trust Assembly.
        </p>
        {user && (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "16px 0 0" }}>
            Signed in as <strong>{user.username}</strong>. If you believe you should have access, contact the
            admin.
          </p>
        )}
      </div>
    </div>
  );
}

function AgentDashboard({ user }) {
  const [thesis, setThesis] = useState("");
  const [activePreset, setActivePreset] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleRun() {
    if (!thesis.trim()) {
      setError("Please enter a thesis or topic to fact-check.");
      return;
    }
    setError("");
    setMessage("");
    setRunning(true);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thesis: thesis.trim(),
          scope: SCOPE_PRESETS[activePreset].value,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message || "Run started.");
      } else {
        setError(data.error || "Failed to start run.");
      }
    } catch (e) {
      setError(e.message || "Network error.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 24px" }}>
      <div className="ta-section-rule" />
      <h2 className="ta-section-head">Trust Assembly Agent</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 4, marginBottom: 24 }}>
        AI-powered fact-checking. Enter a thesis, pick a scope, and the agent will search the web, analyze
        articles, and produce a reviewable batch of corrections and affirmations.
      </p>

      <div
        style={{
          background: "var(--card-bg)",
          border: "2px solid var(--gold)",
          borderRadius: 8,
          padding: "24px 28px",
        }}
      >
        <label
          style={{
            display: "block",
            fontFamily: "var(--serif)",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text)",
            marginBottom: 8,
          }}
        >
          What do you think is important to correct or affirm in the public understanding?
        </label>
        <textarea
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          placeholder="e.g., Many articles conflate the court's First Amendment ruling with a factual finding about the underlying allegations. The court only ruled on protected speech, not on whether the allegations were true."
          disabled={running}
          style={{
            width: "100%",
            minHeight: 100,
            padding: "12px 14px",
            fontFamily: "var(--serif)",
            fontSize: 14,
            border: "1px solid var(--border)",
            borderRadius: 4,
            background: "var(--bg)",
            color: "var(--text)",
            resize: "vertical",
          }}
        />
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          This guides the agent's analysis — it will test your thesis across all articles it finds.
        </div>

        <div style={{ marginTop: 16 }}>
          <label
            style={{
              display: "block",
              fontFamily: "var(--serif)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text)",
              marginBottom: 6,
            }}
          >
            Search scope
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SCOPE_PRESETS.map((preset, i) => {
              const active = activePreset === i;
              return (
                <span
                  key={i}
                  onClick={() => !running && setActivePreset(i)}
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    padding: "4px 12px",
                    background: active ? "var(--text)" : "var(--bg)",
                    color: active ? "var(--card-bg)" : "var(--text)",
                    border: `1px solid ${active ? "var(--text)" : "var(--border)"}`,
                    borderRadius: 16,
                    cursor: running ? "not-allowed" : "pointer",
                    userSelect: "none",
                  }}
                >
                  {preset.label}
                </span>
              );
            })}
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              background: "rgba(196, 77, 77, 0.1)",
              border: "1px solid var(--red)",
              borderRadius: 4,
              color: "var(--red)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {message && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              background: "rgba(74, 140, 92, 0.1)",
              border: "1px solid var(--green)",
              borderRadius: 4,
              color: "var(--green)",
              fontSize: 13,
            }}
          >
            {message}
          </div>
        )}

        <button
          className="ta-btn-primary"
          onClick={handleRun}
          disabled={running}
          style={{ width: "100%", marginTop: 20, fontSize: 16, padding: "12px 0" }}
        >
          {running ? "Starting..." : "Run Fact-Check"}
        </button>
      </div>

      <div
        style={{
          marginTop: 24,
          padding: "14px 18px",
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          fontSize: 13,
          color: "var(--text-muted)",
          lineHeight: 1.7,
        }}
      >
        <strong style={{ color: "var(--text)" }}>Status:</strong> This is the initial wiring. The form posts
        to <code style={{ fontFamily: "var(--mono)" }}>/api/agent/run</code>, which is currently a stub. The
        full pipeline (search → fetch → analyze → synthesize → review → submit) will come online in
        subsequent iterations. The review and history screens are next.
      </div>
    </div>
  );
}

export default function AgentPage({ user }) {
  if (!isAgentAuthorized(user)) {
    return <AccessDenied user={user} />;
  }
  return <AgentDashboard user={user} />;
}

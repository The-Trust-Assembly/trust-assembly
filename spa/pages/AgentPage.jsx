import React, { useState, useEffect, useCallback } from "react";
import { ADMIN_USERNAME } from "../lib/constants";
import AgentReviewPanel from "./AgentReviewPanel";
import AgentTabBar from "../components/agent/AgentTabBar";
import AgentIcon from "../components/agent/AgentIcon";
import AgentNewForm from "../components/agent/AgentNewForm";
import SentinelDashboard from "../components/agent/SentinelDashboard";
import AgentSettings from "../components/agent/AgentSettings";

// Trust Assembly Agent — main page
// ----------------------------------
// Top-level container for the agent workspace. Manages:
//   - Agent instance list (loaded from /api/agent/instances)
//   - Active tab state (onetime / new / UUID)
//   - Page state within each tab (dashboard / settings / review)
//
// Currently admin-gated. Stage G will lift this to "any user with a
// registered AI Agent account."
//
// Routing within this page:
//   activeTab === "onetime"  → one-time placeholder (Stage F will implement)
//   activeTab === "new"      → AgentNewForm (create a new agent)
//   activeTab === <uuid>     → either SentinelDashboard / Phantom / Ward
//                              (dashboard), AgentSettings, or
//                              AgentReviewPanel depending on activePage
//
// Phantom and Ward dashboards are placeholders in Stage B — they show
// a "coming soon" card since the real type-specific flows arrive in
// Stages D and E.

function isAgentAuthorized(user) {
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
          The Trust Assembly Agent is an AI-powered fact-checking tool that discovers articles on
          topics you care about, analyzes them for factual accuracy, and files corrections or
          affirmations on your behalf.
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.8, margin: "12px 0 0" }}>
          It is currently <strong>admin-only while we finish testing</strong>. Once released, it
          will be available to any citizen who has registered an AI Agent account on Trust
          Assembly.
        </p>
        {user && (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "16px 0 0" }}>
            Signed in as <strong>{user.username}</strong>. If you believe you should have access,
            contact the admin.
          </p>
        )}
      </div>
    </div>
  );
}

function OneTimePlaceholder() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
      <h2 className="ta-section-head">One-Time Fact-Check</h2>
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px dashed var(--border)",
          borderRadius: 8,
          padding: "24px 28px",
          marginTop: 16,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1.7,
        }}
      >
        The one-time flow (Stage F) lets users without an account run a single fact-check by email.
        <br />
        <span style={{ fontSize: 12, opacity: 0.7 }}>Coming in a later stage.</span>
      </div>
    </div>
  );
}

function TypeDashboardPlaceholder({ agent, stage }) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
      <h2 className="ta-section-head">{agent.name}</h2>
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px dashed var(--border)",
          borderRadius: 8,
          padding: "24px 28px",
          marginTop: 16,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1.7,
        }}
      >
        <AgentIcon type={agent.type} size={48} color={agent.color} />
        <div style={{ marginTop: 12, textTransform: "capitalize", fontWeight: 600, color: "var(--text)" }}>
          {agent.type} dashboard
        </div>
        <div style={{ marginTop: 6 }}>
          This agent type is wired up in {stage}. For now you can edit its Settings.
        </div>
      </div>
    </div>
  );
}

export default function AgentPage({ user }) {
  const [instances, setInstances] = useState([]);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("onetime"); // "onetime" | "new" | <uuid>
  const [activePage, setActivePage] = useState("dashboard"); // "dashboard" | "settings" | "review"
  const [reviewingRunId, setReviewingRunId] = useState(null);

  const authorized = isAgentAuthorized(user);

  const loadInstances = useCallback(async () => {
    if (!authorized) return;
    try {
      const res = await fetch("/api/agent/instances");
      if (res.ok) {
        const data = await res.json();
        setInstances(data.instances || []);
      } else {
        setLoadError("Failed to load agent instances.");
      }
    } catch (e) {
      setLoadError(e.message || "Network error.");
    } finally {
      setLoadingInstances(false);
    }
  }, [authorized]);

  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  if (!authorized) {
    return <AccessDenied user={user} />;
  }

  const activeAgent =
    activeTab !== "onetime" && activeTab !== "new"
      ? instances.find((i) => i.id === activeTab)
      : null;

  function handleTabSelect(id) {
    setActiveTab(id);
    setReviewingRunId(null);
    // When selecting an agent instance that's still in 'setup', jump
    // straight to Settings so they can configure it.
    const inst = instances.find((i) => i.id === id);
    if (inst && inst.status === "setup") {
      setActivePage("settings");
    } else {
      setActivePage("dashboard");
    }
  }

  function handleCreateNew() {
    setActiveTab("new");
    setActivePage("dashboard");
    setReviewingRunId(null);
  }

  async function handleInstanceCreated(newInstance) {
    // Refresh list and switch to the new tab in setup mode
    await loadInstances();
    setActiveTab(newInstance.id);
    setActivePage("settings");
  }

  function handleInstanceUpdated(updated) {
    setInstances((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  async function handleInstanceDeleted(deletedId) {
    await loadInstances();
    setActiveTab("onetime");
    setActivePage("dashboard");
  }

  function handleReview(runId) {
    setReviewingRunId(runId);
    setActivePage("review");
  }

  // Render the review panel as an overlay on top of the workspace when
  // the user is reviewing a run
  if (activePage === "review" && reviewingRunId) {
    return (
      <AgentReviewPanel
        runId={reviewingRunId}
        onBack={() => {
          setReviewingRunId(null);
          setActivePage("dashboard");
        }}
        onCompleted={() => {
          // Stay on the success screen; user clicks "Back to Agent"
        }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "20px 24px 16px",
          borderBottom: "2px solid var(--gold)",
          marginBottom: 24,
        }}
      >
        <img
          src="/icons/Golden lighthouse emblem with laurel wreath.png"
          alt="Trust Assembly"
          style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }}
        />
        <div style={{ flex: 1 }}>
          <h1
            style={{
              fontFamily: "var(--serif)",
              color: "var(--text)",
              fontSize: 26,
              margin: 0,
              letterSpacing: 0.5,
            }}
          >
            Trust Assembly Agent
          </h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
            Truth Will Out.
          </div>
        </div>
        {activeAgent && activeAgent.status !== "setup" && (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span
              onClick={() => setActivePage("dashboard")}
              style={{
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 14,
                fontFamily: "var(--serif)",
                padding: "4px 10px",
                borderRadius: 4,
                background: activePage === "dashboard" ? "var(--card-bg)" : "transparent",
                borderBottom:
                  activePage === "dashboard" ? "2px solid var(--gold)" : "2px solid transparent",
              }}
            >
              Dashboard
            </span>
            <span
              onClick={() => setActivePage("settings")}
              style={{
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 14,
                fontFamily: "var(--serif)",
                padding: "4px 10px",
                borderRadius: 4,
                background: activePage === "settings" ? "var(--card-bg)" : "transparent",
                borderBottom:
                  activePage === "settings" ? "2px solid var(--gold)" : "2px solid transparent",
              }}
            >
              Settings
            </span>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ padding: "0 24px" }}>
        {loadingInstances ? (
          <div
            style={{
              padding: "10px 16px",
              color: "var(--text-muted)",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            Loading agents…
          </div>
        ) : (
          <AgentTabBar
            instances={instances}
            activeId={activeTab}
            onSelect={handleTabSelect}
            onCreateNew={handleCreateNew}
          />
        )}
      </div>

      {loadError && (
        <div
          style={{
            margin: "10px 24px",
            padding: "10px 14px",
            background: "rgba(196, 77, 77, 0.1)",
            border: "1px solid var(--red)",
            borderRadius: 4,
            color: "var(--red)",
            fontSize: 13,
          }}
        >
          {loadError}
        </div>
      )}

      {/* Tab content */}
      <div style={{ padding: "24px 0" }}>
        {activeTab === "onetime" && <OneTimePlaceholder />}

        {activeTab === "new" && (
          <AgentNewForm
            onCreated={handleInstanceCreated}
            onCancel={() => {
              setActiveTab("onetime");
              setActivePage("dashboard");
            }}
          />
        )}

        {activeAgent && activePage === "dashboard" && (
          <>
            {activeAgent.type === "sentinel" && (
              <SentinelDashboard agent={activeAgent} onReview={handleReview} />
            )}
            {activeAgent.type === "phantom" && (
              <TypeDashboardPlaceholder agent={activeAgent} stage="Stage D" />
            )}
            {activeAgent.type === "ward" && (
              <TypeDashboardPlaceholder agent={activeAgent} stage="Stage E" />
            )}
          </>
        )}

        {activeAgent && activePage === "settings" && (
          <AgentSettings
            agent={activeAgent}
            onUpdated={handleInstanceUpdated}
            onDeleted={handleInstanceDeleted}
          />
        )}
      </div>
    </div>
  );
}

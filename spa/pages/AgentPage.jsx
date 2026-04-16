import React, { useState, useEffect, useCallback } from "react";
import { ADMIN_USERNAME } from "../lib/constants";
import AgentReviewPanel from "./AgentReviewPanel";
import AgentTabBar from "../components/agent/AgentTabBar";
import AgentNewForm from "../components/agent/AgentNewForm";
import SentinelDashboard from "../components/agent/SentinelDashboard";
import PhantomDashboard from "../components/agent/PhantomDashboard";
import WardDashboard from "../components/agent/WardDashboard";
import OneTimeDashboard from "../components/agent/OneTimeDashboard";
import AgentSettings from "../components/agent/AgentSettings";

// Trust Assembly Agent — main page
// ----------------------------------
// Two access levels:
//   1. Any logged-in user → One-Time quick fact-check (no tab bar,
//      no agent instances, just the OneTimeDashboard)
//   2. Full access (admin OR agent-access flag enabled) → full tab
//      bar with all agent types, instances, settings, etc.
//
// Stage G adds an admin button that toggles the agent-access flag,
// promoting all logged-in users to full access.

// Any logged-in user can use the agent page (one-time mode at minimum)
function isLoggedIn(user) {
  return !!user;
}

// Full access: admin, or the agent-access flag is enabled for all users
function hasFullAccess(user, agentAccessEnabled) {
  if (!user) return false;
  if (user.username === ADMIN_USERNAME) return true;
  return !!agentAccessEnabled;
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

export default function AgentPage({ user }) {
  const [instances, setInstances] = useState([]);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("onetime"); // "onetime" | "new" | <uuid>
  const [activePage, setActivePage] = useState("dashboard"); // "dashboard" | "settings" | "review"
  const [reviewingRunId, setReviewingRunId] = useState(null);
  const [agentAccessEnabled, setAgentAccessEnabled] = useState(false);

  const loggedIn = isLoggedIn(user);
  const fullAccess = hasFullAccess(user, agentAccessEnabled);

  // Check if agent access has been enabled for all users (Stage G flag)
  useEffect(() => {
    fetch("/api/admin/agent-access")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data && data.enabled) setAgentAccessEnabled(true);
      })
      .catch(() => {}); // Silently fail — defaults to admin-only
  }, []);

  const loadInstances = useCallback(async () => {
    if (!fullAccess) return;
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
  }, [fullAccess]);

  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  // Not logged in at all → access denied
  if (!loggedIn) {
    return <AccessDenied user={user} />;
  }

  // Logged in but no full access → show One-Time only (no tab bar)
  if (!fullAccess) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
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
        </div>
        <div style={{ padding: "24px 0" }}>
          <OneTimeDashboard
            onReview={(runId) => {
              setReviewingRunId(runId);
              setActivePage("review");
            }}
          />
        </div>
      </div>
    );
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
        {activeTab === "onetime" && <OneTimeDashboard onReview={handleReview} />}

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
              <PhantomDashboard agent={activeAgent} onReview={handleReview} />
            )}
            {activeAgent.type === "ward" && (
              <WardDashboard agent={activeAgent} onReview={handleReview} />
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

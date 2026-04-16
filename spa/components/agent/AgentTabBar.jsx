import React, { useState } from "react";
import AgentIcon from "./AgentIcon";

// Trust Assembly Agent — tab bar
// ---------------------------------
// Horizontal tab bar across the top of the agent workspace. Shows:
//   1. One-Time tab (always first)
//   2. One tab per user's agent instance
//   3. "+" tab for creating a new agent (hidden when at the 12-instance cap)
//
// The active tab "lifts out" of the navy bar with a linen background and a
// gold accent stripe; inactive tabs are icon-only with reduced opacity and
// a hover tooltip showing name / type / domain / reputation.
//
// Props:
//   instances           — list of agent instances from /api/agent/instances
//   activeId            — id of the active tab ("onetime" | "new" | UUID)
//   onSelect(id)        — called when a tab is clicked
//   onCreateNew()       — called when the "+" tab is clicked (optional;
//                         if omitted, selecting "new" is handled by parent)
//   maxInstances        — default 12, per requirements §3.4
//
// Note: we do NOT handle status=='setup' styling specially; the parent
// component decides whether to show the dashboard or settings based on
// the agent's status.

const TYPE_LABELS = {
  sentinel: "Sentinel",
  phantom: "Phantom",
  ward: "Ward",
};

export default function AgentTabBar({
  instances = [],
  activeId,
  onSelect,
  onCreateNew,
  maxInstances = 12,
}) {
  const [hoveredId, setHoveredId] = useState(null);

  // Fixed "one-time" pseudo-tab is always first
  const tabs = [
    { id: "onetime", type: "onetime", name: "One-Time", subtitle: "Quick fact-check", isSynthetic: true },
    ...instances.map((inst) => ({
      id: inst.id,
      type: inst.type,
      name: inst.name,
      subtitle:
        inst.status === "setup"
          ? "setup"
          : `${TYPE_LABELS[inst.type] || inst.type}${inst.domain ? " · " + inst.domain : ""}`,
      status: inst.status,
      reputation: inst.reputation,
      color: inst.color,
    })),
  ];

  const atCap = instances.length >= maxInstances;
  const showNewTab = !atCap;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        background: "var(--text)",
        borderRadius: "10px 10px 0 0",
        padding: "0 6px",
        overflow: "hidden",
        flexWrap: "wrap",
      }}
    >
      {tabs.map((tab, idx) => {
        const active = tab.id === activeId;
        const hovered = hoveredId === tab.id;
        const showDivider = idx > 0;
        const divider = showDivider ? (
          <span
            key={"div-" + tab.id}
            style={{
              width: 1,
              alignSelf: "center",
              height: 22,
              background: "var(--gold)",
              opacity: 0.35,
              flexShrink: 0,
            }}
          />
        ) : null;

        if (active) {
          return (
            <React.Fragment key={tab.id}>
              {divider}
              <button
                onClick={() => onSelect && onSelect(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 18px",
                  marginTop: 4,
                  border: "none",
                  background: "var(--card-bg)",
                  cursor: "default",
                  borderRadius: "8px 8px 0 0",
                  whiteSpace: "nowrap",
                  position: "relative",
                  zIndex: 2,
                  boxShadow: "0 -2px 6px rgba(0,0,0,0.1)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 8,
                    right: 8,
                    height: 3,
                    borderRadius: "0 0 2px 2px",
                    background: "var(--gold)",
                  }}
                />
                <AgentIcon
                  type={tab.type}
                  size={26}
                  color={tab.color}
                  showStatus
                  active={tab.status === "active"}
                />
                <div style={{ textAlign: "left" }}>
                  <div
                    style={{
                      fontFamily: "var(--serif)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text)",
                      lineHeight: 1.2,
                    }}
                  >
                    {tab.name}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      color: "var(--text-muted)",
                      lineHeight: 1.2,
                    }}
                  >
                    {tab.subtitle}
                  </div>
                </div>
                {tab.reputation != null && tab.reputation > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      color: "var(--gold)",
                      marginLeft: 4,
                    }}
                  >
                    ★ {tab.reputation}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={tab.id}>
            {divider}
            <div
              style={{ position: "relative", display: "flex", alignItems: "stretch" }}
              onMouseEnter={() => setHoveredId(tab.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                onClick={() => onSelect && onSelect(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 12px",
                  border: "none",
                  background: hovered ? "rgba(255,255,255,0.08)" : "transparent",
                  cursor: "pointer",
                  borderRadius: "6px 6px 0 0",
                  transition: "background 0.15s ease",
                }}
              >
                <span
                  style={{
                    opacity: hovered ? 0.9 : 0.5,
                    transition: "opacity 0.15s ease",
                    display: "flex",
                  }}
                >
                  <AgentIcon type={tab.type} size={26} color={tab.color} />
                </span>
              </button>
              {hovered && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    marginTop: 4,
                    background: "var(--text)",
                    border: "1px solid " + "rgba(184,148,62,0.33)",
                    borderRadius: 6,
                    padding: "8px 12px",
                    whiteSpace: "nowrap",
                    zIndex: 60,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--serif)",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--card-bg)",
                      lineHeight: 1.2,
                      marginBottom: 2,
                    }}
                  >
                    {tab.name}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      color: "rgba(255,255,255,0.6)",
                      lineHeight: 1.2,
                    }}
                  >
                    {tab.subtitle}
                    {tab.reputation != null && tab.reputation > 0 && " · ★ " + tab.reputation}
                  </div>
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}

      {/* "+" new agent tab */}
      {showNewTab && (
        <React.Fragment key="new-tab">
          <span
            style={{
              width: 1,
              alignSelf: "center",
              height: 22,
              background: "var(--gold)",
              opacity: 0.35,
              flexShrink: 0,
            }}
          />
          <button
            onClick={() => (onCreateNew ? onCreateNew() : onSelect && onSelect("new"))}
            title="Create a new agent"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 16px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              borderRadius: "6px 6px 0 0",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
                borderRadius: "50%",
                border: "1.5px dashed rgba(184,148,62,0.6)",
                color: "rgba(255,255,255,0.7)",
                fontSize: 18,
                fontFamily: "var(--serif)",
                lineHeight: 1,
              }}
            >
              +
            </span>
          </button>
        </React.Fragment>
      )}
    </div>
  );
}

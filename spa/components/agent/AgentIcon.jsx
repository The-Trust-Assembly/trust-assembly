import React from "react";

// Trust Assembly Agent — circular agent icon
// --------------------------------------------
// Renders the circular icon for a single agent instance. The image path
// is derived from the agent type; the image files live at
// /public/icons/agent-{type}.png (added in Stage A). For one-time agents
// or unknown types, falls back to the golden lighthouse emblem which is
// the Trust Assembly primary brand mark.
//
// Props:
//   type      — 'sentinel' | 'phantom' | 'ward' | 'onetime' | null
//   size      — pixel diameter (default 32)
//   color     — optional accent border color override
//   showStatus — if true, shows a green dot in the bottom-right for
//                active agents (not shown when size < 24)

const TYPE_IMG = {
  sentinel: "/icons/agent-sentinel.png",
  phantom: "/icons/agent-phantom.png",
  ward: "/icons/agent-ward.png",
};

const TYPE_BORDER = {
  sentinel: "var(--gold)",
  phantom: "#8B5E3C",
  ward: "var(--ward)",
  onetime: "var(--gold)",
};

const LIGHTHOUSE_FALLBACK = "/icons/Golden lighthouse emblem with laurel wreath.png";

export default function AgentIcon({ type, size = 32, color, showStatus = false, active = false }) {
  const src = TYPE_IMG[type] || LIGHTHOUSE_FALLBACK;
  const border = color || TYPE_BORDER[type] || "var(--gold)";
  const showDot = showStatus && active && size >= 24;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <img
        src={src}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          border: `2px solid ${border}`,
          background: "var(--card-bg)",
        }}
      />
      {showDot && (
        <span
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: Math.max(size / 5, 6),
            height: Math.max(size / 5, 6),
            borderRadius: "50%",
            background: "var(--green)",
            border: "2px solid var(--card-bg)",
          }}
        />
      )}
    </div>
  );
}

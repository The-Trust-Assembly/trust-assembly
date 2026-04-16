import React, { useState, useEffect } from "react";

// Trust Assembly Agent — Settings screen
// ----------------------------------------
// Per-agent configuration. Shown when the user clicks "Settings" on an
// agent tab, or when a newly-created agent is in status='setup'.
//
// Editable fields:
//   - Name, Domain Focus
//   - Reasoning Instructions (4000 char max, prepended to every run)
//   - Monthly Spend Limit
//   - Type-specific: Substack URL (Phantom), Monitored Entities (Ward)
//
// Saves via PATCH /api/agent/instances/[id]. Also offers a Delete button
// that requires a typed confirmation per the "no deletion without
// explicit authorization" rule.

export default function AgentSettings({ agent, onUpdated, onDeleted }) {
  const [name, setName] = useState(agent.name || "");
  const [domain, setDomain] = useState(agent.domain || "");
  const [reasoningInstructions, setReasoningInstructions] = useState(
    agent.reasoning_instructions || ""
  );
  const [monthlySpendLimit, setMonthlySpendLimit] = useState(
    agent.monthly_spend_limit != null ? String(agent.monthly_spend_limit) : ""
  );

  // Type-specific state, pulled from config JSONB
  const config = agent.config || {};
  const [substackUrl, setSubstackUrl] = useState(config.substackUrl || "");
  const [monitoredEntities, setMonitoredEntities] = useState(
    Array.isArray(config.monitoredEntities) ? config.monitoredEntities.join("\n") : ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Reset state when agent prop changes (switching tabs)
  useEffect(() => {
    setName(agent.name || "");
    setDomain(agent.domain || "");
    setReasoningInstructions(agent.reasoning_instructions || "");
    setMonthlySpendLimit(agent.monthly_spend_limit != null ? String(agent.monthly_spend_limit) : "");
    const cfg = agent.config || {};
    setSubstackUrl(cfg.substackUrl || "");
    setMonitoredEntities(Array.isArray(cfg.monitoredEntities) ? cfg.monitoredEntities.join("\n") : "");
    setError("");
    setSuccess("");
  }, [agent.id]);

  async function handleSave() {
    setError("");
    setSuccess("");
    setSaving(true);

    const payload = {
      name: name.trim(),
      domain: domain.trim() || null,
      reasoningInstructions: reasoningInstructions || null,
      monthlySpendLimit: monthlySpendLimit.trim()
        ? Number(monthlySpendLimit)
        : null,
    };

    // Type-specific config
    if (agent.type === "phantom") {
      payload.config = { ...config, substackUrl: substackUrl.trim() };
    } else if (agent.type === "ward") {
      payload.config = {
        ...config,
        monitoredEntities: monitoredEntities
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
      };
    }

    // Auto-promote from 'setup' to 'idle' on first save
    if (agent.status === "setup") {
      payload.status = "idle";
    }

    try {
      const res = await fetch(`/api/agent/instances/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("Settings saved.");
        if (onUpdated) onUpdated(data.instance);
      } else {
        setError(data.error || "Failed to save.");
      }
    } catch (e) {
      setError(e.message || "Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirmText !== agent.name) {
      setError(`Type "${agent.name}" exactly to confirm deletion.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/agent/instances/${agent.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (res.ok) {
        if (onDeleted) onDeleted(agent.id);
      } else {
        setError(data.error || "Failed to delete.");
      }
    } catch (e) {
      setError(e.message || "Network error.");
    } finally {
      setSaving(false);
    }
  }

  const labelStyle = {
    display: "block",
    fontFamily: "var(--serif)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text)",
    marginBottom: 6,
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    fontFamily: "var(--serif)",
    fontSize: 14,
    border: "1px solid var(--border)",
    borderRadius: 4,
    background: "var(--bg)",
    color: "var(--text)",
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
      <h2 className="ta-section-head">Settings · {agent.name}</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        Changes apply to future runs. The agent type (
        <strong style={{ textTransform: "capitalize" }}>{agent.type}</strong>) is immutable — to
        change type, delete and recreate.
      </p>

      {/* Identity */}
      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Domain Focus</label>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="e.g. Legal & Policy"
          maxLength={200}
          style={inputStyle}
        />
      </div>

      {/* Type-specific config */}
      {agent.type === "phantom" && (
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Substack Feed URL</label>
          <input
            type="url"
            value={substackUrl}
            onChange={(e) => setSubstackUrl(e.target.value)}
            placeholder="https://greenwald.substack.com"
            style={{ ...inputStyle, fontFamily: "var(--mono)", fontSize: 13 }}
          />
        </div>
      )}

      {agent.type === "ward" && (
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Monitored Entities</label>
          <textarea
            value={monitoredEntities}
            onChange={(e) => setMonitoredEntities(e.target.value)}
            placeholder="One per line or comma-separated."
            style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontSize: 13 }}
          />
        </div>
      )}

      {/* Reasoning instructions */}
      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>
          Reasoning Instructions{" "}
          <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
            ({reasoningInstructions.length}/4000)
          </span>
        </label>
        <textarea
          value={reasoningInstructions}
          onChange={(e) => setReasoningInstructions(e.target.value.slice(0, 4000))}
          placeholder="Persistent instructions prepended to every fact-check run. Describe how this agent should reason, what to prioritize, and what to avoid."
          style={{ ...inputStyle, minHeight: 120, resize: "vertical", fontSize: 13 }}
        />
      </div>

      {/* Spend limit */}
      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>
          Monthly Spend Limit{" "}
          <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(USD, optional)</span>
        </label>
        <input
          type="number"
          value={monthlySpendLimit}
          onChange={(e) => setMonthlySpendLimit(e.target.value)}
          placeholder="e.g. 10.00"
          min="0"
          step="0.01"
          style={{ ...inputStyle, fontFamily: "var(--mono)", fontSize: 13 }}
        />
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          Agent pauses automatically when this month's spend reaches the limit.
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(196, 77, 77, 0.1)",
            border: "1px solid var(--red)",
            borderRadius: 4,
            color: "var(--red)",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(74, 140, 92, 0.1)",
            border: "1px solid var(--green)",
            borderRadius: 4,
            color: "var(--green)",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {success}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <button
          className="ta-btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ flex: 1, fontSize: 14, padding: "10px 24px" }}
        >
          {saving ? "Saving…" : agent.status === "setup" ? "Save & Activate" : "Save Settings"}
        </button>
      </div>

      {/* Danger zone */}
      <div
        style={{
          marginTop: 40,
          padding: "16px 20px",
          background: "var(--card-bg)",
          border: "1px solid var(--red)",
          borderRadius: 6,
        }}
      >
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 600, color: "var(--red)", marginBottom: 6 }}>
          Danger Zone
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 12 }}>
          Deleting this agent removes its configuration but preserves its run history (runs get
          unlinked from the agent). This cannot be undone.
        </p>
        {!showDeleteConfirm ? (
          <button
            className="ta-btn-secondary"
            onClick={() => setShowDeleteConfirm(true)}
            style={{ fontSize: 12, color: "var(--red)", borderColor: "var(--red)" }}
          >
            Delete this agent…
          </button>
        ) : (
          <div>
            <p style={{ fontSize: 12, color: "var(--text)", marginBottom: 8 }}>
              Type <strong>{agent.name}</strong> below to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="ta-btn-secondary"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                }}
                disabled={saving}
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={saving || deleteConfirmText !== agent.name}
                style={{
                  fontSize: 12,
                  padding: "8px 18px",
                  background: "var(--red)",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: saving || deleteConfirmText !== agent.name ? "not-allowed" : "pointer",
                  opacity: saving || deleteConfirmText !== agent.name ? 0.6 : 1,
                }}
              >
                {saving ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

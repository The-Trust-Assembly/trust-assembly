import React, { useState } from "react";
import AgentIcon from "./AgentIcon";

// Trust Assembly Agent — new agent setup form
// ---------------------------------------------
// Shown when the user clicks the "+" tab on the Agent workspace.
// Collects the minimum fields needed to create a new agent instance:
//   - type (Sentinel / Phantom / Ward)
//   - name (auto-derived for Phantom, required otherwise)
//   - domain focus (optional)
//   - type-specific config (Phantom: Substack URL, Ward: monitored entities)
//
// POSTs to /api/agent/instances. On success, calls onCreated(newInstance)
// so the parent can refresh the tab bar and switch to the new tab.

const TYPES = [
  {
    id: "sentinel",
    label: "Sentinel",
    tagline: "Broad internet scanning",
    description:
      "Enter a thesis and the Sentinel searches the open web for articles to fact-check. Best for proactive corrections on topics you care about.",
  },
  {
    id: "phantom",
    label: "Phantom",
    tagline: "Substack feed monitoring",
    description:
      "Watches a specific Substack feed and scans new posts automatically. The name auto-derives from the URL. Best for accountability on a specific author or publication.",
  },
  {
    id: "ward",
    label: "Ward",
    tagline: "Reputation defense",
    description:
      "Monitors the web for mentions of specific entities (people, organizations) and flags both errors (for correction) and accurate positive coverage (for affirmation). Best for defending a reputation.",
  },
];

export default function AgentNewForm({ onCreated, onCancel }) {
  const [type, setType] = useState("sentinel");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [substackUrl, setSubstackUrl] = useState("");
  const [monitoredEntities, setMonitoredEntities] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Auto-derive phantom name from Substack URL
  const phantomAutoName = (() => {
    if (type !== "phantom" || !substackUrl.trim()) return "";
    try {
      const url = new URL(substackUrl.trim());
      const host = url.hostname.replace(/^www\./, "");
      const subdomain = host.split(".")[0];
      if (subdomain) {
        return subdomain.charAt(0).toUpperCase() + subdomain.slice(1) + " Phantom";
      }
    } catch {}
    return "";
  })();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const payload = { type, domain: domain.trim() || undefined };

    if (type === "phantom") {
      if (!substackUrl.trim()) {
        setError("Phantom agents require a Substack feed URL.");
        return;
      }
      payload.config = { substackUrl: substackUrl.trim(), scanFrequency: "daily", autoScan: false };
      // Server will auto-derive name if not provided
      if (name.trim()) payload.name = name.trim();
    } else if (type === "ward") {
      if (!monitoredEntities.trim()) {
        setError("Ward agents require at least one entity to monitor.");
        return;
      }
      payload.config = {
        monitoredEntities: monitoredEntities
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (!name.trim()) {
        setError("Please enter a name for your Ward.");
        return;
      }
      payload.name = name.trim();
    } else {
      // Sentinel
      if (!name.trim()) {
        setError("Please enter a name for your Sentinel.");
        return;
      }
      payload.name = name.trim();
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/agent/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        if (onCreated) onCreated(data.instance);
      } else {
        setError(data.error || "Failed to create agent.");
      }
    } catch (e) {
      setError(e.message || "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
      <div className="ta-section-rule" />
      <h2 className="ta-section-head">Create a New Agent</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 4, marginBottom: 24 }}>
        Pick a type to see what it does. You can change the name and settings later.
      </p>

      <form onSubmit={handleSubmit}>
        {/* Type selection cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {TYPES.map((t) => {
            const selected = type === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                style={{
                  background: "var(--card-bg)",
                  border: `2px solid ${selected ? "var(--gold)" : "var(--border)"}`,
                  borderRadius: 8,
                  padding: "16px 14px",
                  cursor: "pointer",
                  textAlign: "left",
                  position: "relative",
                  transition: "border-color 0.15s",
                }}
              >
                {selected && (
                  <span
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "var(--gold)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </span>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <AgentIcon type={t.id} size={32} />
                  <div>
                    <div style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
                      {t.label}
                    </div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)" }}>
                      {t.tagline}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {t.description}
                </div>
              </button>
            );
          })}
        </div>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
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
            Agent Name
            {type === "phantom" && (
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>
                (auto-derived from the Substack URL below)
              </span>
            )}
          </label>
          <input
            type="text"
            value={type === "phantom" ? phantomAutoName || name : name}
            onChange={(e) => setName(e.target.value)}
            disabled={type === "phantom" && phantomAutoName}
            placeholder={
              type === "sentinel"
                ? "e.g. Alpha, Clarity, Watchdog"
                : type === "ward"
                ? "e.g. My Ward, Acme Defense"
                : "Will auto-derive from URL"
            }
            maxLength={120}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontFamily: "var(--serif)",
              fontSize: 14,
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        </div>

        {/* Domain focus */}
        <div style={{ marginBottom: 16 }}>
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
            Domain Focus{" "}
            <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span>
          </label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. Legal & Policy, Science & Health, Press & Media"
            maxLength={200}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontFamily: "var(--serif)",
              fontSize: 14,
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        </div>

        {/* Phantom: Substack URL */}
        {type === "phantom" && (
          <div style={{ marginBottom: 16 }}>
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
              Substack Feed URL
            </label>
            <input
              type="url"
              value={substackUrl}
              onChange={(e) => setSubstackUrl(e.target.value)}
              placeholder="https://greenwald.substack.com"
              style={{
                width: "100%",
                padding: "10px 12px",
                fontFamily: "var(--mono)",
                fontSize: 13,
                border: "1px solid var(--border)",
                borderRadius: 4,
                background: "var(--bg)",
                color: "var(--text)",
              }}
            />
          </div>
        )}

        {/* Ward: monitored entities */}
        {type === "ward" && (
          <div style={{ marginBottom: 16 }}>
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
              Monitored Entities
            </label>
            <textarea
              value={monitoredEntities}
              onChange={(e) => setMonitoredEntities(e.target.value)}
              placeholder="One per line or comma-separated. e.g. Acme Corp, Jane Doe CEO, XYZ Foundation"
              style={{
                width: "100%",
                minHeight: 80,
                padding: "10px 12px",
                fontFamily: "var(--serif)",
                fontSize: 13,
                border: "1px solid var(--border)",
                borderRadius: 4,
                background: "var(--bg)",
                color: "var(--text)",
                resize: "vertical",
              }}
            />
          </div>
        )}

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

        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          {onCancel && (
            <button
              type="button"
              className="ta-btn-secondary"
              onClick={onCancel}
              disabled={submitting}
              style={{ fontSize: 14 }}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="ta-btn-primary"
            disabled={submitting}
            style={{ fontSize: 14, padding: "10px 24px", flex: 1 }}
          >
            {submitting ? "Creating..." : "Create Agent"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState, useCallback, useEffect } from "react";

// Pipeline step definitions — the full agent pipeline in order
const PIPELINE_STEPS = [
  {
    key: "search_keywords",
    title: "Keyword Generation",
    model: "Sonnet",
    costEstimate: "~$0.001",
    description: "The user's thesis is sent to Sonnet, which generates 7-15 search keyword phrases. These keywords drive the web search in the next step. The user can edit the keywords before starting the search.",
    between: "User reviews and edits keyword chips. Can add/remove keywords manually.",
  },
  {
    key: "search_web",
    title: "Web Search",
    model: "Sonnet + web_search tool",
    costEstimate: "~$0.02-0.10 per round",
    description: "Each keyword is used to search the web via Claude's web_search tool. The model finds articles related to the thesis and returns them as candidates with URL, headline, publication, and a reason to check. Multiple rounds may run depending on the scope setting.",
    between: "Candidates are saved as artifacts. If Google CSE is configured, the Haiku relevance filter runs next. Otherwise, articles go directly to fetch.",
  },
  {
    key: "relevance_filter",
    title: "Relevance Filter",
    model: "Haiku",
    costEstimate: "~$0.001-0.003",
    description: "When using Google Custom Search (not Claude web_search), the raw search results are scored 0-10 for relevance to the thesis. Results scoring below 5 are filtered out. This step is skipped when using Claude's built-in web_search since it already applies relevance judgment.",
    between: "Filtered candidates proceed to fetch. URLs are deduplicated.",
  },
  {
    key: "analyze_instructions",
    title: "Article Analysis — Instructions",
    model: "Sonnet",
    costEstimate: "~$0.01-0.02 per article",
    description: "Each article is analyzed individually by Sonnet. This prompt section contains the core instructions: require exact quotes from the article text, output format rules, and the mandate to respond with only valid JSON. These instructions appear AFTER the article text so the model reads them right before generating.",
    between: "This section, vault rules, translation rules, and general rules are all combined into one prompt per article.",
  },
  {
    key: "analyze_vault_rules",
    title: "Article Analysis — Vault Entry Rules",
    model: "(part of analysis prompt)",
    costEstimate: "(included above)",
    description: "Rules for generating standing corrections (lede + full assertion), arguments (logical frameworks), and other vault entries. Standing corrections must start with a short declarative fact (the 'lede', max 200 chars) followed by a full explanation with dates and sources.",
    between: null,
  },
  {
    key: "analyze_translation_rules",
    title: "Article Analysis — Translation Rules",
    model: "(part of analysis prompt)",
    costEstimate: "(included above)",
    description: "Rules for generating translations — replacing loaded, obscure, or rhetorically crafted language with plain English. Translations must be 1-5 words max, same part of speech as the original, and fit as a direct word swap in any sentence. Each translation includes 5 test sentences for automated grammar verification.",
    between: null,
  },
  {
    key: "analyze_rules",
    title: "Article Analysis — General Rules",
    model: "(part of analysis prompt)",
    costEstimate: "(included above)",
    description: "General rules for verdicts (correction/affirmation/skip), mandatory quote requirements, recency awareness (today's date is injected via {{today}}), and vault entry generation guidance. The recency rule prevents hallucinations about recent events.",
    between: "After each article is analyzed, quotes are verified deterministically against the source text (no LLM). URLs cited in evidence are checked with HEAD requests. These verifications are mechanical — not a prompt.",
  },
  {
    key: "verify_vault",
    title: "Vault Entry Verification",
    model: "Sonnet + web_search",
    costEstimate: "~$0.003 per entry",
    description: "Each standing correction assertion is searched on the web to verify it's factually accurate. The model searches for the claim and evaluates whether search results support or contradict it. Disputed entries are auto-unapproved.",
    between: "Verified vault entries proceed to translation drop-in testing.",
  },
  {
    key: "verify_translations",
    title: "Translation Grammar Check",
    model: "Haiku",
    costEstimate: "~$0.001",
    description: "For each translation that includes test sentences, the original phrase is swapped for the translated phrase in all 5 sentences. Haiku evaluates whether the resulting sentences are grammatically correct. Translations that fail are auto-excluded.",
    between: "All verified results are passed to the synthesis step.",
  },
  {
    key: "synthesize",
    title: "Cross-Article Synthesis",
    model: "Sonnet",
    costEstimate: "~$0.005-0.01",
    description: "All analyzed articles are reviewed together. The model refines verdicts based on cross-article evidence, consolidates vault entries, deduplicates translations, and writes a 2-3 sentence narrative summarizing the key findings across all articles.",
    between: "The final batch (submissions + vault entries + narrative) is saved and the run is marked as 'ready' for human review.",
  },
];

const btnStyle = { background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const smallBtnStyle = { background: "#334155", color: "#e2e8f0", border: "none", borderRadius: 4, padding: "5px 10px", fontSize: 11, cursor: "pointer" };

export default function PromptPipelinePage() {
  const [authState, setAuthState] = useState("loading");
  const [prompts, setPrompts] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  const getAuthHeaders = useCallback(() => {
    const token = document.cookie.split(";").map(c => c.trim()).find(c => c.startsWith("ta_token="))?.split("=")[1];
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/users?limit=1", { headers: getAuthHeaders(), credentials: "same-origin" });
        setAuthState(res.ok ? "authorized" : "unauthorized");
        if (res.ok) {
          const promptRes = await fetch("/api/admin/agent-prompts", { headers: getAuthHeaders() });
          if (promptRes.ok) {
            const data = await promptRes.json();
            const map = {};
            for (const p of data.prompts || []) map[p.key] = p;
            setPrompts(map);
          }
        }
      } catch { setAuthState("unauthorized"); }
    })();
  }, [getAuthHeaders]);

  function startEditing(key) {
    const existing = prompts[key];
    setEditingKey(key);
    setDraftBody(existing?.body || "");
    setDraftLabel(existing?.label || key.replace(/_/g, " "));
    setSaveMsg(null);
  }

  async function handleSave() {
    if (!editingKey || !draftBody.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/agent-prompts", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ key: editingKey, label: draftLabel, body: draftBody }),
      });
      const data = await res.json();
      setSaveMsg(data.message || "Saved");
      // Refresh
      const listRes = await fetch("/api/admin/agent-prompts", { headers: getAuthHeaders() });
      if (listRes.ok) {
        const d = await listRes.json();
        const map = {};
        for (const p of d.prompts || []) map[p.key] = p;
        setPrompts(map);
      }
    } catch (e) { setSaveMsg("Error: " + e); }
    finally { setSaving(false); }
  }

  if (authState === "loading") return <div style={{ padding: 40, color: "#94a3b8", textAlign: "center" }}>Loading...</div>;
  if (authState === "unauthorized") return (
    <div style={{ padding: 40, color: "#ef4444", textAlign: "center", fontFamily: "Georgia, serif" }}>
      <h2>Access Denied</h2>
      <p>Admin access required. <a href="/" style={{ color: "#60a5fa" }}>Go home</a></p>
    </div>
  );

  const editingStep = PIPELINE_STEPS.find(s => s.key === editingKey);

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", fontFamily: "'IBM Plex Mono', monospace" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: "#e2e8f0", margin: "0 0 8px" }}>
            Agent Prompt Pipeline
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            The full fact-checking pipeline from thesis to final batch. Each step shows what happens,
            which model runs, and the prompt that drives it. Click any step to edit its prompt.
            Changes take effect within 60 seconds.
          </p>
        </div>

        <div style={{ display: "flex", gap: 24 }}>
          {/* Left: Pipeline flow */}
          <div style={{ flex: editingKey ? "0 0 50%" : "1 1 100%", minWidth: 0, transition: "flex 0.2s" }}>
            {PIPELINE_STEPS.map((step, idx) => {
              const saved = prompts[step.key];
              const isEditing = editingKey === step.key;
              return (
                <div key={step.key}>
                  {/* Step card */}
                  <div
                    style={{
                      background: isEditing ? "#1e3a5f" : "#1e293b",
                      border: `1px solid ${isEditing ? "#3b82f6" : saved ? "#22c55e44" : "#334155"}`,
                      borderRadius: 8,
                      padding: "16px 20px",
                      cursor: "pointer",
                      transition: "border-color 0.15s",
                    }}
                    onClick={() => startEditing(step.key)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <span style={{ fontFamily: "Georgia, serif", fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                          Step {idx + 1}
                        </span>
                        <h3 style={{ fontFamily: "Georgia, serif", fontSize: 18, color: "#e2e8f0", margin: "2px 0 0" }}>
                          {step.title}
                        </h3>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: "#60a5fa" }}>{step.model}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>{step.costEstimate}</div>
                        {saved && <div style={{ fontSize: 9, color: "#22c55e", marginTop: 2 }}>customized</div>}
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>
                      {step.description}
                    </p>
                  </div>

                  {/* Connector between steps */}
                  {step.between && idx < PIPELINE_STEPS.length - 1 && (
                    <div style={{ display: "flex", alignItems: "center", padding: "8px 0 8px 20px", gap: 10 }}>
                      <div style={{ width: 2, height: 24, background: "#334155", flexShrink: 0 }} />
                      <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.5, fontStyle: "italic" }}>
                        {step.between}
                      </div>
                    </div>
                  )}
                  {!step.between && idx < PIPELINE_STEPS.length - 1 && (
                    <div style={{ display: "flex", padding: "4px 0 4px 20px" }}>
                      <div style={{ width: 2, height: 12, background: "#334155" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right: Editor panel (side-by-side) */}
          {editingKey && editingStep && (
            <div style={{ flex: "0 0 50%", minWidth: 0, position: "sticky", top: 24, alignSelf: "flex-start", maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column" }}>
              <div style={{ background: "#1e293b", border: "1px solid #3b82f6", borderRadius: 8, padding: "16px 20px", display: "flex", flexDirection: "column", maxHeight: "100%", overflow: "hidden" }}>
                {/* Editor header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.1em" }}>Editing</div>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 16, color: "#e2e8f0" }}>{editingStep.title}</div>
                  </div>
                  <button onClick={() => setEditingKey(null)} style={smallBtnStyle}>Close</button>
                </div>

                {/* Current version (read-only) */}
                {prompts[editingKey] && (
                  <div style={{ marginBottom: 12, flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: "#22c55e", marginBottom: 4 }}>
                      Current saved version ({prompts[editingKey].body?.length || 0} chars · saved {new Date(prompts[editingKey].updated_at).toLocaleString()} by {prompts[editingKey].updated_by})
                    </div>
                    <pre style={{
                      padding: "8px 10px", background: "#0f172a", borderRadius: 4, border: "1px solid #334155",
                      fontSize: 10, color: "#94a3b8", maxHeight: 150, overflow: "auto", lineHeight: 1.5,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>
                      {prompts[editingKey].body}
                    </pre>
                  </div>
                )}

                {/* Draft editor */}
                <div style={{ fontSize: 10, color: "#60a5fa", marginBottom: 4 }}>
                  {prompts[editingKey] ? "New version:" : "No saved version — enter prompt text below (or leave empty to use hardcoded default):"}
                </div>
                <textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder="Enter prompt text... Use {{today}} for date substitution."
                  style={{
                    flex: 1, minHeight: 200, width: "100%", padding: "10px 12px",
                    background: "#0f172a", border: "1px solid #334155", borderRadius: 4,
                    color: "#e2e8f0", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
                    lineHeight: 1.6, resize: "vertical",
                  }}
                />

                {/* Save bar */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexShrink: 0 }}>
                  <button
                    onClick={handleSave}
                    disabled={saving || !draftBody.trim()}
                    style={{ ...btnStyle, background: "#22c55e", fontSize: 12, padding: "8px 20px" }}
                  >
                    {saving ? "Saving..." : "Save Prompt"}
                  </button>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>
                    {draftBody.length} chars
                  </span>
                  {saveMsg && <span style={{ fontSize: 10, color: "#22c55e" }}>{saveMsg}</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

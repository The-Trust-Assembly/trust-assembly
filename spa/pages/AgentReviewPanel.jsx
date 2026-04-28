import React, { useState, useEffect } from "react";

// Trust Assembly Agent — Review Panel
// -------------------------------------
// Shown when an admin clicks "Review" on a 'ready' agent run. Loads the
// full run from /api/agent/run/[id], lets the admin edit the synthesized
// batch (submissions + vault entries), and submits the approved items
// via POST /api/agent/run/[id]/submit. The submit endpoint forwards to
// the existing /api/submissions and /api/vault routes so the resulting
// records flow through the same review/jury pipeline as manual entries.

const VERDICT_COLORS = {
  correction: { bg: "rgba(196, 77, 77, 0.12)", color: "var(--red)" },
  affirmation: { bg: "rgba(74, 140, 92, 0.12)", color: "var(--green)" },
  skip: { bg: "var(--bg)", color: "var(--text-muted)" },
};

const TYPE_LABELS = {
  vault: "Standing Correction",
  argument: "Argument",
  translation: "Translation",
};

const TYPE_COLORS = {
  vault: "var(--text)",
  argument: "var(--green)",
  translation: "var(--gold)",
};

export default function AgentReviewPanel({ runId, onBack, onCompleted }) {
  const [run, setRun] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [vaultEntries, setVaultEntries] = useState([]);
  const [assemblies, setAssemblies] = useState([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState([]);
  const [tab, setTab] = useState("submissions");
  const [expandedIndex, setExpandedIndex] = useState(0);
  const [expandedVaultIndex, setExpandedVaultIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [runRes, asmRes] = await Promise.all([
          fetch(`/api/agent/run/${runId}`),
          fetch("/api/users/me/assemblies"),
        ]);
        if (!runRes.ok) {
          setError("Failed to load run.");
          setLoading(false);
          return;
        }
        const runData = await runRes.json();
        setRun(runData.run);
        setSubmissions(runData.run.batch?.submissions || []);
        setVaultEntries(runData.run.batch?.vaultEntries || []);
        if (asmRes.ok) {
          const asmData = await asmRes.json();
          const list = asmData.joined || asmData.assemblies || asmData.organizations || [];
          setAssemblies(list);
          // Auto-suggest assemblies whose description matches the thesis
          const thesis = (runData.run.thesis || "").toLowerCase();
          const thesisWords = thesis.split(/\s+/).filter((w) => w.length > 4);
          const suggested = list.filter((a) => {
            if (!a.description) return false;
            const desc = a.description.toLowerCase();
            return thesisWords.some((w) => desc.includes(w));
          });
          if (suggested.length > 0) {
            setSelectedOrgIds(suggested.map((a) => a.id));
          } else if (list.length > 0) {
            setSelectedOrgIds([list[0].id]);
          }
        }
      } catch (e) {
        setError(e.message || "Failed to load run.");
      } finally {
        setLoading(false);
      }
    })();
  }, [runId]);

  function updateSubmission(i, patch) {
    setSubmissions((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function updateAnalysis(i, patch) {
    setSubmissions((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], analysis: { ...next[i].analysis, ...patch } };
      return next;
    });
  }

  function updateVault(i, patch) {
    setVaultEntries((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function updateVaultEntry(i, patch) {
    setVaultEntries((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], entry: { ...next[i].entry, ...patch } };
      return next;
    });
  }

  function toggleOrg(id) {
    setSelectedOrgIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const approvedSubs = submissions.filter((s) => s.approved && s.analysis.verdict !== "skip").length;
  const approvedVault = vaultEntries.filter((v) => v.approved).length;

  async function handleSubmit() {
    setShowConfirm(false);
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/agent/run/${runId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgIds: selectedOrgIds, submissions, vaultEntries }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitResult(data);
        if (onCompleted) onCompleted(data);
      } else {
        setError(data.error || "Submission failed.");
      }
    } catch (e) {
      setError(e.message || "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--text-muted)", fontStyle: "italic" }}>
        Loading run...
      </div>
    );
  }

  if (!run) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--red)" }}>
        {error || "Run not found."}
        <div style={{ marginTop: 16 }}>
          <button className="ta-btn-secondary" onClick={onBack}>← Back</button>
        </div>
      </div>
    );
  }

  // Success state
  if (submitResult) {
    return (
      <div style={{ maxWidth: 600, margin: "40px auto", padding: "0 24px" }}>
        <div className="ta-section-rule" />
        <h2 className="ta-section-head">Submitted</h2>
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--green)",
            borderLeft: "4px solid var(--green)",
            borderRadius: 8,
            padding: "20px 24px",
            marginTop: 16,
          }}
        >
          <p style={{ fontSize: 15, lineHeight: 1.8, margin: 0 }}>
            <strong>{submitResult.submitted}</strong> submission{submitResult.submitted === 1 ? "" : "s"} and{" "}
            <strong>{submitResult.vaultCreated}</strong> vault entr{submitResult.vaultCreated === 1 ? "y" : "ies"} filed
            successfully.
          </p>
          {submitResult.errors?.length > 0 && (
            <div style={{ marginTop: 12, padding: 12, background: "rgba(196,77,77,0.08)", borderRadius: 6 }}>
              <strong style={{ color: "var(--red)" }}>{submitResult.errors.length} errors:</strong>
              <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 13 }}>
                {submitResult.errors.map((e, i) => (
                  <li key={i} style={{ color: "var(--text-muted)" }}>
                    <strong>{e.kind}:</strong> {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ marginTop: 20 }}>
            <button className="ta-btn-primary" onClick={onBack}>← Back to Agent</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <button
            className="ta-btn-secondary"
            onClick={onBack}
            style={{ fontSize: 12, padding: "4px 12px", marginBottom: 8 }}
          >
            ← Back to Agent
          </button>
          <h2 className="ta-section-head" style={{ marginBottom: 4 }}>Review Synthesized Batch</h2>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {submissions.length} submissions · {vaultEntries.length} vault entries
            {run.batch?.skipped > 0 && ` · ${run.batch.skipped} skipped`}
          </div>
        </div>
      </div>

      {/* Thesis */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "12px 16px",
          marginBottom: 16,
          fontSize: 13,
          color: "var(--text-muted)",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Thesis: </strong>
        {run.thesis}
      </div>

      {/* Narrative */}
      {run.batch?.narrative && (
        <div
          style={{
            background: "var(--card-bg)",
            padding: "14px 18px",
            borderRadius: 6,
            marginBottom: 20,
            borderLeft: "4px solid var(--gold)",
            fontStyle: "italic",
            fontSize: 15,
            lineHeight: 1.7,
          }}
        >
          <strong style={{ fontStyle: "normal" }}>Narrative: </strong>
          {run.batch.narrative}
        </div>
      )}

      {/* Assembly chips */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontFamily: "var(--serif)", fontSize: 13, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 8 }}>
          Submit to Assemblies
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {assemblies.length === 0 && (
            <span style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
              No assemblies found. You must be a member of at least one to submit.
            </span>
          )}
          {assemblies.map((org) => {
            const selected = selectedOrgIds.includes(org.id);
            return (
              <span
                key={org.id}
                onClick={() => toggleOrg(org.id)}
                title={org.description || ""}
                style={{
                  cursor: "pointer",
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: 13,
                  background: selected ? "var(--text)" : "var(--bg)",
                  color: selected ? "var(--card-bg)" : "var(--text)",
                  border: `1px solid ${selected ? "var(--text)" : "var(--border)"}`,
                  userSelect: "none",
                }}
              >
                {selected ? "✓ " : ""}
                {org.name}
              </span>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid var(--border)" }}>
        {["submissions", "vault"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 24px",
              fontSize: 14,
              border: "none",
              background: "none",
              cursor: "pointer",
              fontFamily: "var(--serif)",
              fontWeight: 600,
              color: tab === t ? "var(--text)" : "var(--text-muted)",
              borderBottom: tab === t ? "3px solid var(--gold)" : "3px solid transparent",
              marginBottom: -2,
            }}
          >
            {t === "submissions" ? `Submissions (${submissions.length})` : `Vault Entries (${vaultEntries.length})`}
          </button>
        ))}
      </div>

      {/* Submissions tab */}
      {tab === "submissions" && (
        <div style={{ marginBottom: 24 }}>
          {submissions.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontStyle: "italic" }}>
              No submissions in this batch.
            </div>
          )}
          {submissions.map((sub, i) => {
            const verdict = sub.analysis.verdict;
            const colors = VERDICT_COLORS[verdict] || VERDICT_COLORS.skip;
            const isExpanded = expandedIndex === i;
            return (
              <div
                key={sub.id || i}
                style={{
                  marginBottom: 12,
                  background: "var(--card-bg)",
                  border: `1px solid ${isExpanded ? "var(--gold)" : "var(--border)"}`,
                  borderRadius: 8,
                  padding: 16,
                  opacity: sub.approved ? 1 : 0.55,
                  transition: "opacity 0.2s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                  <div
                    style={{ flex: 1, cursor: "pointer", minWidth: 0 }}
                    onClick={() => setExpandedIndex(isExpanded ? -1 : i)}
                  >
                    {/* Fetched headline (verified real from the page) */}
                    {sub.headline && sub.headline !== sub.analysis.originalHeadline && (
                      <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--green)", marginBottom: 2 }}>
                        Verified headline from page
                      </div>
                    )}
                    <div style={{
                      fontSize: 13, lineHeight: 1.4, marginBottom: 2,
                      textDecoration: verdict === "correction" && sub.analysis.replacement ? "line-through" : "none",
                      color: verdict === "correction" && sub.analysis.replacement ? "var(--text-muted)" : "var(--text)",
                      fontWeight: 600,
                    }}>
                      {sub.headline || sub.analysis.originalHeadline}
                    </div>
                    {/* Mismatch warning: model's claimed headline differs from what we fetched */}
                    {sub.headline && sub.analysis.originalHeadline && sub.headline !== sub.analysis.originalHeadline && (
                      <div style={{ fontSize: 10, color: "var(--gold)", fontFamily: "var(--mono)", marginBottom: 2 }}>
                        Agent claimed: "{sub.analysis.originalHeadline}"
                      </div>
                    )}
                    {/* Proposed replacement */}
                    {verdict === "correction" && sub.analysis.replacement && (
                      <div style={{
                        fontSize: 14, fontWeight: 700, lineHeight: 1.4, marginBottom: 4,
                        color: "var(--green)",
                      }}>
                        → {sub.analysis.replacement}
                      </div>
                    )}
                    <a href={sub.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)", overflowWrap: "break-word", wordBreak: "break-word", display: "block" }}>
                      {sub.url}
                    </a>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        padding: "3px 10px",
                        borderRadius: 10,
                        background: colors.bg,
                        color: colors.color,
                        textTransform: "uppercase",
                      }}
                    >
                      {verdict}
                    </span>
                    {sub.analysis.confidence && (
                      <span style={{
                        fontFamily: "var(--mono)", fontSize: 10, padding: "2px 6px", borderRadius: 8,
                        color: sub.analysis.confidence === "high" ? "var(--green)" : sub.analysis.confidence === "low" ? "var(--red)" : "var(--gold)",
                        border: `1px solid ${sub.analysis.confidence === "high" ? "var(--green)" : sub.analysis.confidence === "low" ? "var(--red)" : "var(--gold)"}`,
                      }}>
                        {sub.analysis.confidence}
                        {sub.analysis.confidence === "low" && " — auto-excluded"}
                      </span>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={sub.approved}
                        onChange={() => updateSubmission(i, { approved: !sub.approved })}
                        style={{ width: 16, height: 16, accentColor: "var(--gold)" }}
                      />
                      {sub.approved ? "Include" : "Exclude"}
                    </label>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    {/* Verdict buttons */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                        Verdict
                      </label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {["correction", "affirmation", "skip"].map((v) => (
                          <button
                            key={v}
                            onClick={() => updateAnalysis(i, { verdict: v })}
                            className={verdict === v ? "ta-btn-primary" : "ta-btn-secondary"}
                            style={{ fontSize: 11, padding: "4px 10px" }}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Replacement headline (corrections only) */}
                    {verdict === "correction" && (
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                          Corrected Headline
                        </label>
                        <input
                          type="text"
                          value={sub.analysis.replacement || ""}
                          onChange={(e) => updateAnalysis(i, { replacement: e.target.value })}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            fontFamily: "var(--serif)",
                            fontSize: 14,
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            background: "var(--bg)",
                            color: "var(--text)",
                          }}
                        />
                      </div>
                    )}

                    {/* Reasoning */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                        Reasoning
                      </label>
                      <textarea
                        value={sub.analysis.reasoning || ""}
                        onChange={(e) => updateAnalysis(i, { reasoning: e.target.value })}
                        style={{
                          width: "100%",
                          minHeight: 100,
                          padding: "8px 12px",
                          fontFamily: "var(--serif)",
                          fontSize: 13,
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          background: "var(--bg)",
                          color: "var(--text)",
                          resize: "vertical",
                        }}
                      />
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {(sub.analysis.reasoning || "").length}/2000
                      </div>
                    </div>

                    {/* Evidence */}
                    {sub.analysis.evidence && sub.analysis.evidence.length > 0 && (
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                          Evidence ({sub.analysis.evidence.length})
                        </label>
                        {sub.analysis.evidence.map((ev, j) => {
                          const verifyColor = ev.quoteVerified === "verified" ? "var(--green)"
                            : ev.quoteVerified === "approximate" ? "var(--gold)"
                            : ev.quoteVerified === "not_found" ? "var(--red)"
                            : null;
                          return (
                          <div key={j} style={{ fontSize: 12, marginBottom: 6, padding: "6px 10px", background: "var(--bg)", borderRadius: 4, borderLeft: verifyColor ? `3px solid ${verifyColor}` : "3px solid var(--border)" }}>
                            <div>{ev.description}</div>
                            {ev.quote && (
                              <div style={{ marginTop: 4, padding: "6px 10px", background: "var(--card-bg)", borderRadius: 3, fontStyle: "italic", fontSize: 11, color: "var(--text)", lineHeight: 1.5, borderLeft: "2px solid var(--gold)" }}>
                                "{ev.quote}"
                              </div>
                            )}
                            {ev.quoteVerified && (
                              <div style={{ marginTop: 3, fontSize: 10, fontFamily: "var(--mono)", color: verifyColor || "var(--text-muted)" }}>
                                {ev.quoteVerified === "verified" && "Quote verified in source text"}
                                {ev.quoteVerified === "approximate" && `Approximate match — ${ev.quoteContext || "similar text found"}`}
                                {ev.quoteVerified === "not_found" && "Quote not found in source article"}
                              </div>
                            )}
                            {ev.url && (
                              <div style={{ fontFamily: "var(--mono)", fontSize: 10, marginTop: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, overflow: "hidden" }}>
                                <a href={ev.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-muted)", overflowWrap: "break-word", wordBreak: "break-word", minWidth: 0 }}>{ev.url}</a>
                                {ev.urlVerified === "verified" && <span style={{ color: "var(--green)" }}>URL confirmed</span>}
                                {ev.urlVerified === "not_found" && <span style={{ color: "var(--red)" }}>URL broken (404)</span>}
                                {ev.urlVerified === "error" && <span style={{ color: "var(--gold)" }}>URL unreachable</span>}
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Vault tab */}
      {tab === "vault" && (
        <div style={{ marginBottom: 24 }}>
          {vaultEntries.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontStyle: "italic" }}>
              No vault entries in this batch.
            </div>
          )}
          {vaultEntries.map((ve, i) => {
            const t = ve.entry.type;
            const isVaultExpanded = expandedVaultIndex === i;
            const previewText = ve.entry.lede || ve.entry.assertion || ve.entry.content || ve.entry.original || "";
            const verifyStatus = ve.vaultVerified;
            const verifyReason = ve.vaultVerifyReason;
            return (
              <div
                key={ve.id || i}
                style={{
                  marginBottom: 8,
                  background: "var(--card-bg)",
                  border: "1px solid var(--border)",
                  borderLeft: `4px solid ${TYPE_COLORS[t] || "var(--text-muted)"}`,
                  borderRadius: 8,
                  overflow: "hidden",
                  opacity: ve.approved ? 1 : 0.55,
                }}
              >
                {/* Collapsed header — always visible */}
                <div
                  onClick={() => setExpandedVaultIndex(isVaultExpanded ? -1 : i)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 16px", cursor: "pointer",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{TYPE_LABELS[t] || t}</span>
                      {verifyStatus === "verified" && <span style={{ fontSize: 10, color: "var(--green)", fontFamily: "var(--mono)" }}>verified</span>}
                      {verifyStatus === "disputed" && <span style={{ fontSize: 10, color: "var(--red)", fontFamily: "var(--mono)" }}>disputed</span>}
                    </div>
                    {!isVaultExpanded && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {previewText}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={ve.approved}
                        onChange={() => updateVault(i, { approved: !ve.approved })}
                        style={{ width: 14, height: 14, accentColor: "var(--gold)" }}
                      />
                      {ve.approved ? "Include" : "Exclude"}
                    </label>
                    <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{isVaultExpanded ? "−" : "+"}</span>
                  </div>
                </div>

                {/* Expanded content */}
                {isVaultExpanded && (
                  <div style={{ padding: "0 16px 16px" }}>
                    {verifyReason && (
                      <div style={{
                        padding: "6px 10px", marginBottom: 10, borderRadius: 4, fontSize: 11, lineHeight: 1.5,
                        background: verifyStatus === "disputed" ? "rgba(196,77,77,0.1)" : "rgba(74,140,92,0.1)",
                        color: verifyStatus === "disputed" ? "var(--red)" : "var(--green)",
                        border: `1px solid ${verifyStatus === "disputed" ? "var(--red)" : "var(--green)"}`,
                      }}>
                        <strong>Verification:</strong> {String(verifyReason)}
                      </div>
                    )}

                {t === "vault" && (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--gold)", display: "block", marginBottom: 2 }}>
                        Lede <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(short fact, reads at a glance)</span>
                      </label>
                      <input
                        type="text"
                        value={ve.entry.lede || ""}
                        onChange={(e) => updateVaultEntry(i, { lede: e.target.value })}
                        maxLength={200}
                        placeholder="One sentence — the core fact"
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          fontFamily: "var(--serif)",
                          fontSize: 14,
                          fontWeight: 600,
                          border: "1px solid var(--gold)",
                          borderRadius: 4,
                          background: "var(--bg)",
                          color: "var(--text)",
                        }}
                      />
                      <div style={{ fontSize: 9, color: "var(--text-muted)", textAlign: "right", marginTop: 2 }}>
                        {(ve.entry.lede || "").length}/200
                      </div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
                        Full Explanation
                      </label>
                      <textarea
                        value={ve.entry.assertion || ""}
                        onChange={(e) => updateVaultEntry(i, { assertion: e.target.value })}
                        rows={Math.max(3, Math.ceil((ve.entry.assertion || "").length / 40))}
                        style={{
                          width: "100%",
                          minHeight: 100,
                          padding: "6px 10px",
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
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
                        Evidence
                      </label>
                      <textarea
                        value={ve.entry.evidence || ""}
                        onChange={(e) => updateVaultEntry(i, { evidence: e.target.value })}
                        rows={Math.max(3, Math.ceil((ve.entry.evidence || "").length / 40))}
                        style={{
                          width: "100%",
                          minHeight: 80,
                          padding: "6px 10px",
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
                  </>
                )}

                {t === "argument" && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
                      Argument
                    </label>
                    <textarea
                      value={ve.entry.content || ""}
                      onChange={(e) => updateVaultEntry(i, { content: e.target.value })}
                      rows={Math.max(4, Math.ceil((ve.entry.content || "").length / 40))}
                      style={{
                        width: "100%",
                        minHeight: 120,
                        padding: "6px 10px",
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

                {t === "translation" && (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
                        Type
                      </label>
                      <select
                        value={ve.entry.translationType || "clarity"}
                        onChange={(e) => updateVaultEntry(i, { translationType: e.target.value })}
                        style={{
                          padding: "6px 10px",
                          fontFamily: "var(--serif)",
                          fontSize: 13,
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          background: "var(--bg)",
                          color: "var(--text)",
                        }}
                      >
                        <option value="clarity">Clarity</option>
                        <option value="propaganda">Propaganda</option>
                        <option value="euphemism">Euphemism</option>
                        <option value="satirical">Satirical</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
                        Original Phrase
                      </label>
                      <input
                        type="text"
                        value={ve.entry.original || ""}
                        onChange={(e) => updateVaultEntry(i, { original: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          fontFamily: "var(--serif)",
                          fontSize: 13,
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          background: "var(--bg)",
                          color: "var(--text)",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
                        Plain Language
                      </label>
                      <input
                        type="text"
                        value={ve.entry.translated || ""}
                        onChange={(e) => updateVaultEntry(i, { translated: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          fontFamily: "var(--serif)",
                          fontSize: 13,
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          background: "var(--bg)",
                          color: "var(--text)",
                        }}
                      />
                    </div>
                    {ve.entry.replacementPasses === false && (
                      <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 4, fontSize: 11, background: "rgba(196,77,77,0.1)", border: "1px solid var(--red)", color: "var(--red)" }}>
                        Drop-in test failed — this translation doesn't fit grammatically as a direct replacement. Auto-excluded.
                      </div>
                    )}
                    {ve.entry.replacementPasses === true && (
                      <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 4, fontSize: 11, background: "rgba(74,140,92,0.1)", border: "1px solid var(--green)", color: "var(--green)" }}>
                        Drop-in test passed — fits grammatically in all test sentences.
                      </div>
                    )}
                    {ve.entry.testSentences && ve.entry.testSentences.length > 0 && (
                      <details style={{ marginTop: 6, fontSize: 10, color: "var(--text-muted)" }}>
                        <summary style={{ cursor: "pointer" }}>Test sentences ({ve.entry.testSentences.length})</summary>
                        <div style={{ marginTop: 4, padding: "4px 8px", background: "var(--bg)", borderRadius: 4, lineHeight: 1.6 }}>
                          {ve.entry.testSentences.map((s, j) => (
                            <div key={j}>{j + 1}. {s.replace(new RegExp((ve.entry.original || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), ve.entry.translated || "___")}</div>
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )}
                  </div>
                )}
              </div>
            );
          })}
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

      {/* Sticky submit bar */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          padding: "16px 0",
          marginTop: 16,
          background: "var(--bg)",
          borderTop: "2px solid var(--gold)",
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--text-muted)", flex: 1 }}>
          {approvedSubs} submissions + {approvedVault} vault → {selectedOrgIds.length} assembl{selectedOrgIds.length === 1 ? "y" : "ies"}
        </span>
        <button
          className="ta-btn-primary"
          onClick={() => setShowConfirm(true)}
          disabled={submitting || (approvedSubs === 0 && approvedVault === 0) || selectedOrgIds.length === 0}
          style={{ fontSize: 14, padding: "10px 24px" }}
        >
          {submitting ? "Submitting..." : `Submit Approved (${approvedSubs + approvedVault})`}
        </button>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <div
          onClick={() => setShowConfirm(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card-bg)",
              borderRadius: 12,
              padding: "28px 32px",
              maxWidth: 520,
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontFamily: "var(--serif)", fontWeight: 600, color: "var(--text)", marginTop: 0, marginBottom: 16 }}>
              Before you submit
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 12 }}>
              These submissions will enter the Trust Assembly jury review process. Randomly selected members of
              your Assembly will evaluate each submission for accuracy, newsworthiness, and quality.
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
              <strong>Even if these arguments appear correct, juries may not approve them.</strong> The jury process
              is adversarial by design.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button className="ta-btn-secondary" onClick={() => setShowConfirm(false)}>
                Go Back
              </button>
              <button className="ta-btn-primary" onClick={handleSubmit} style={{ fontSize: 14, padding: "10px 22px" }}>
                I understand — Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

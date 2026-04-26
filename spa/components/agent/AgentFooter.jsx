import React, { useState, useRef, useEffect } from "react";

// Trust Assembly Agent — page footer
// --------------------------------------
// Links to AI Agent documentation + bulk upload for users who use
// their own AI tools (ChatGPT, Gemini, local models, etc.)

const LLM_PROMPT = `I need you to fact-check the following article(s) for Trust Assembly, a civic fact-checking platform. For each article, analyze it for factual accuracy and output a JSON object I can paste directly into their system.

For each article URL I give you:
1. Read the article carefully
2. Identify the main factual claims
3. Determine if the headline is accurate, misleading, or needs correction
4. Find exact verbatim quotes from the article that support your conclusions
5. Classify as "correction" (headline is misleading) or "affirmation" (headline is accurate and important)

Output ONLY valid JSON in this exact format — no other text before or after:

{
  "submissions": [
    {
      "url": "the article URL",
      "originalHeadline": "the article's actual headline",
      "submissionType": "correction or affirmation",
      "replacement": "corrected headline (only if submissionType is correction, omit for affirmation)",
      "reasoning": "Your detailed explanation of why this is a correction or affirmation. Cite specific claims. Max 2000 characters.",
      "evidence": [
        {
          "description": "What this evidence shows",
          "quote": "Exact verbatim quote from the article — copy it character for character",
          "url": "URL of external source if citing something outside the article"
        }
      ]
    }
  ],
  "vaultEntries": [
    {
      "type": "vault",
      "assertion": "A simple declarative fact. Then supporting context.",
      "evidence": "Source or reference for this fact."
    }
  ]
}

Rules:
- Every evidence item MUST include a "quote" field with an EXACT quote from the article
- Standing corrections (vault entries) should start with a simple declarative fact
- Generate many vault entries — every reusable factual claim worth preserving
- submissionType must be exactly "correction" or "affirmation"
- Do not include any text outside the JSON object

Here are the article(s) to analyze:`;

const UPLOAD_FORMAT = {
  description: "Trust Assembly Bulk Submission Format (v1)",
  example: {
    submissions: [
      {
        url: "https://example.com/article",
        originalHeadline: "The Original Article Headline",
        submissionType: "correction",
        replacement: "The Corrected Headline",
        reasoning: "The article claims X but evidence shows Y. [max 2000 chars]",
        evidence: [
          { description: "Court records show...", quote: "Exact quote from article", url: "https://source.com" }
        ],
        inlineEdits: [
          { original: "text in article that is wrong", replacement: "what it should say", reasoning: "why" }
        ]
      }
    ],
    vaultEntries: [
      { type: "vault", assertion: "Simple factual statement.", evidence: "Supporting evidence with source." },
      { type: "translation", original: "jargon phrase", translated: "plain language", translationType: "propaganda" }
    ]
  }
};

export default function AgentFooter({ onUpload }) {
  const [showFormat, setShowFormat] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [pastedJson, setPastedJson] = useState("");
  const [parsedData, setParsedData] = useState(null);
  const [assemblies, setAssemblies] = useState([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!showFormat) return;
    fetch("/api/users/me/assemblies")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const list = data?.joined || [];
        setAssemblies(list);
        if (list.length > 0) setSelectedOrgIds([list[0].id]);
      })
      .catch(() => {});
  }, [showFormat]);

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.submissions || !Array.isArray(data.submissions)) {
        setUploadResult({ error: "Invalid format: must have a 'submissions' array." });
        return;
      }

      // Validate each submission has required fields
      const errors = [];
      data.submissions.forEach((sub, i) => {
        if (!sub.url) errors.push(`Submission ${i + 1}: missing url`);
        if (!sub.originalHeadline) errors.push(`Submission ${i + 1}: missing originalHeadline`);
        if (!sub.submissionType) errors.push(`Submission ${i + 1}: missing submissionType (correction or affirmation)`);
        if (!sub.reasoning) errors.push(`Submission ${i + 1}: missing reasoning`);
      });

      if (errors.length > 0) {
        setUploadResult({ error: `Validation errors:\n${errors.join("\n")}` });
        return;
      }

      setParsedData(data);
      setSubmitResult(null);
      setUploadResult({
        success: true,
        message: `Parsed ${data.submissions.length} submission${data.submissions.length === 1 ? "" : "s"} and ${(data.vaultEntries || []).length} vault entries. Select an assembly and submit.`,
      });

      if (onUpload) onUpload(data);
    } catch (err) {
      setUploadResult({ error: `Failed to parse JSON: ${err.message}` });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div style={{ marginTop: 48, padding: "24px 24px 32px", borderTop: "1px solid var(--border)" }}>
      {/* Links */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", marginBottom: 20 }}>
        <a
          href="/ai-agents"
          style={{ fontSize: 12, color: "var(--gold)", textDecoration: "none", fontFamily: "var(--mono)" }}
        >
          How AI Agents Work
        </a>
        <span style={{ color: "var(--border)" }}>|</span>
        <a
          href="/guide"
          style={{ fontSize: 12, color: "var(--gold)", textDecoration: "none", fontFamily: "var(--mono)" }}
        >
          Submission Guide
        </a>
        <span style={{ color: "var(--border)" }}>|</span>
        <span
          onClick={() => setShowFormat(!showFormat)}
          style={{ fontSize: 12, color: "var(--gold)", cursor: "pointer", fontFamily: "var(--mono)" }}
        >
          {showFormat ? "Hide Bulk Upload Format" : "Bulk Upload (use your own AI)"}
        </span>
      </div>

      {showFormat && (
        <div style={{
          maxWidth: 720, margin: "0 auto",
          background: "var(--card-bg)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "20px 24px",
        }}>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
            Bulk Upload — Use Your Own AI
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
            Use ChatGPT, Gemini, Claude, or any AI to analyze articles. Copy the prompt below into your AI,
            paste the article URLs, then paste the JSON output here. Costs 1 credit per submission.
          </p>

          {/* Step 1: Copy the prompt */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontFamily: "var(--serif)", fontSize: 13, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 6 }}>
              Step 1: Copy this prompt into your AI
            </label>
            <pre style={{
              padding: "12px 14px", background: "var(--bg)", borderRadius: 4,
              border: "1px solid var(--border)", fontSize: 11, fontFamily: "var(--mono)",
              color: "var(--text)", overflow: "auto", maxHeight: 250, lineHeight: 1.6,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
{LLM_PROMPT}
            </pre>
            <button
              onClick={() => navigator.clipboard?.writeText(LLM_PROMPT)}
              className="ta-btn-secondary"
              style={{ fontSize: 11, padding: "5px 14px", marginTop: 6 }}
            >
              Copy Prompt
            </button>
          </div>

          {/* Step 2: Paste the JSON output */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontFamily: "var(--serif)", fontSize: 13, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 6 }}>
              Step 2: Paste the JSON output from your AI
            </label>
            <textarea
              value={pastedJson}
              onChange={(e) => setPastedJson(e.target.value)}
              placeholder='Paste the JSON here — it should start with { "submissions": [ ...'
              disabled={submitting}
              style={{
                width: "100%", minHeight: 120, padding: "10px 12px",
                fontFamily: "var(--mono)", fontSize: 11,
                border: "1px solid var(--border)", borderRadius: 4,
                background: "var(--bg)", color: "var(--text)", resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button
                className="ta-btn-primary"
                disabled={!pastedJson.trim() || uploading}
                onClick={() => {
                  try {
                    const data = JSON.parse(pastedJson.trim());
                    if (!data.submissions || !Array.isArray(data.submissions)) {
                      setUploadResult({ error: "Invalid format: must have a 'submissions' array." });
                      return;
                    }
                    const errors = [];
                    data.submissions.forEach((sub, i) => {
                      if (!sub.url) errors.push(`Submission ${i + 1}: missing url`);
                      if (!sub.originalHeadline) errors.push(`Submission ${i + 1}: missing originalHeadline`);
                      if (!sub.submissionType) errors.push(`Submission ${i + 1}: missing submissionType`);
                      if (!sub.reasoning) errors.push(`Submission ${i + 1}: missing reasoning`);
                    });
                    if (errors.length > 0) {
                      setUploadResult({ error: `Validation errors:\n${errors.join("\n")}` });
                      return;
                    }
                    setParsedData(data);
                    setSubmitResult(null);
                    setUploadResult({
                      success: true,
                      message: `Parsed ${data.submissions.length} submission${data.submissions.length === 1 ? "" : "s"} and ${(data.vaultEntries || []).length} vault entries. Select an assembly and submit.`,
                    });
                  } catch (e) {
                    setUploadResult({ error: `Invalid JSON: ${e.message}` });
                  }
                }}
                style={{ fontSize: 12, padding: "6px 16px" }}
              >
                Validate Pasted JSON
              </button>
              <button
                className="ta-btn-secondary"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                style={{ fontSize: 12, padding: "6px 16px" }}
              >
                Upload .json File
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                disabled={uploading}
                style={{ display: "none" }}
              />
            </div>
          </div>

          {uploadResult && (
            <div style={{
              padding: "10px 14px", borderRadius: 4, fontSize: 12, lineHeight: 1.5,
              background: uploadResult.error ? "rgba(196,77,77,0.1)" : "rgba(74,140,92,0.1)",
              border: `1px solid ${uploadResult.error ? "var(--red)" : "var(--green)"}`,
              color: uploadResult.error ? "var(--red)" : "var(--green)",
              whiteSpace: "pre-wrap",
            }}>
              {uploadResult.error || uploadResult.message}
            </div>
          )}

          {/* Assembly selector + submit button after successful parse */}
          {parsedData && !submitResult && (
            <div style={{
              marginTop: 12, padding: "14px 16px",
              background: "var(--bg)", borderRadius: 6, border: "1px solid var(--gold)",
            }}>
              <label style={{ fontFamily: "var(--serif)", fontSize: 13, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 6 }}>
                Submit to Assembly
              </label>
              {assemblies.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                  No assemblies found. Join an assembly first to submit.
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {assemblies.map((a) => {
                      const sel = selectedOrgIds.includes(a.id);
                      return (
                        <span
                          key={a.id}
                          onClick={() => {
                            if (sel) setSelectedOrgIds(selectedOrgIds.filter((id) => id !== a.id));
                            else setSelectedOrgIds([...selectedOrgIds, a.id]);
                          }}
                          style={{
                            fontFamily: "var(--mono)", fontSize: 11, padding: "4px 12px",
                            background: sel ? "var(--text)" : "var(--card-bg)",
                            color: sel ? "var(--card-bg)" : "var(--text)",
                            border: `1px solid ${sel ? "var(--text)" : "var(--border)"}`,
                            borderRadius: 14, cursor: "pointer", userSelect: "none",
                          }}
                        >
                          {a.name}
                        </span>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
                    Cost: {parsedData.submissions.length} credit{parsedData.submissions.length === 1 ? "" : "s"} (1 per submission)
                  </div>
                  <button
                    className="ta-btn-primary"
                    disabled={submitting || selectedOrgIds.length === 0}
                    onClick={async () => {
                      setSubmitting(true);
                      try {
                        const res = await fetch("/api/agent/bulk-submit", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            submissions: parsedData.submissions,
                            vaultEntries: parsedData.vaultEntries || [],
                            orgIds: selectedOrgIds,
                          }),
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setSubmitResult({
                            success: true,
                            message: `Submitted ${data.submitted} correction${data.submitted === 1 ? "" : "s"}/affirmation${data.submitted === 1 ? "" : "s"} and ${data.vaultCreated} vault entries. ${data.errors?.length || 0} errors. Credits remaining: ${data.creditsRemaining}.`,
                          });
                          setParsedData(null);
                        } else {
                          setSubmitResult({ error: data.error || "Submission failed." });
                        }
                      } catch (e) {
                        setSubmitResult({ error: e.message || "Network error." });
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    style={{ width: "100%", fontSize: 14, padding: "10px 0" }}
                  >
                    {submitting
                      ? `Submitting ${parsedData.submissions.length} items...`
                      : `Submit All (${parsedData.submissions.length} submissions${(parsedData.vaultEntries || []).length > 0 ? ` + ${parsedData.vaultEntries.length} vault` : ""})`}
                  </button>
                </>
              )}
            </div>
          )}

          {submitResult && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 4, fontSize: 12, lineHeight: 1.5,
              background: submitResult.error ? "rgba(196,77,77,0.1)" : "rgba(74,140,92,0.1)",
              border: `1px solid ${submitResult.error ? "var(--red)" : "var(--green)"}`,
              color: submitResult.error ? "var(--red)" : "var(--green)",
            }}>
              {submitResult.error || submitResult.message}
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
            <strong>Required fields per submission:</strong> url, originalHeadline, submissionType (correction/affirmation), reasoning
            <br />
            <strong>Optional:</strong> replacement (for corrections), evidence array, inlineEdits array
            <br />
            <strong>Vault entries:</strong> type (vault/argument/translation) + type-specific fields
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "var(--text-muted)" }}>
        Trust Assembly Agent — Truth Will Out.
      </div>
    </div>
  );
}

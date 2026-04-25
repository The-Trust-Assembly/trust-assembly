import React, { useState, useRef } from "react";

// Trust Assembly Agent — page footer
// --------------------------------------
// Links to AI Agent documentation + bulk upload for users who use
// their own AI tools (ChatGPT, Gemini, local models, etc.)

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
  const fileRef = useRef(null);

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

      setUploadResult({
        success: true,
        message: `Parsed ${data.submissions.length} submission${data.submissions.length === 1 ? "" : "s"} and ${(data.vaultEntries || []).length} vault entries. Ready for review.`,
        data,
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
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 12 }}>
            Use ChatGPT, Gemini, Claude, or any AI tool to analyze articles. Export the results as a JSON file
            matching the format below, then upload it here. Your submissions go through the same review and
            jury process as agent-generated ones.
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
              JSON Format (copy this as a template):
            </label>
            <pre style={{
              padding: "12px 14px", background: "var(--bg)", borderRadius: 4,
              border: "1px solid var(--border)", fontSize: 10, fontFamily: "var(--mono)",
              color: "var(--text)", overflow: "auto", maxHeight: 300, lineHeight: 1.5,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {JSON.stringify(UPLOAD_FORMAT.example, null, 2)}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(JSON.stringify(UPLOAD_FORMAT.example, null, 2));
              }}
              className="ta-btn-secondary"
              style={{ fontSize: 10, padding: "4px 12px", marginTop: 6 }}
            >
              Copy Template
            </button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontFamily: "var(--serif)", fontSize: 13, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 6 }}>
              Upload JSON File
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{ fontSize: 12, color: "var(--text)" }}
            />
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

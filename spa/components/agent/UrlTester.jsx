import React, { useState } from "react";

// Trust Assembly Agent — URL tester + input
// --------------------------------------------
// Lets users paste specific article URLs to include in a scan.
// Tests each URL with a preflight fetch (no credits, no LLM) to
// confirm the content is extractable before committing to analysis.

export default function UrlTester({ onUrlsConfirmed }) {
  const [urlInput, setUrlInput] = useState("");
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState(null);

  async function handleTest() {
    const urls = urlInput
      .split(/[\n,]/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0 && (u.startsWith("http://") || u.startsWith("https://")));

    if (urls.length === 0) return;
    setTesting(true);
    setResults(null);

    try {
      const res = await fetch("/api/agent/test-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      setResults(data);
    } catch (e) {
      setResults({ error: e.message || "Network error" });
    } finally {
      setTesting(false);
    }
  }

  function handleConfirm() {
    if (!results?.results) return;
    const passed = results.results.filter((r) => r.success).map((r) => r.url);
    if (passed.length > 0 && onUrlsConfirmed) {
      onUrlsConfirmed(passed);
    }
  }

  const passedCount = results?.passed || 0;
  const failedCount = results?.failed || 0;

  return (
    <div style={{
      padding: "14px 16px", background: "var(--bg)",
      border: "1px solid var(--border)", borderRadius: 6,
    }}>
      <label style={{
        display: "block", fontFamily: "var(--serif)", fontSize: 13,
        fontWeight: 600, color: "var(--text)", marginBottom: 4,
      }}>
        Include Specific URLs
      </label>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.5 }}>
        Paste article URLs to include in the scan (one per line or comma-separated).
        We'll test each one to make sure we can extract the content before using credits.
      </div>
      <textarea
        value={urlInput}
        onChange={(e) => setUrlInput(e.target.value)}
        placeholder={"https://www.example.com/article-1\nhttps://www.example.com/article-2"}
        disabled={testing}
        style={{
          width: "100%", minHeight: 70, padding: "8px 10px",
          fontFamily: "var(--mono)", fontSize: 11,
          border: "1px solid var(--border)", borderRadius: 4,
          background: "var(--card-bg)", color: "var(--text)", resize: "vertical",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button
          className="ta-btn-secondary"
          onClick={handleTest}
          disabled={testing || !urlInput.trim()}
          style={{ fontSize: 12, padding: "6px 16px" }}
        >
          {testing ? "Testing..." : "Test URLs"}
        </button>
        {passedCount > 0 && (
          <button
            className="ta-btn-primary"
            onClick={handleConfirm}
            style={{ fontSize: 12, padding: "6px 16px" }}
          >
            Add {passedCount} URL{passedCount === 1 ? "" : "s"} to Scan
          </button>
        )}
      </div>

      {results?.error && (
        <div style={{
          marginTop: 8, padding: "8px 12px", borderRadius: 4,
          background: "rgba(196,77,77,0.1)", border: "1px solid var(--red)",
          color: "var(--red)", fontSize: 12,
        }}>
          {results.error}
        </div>
      )}

      {results?.results && (
        <div style={{ marginTop: 8 }}>
          {results.results.map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex", gap: 8, alignItems: "flex-start",
                padding: "6px 10px", marginBottom: 4,
                background: "var(--card-bg)", borderRadius: 4,
                borderLeft: `3px solid ${r.success ? "var(--green)" : "var(--red)"}`,
                fontSize: 11,
              }}
            >
              <span style={{
                flexShrink: 0, width: 18, height: 18, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: r.success ? "var(--green)" : "var(--red)",
                color: "white", fontSize: 10, fontWeight: 700,
              }}>
                {r.success ? "✓" : "✗"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)", wordBreak: "break-all" }}>
                  {r.url}
                </div>
                {r.success ? (
                  <div style={{ color: "var(--green)", marginTop: 2 }}>
                    {r.headline && <span style={{ fontWeight: 600 }}>{r.headline}</span>}
                    {r.headline && " — "}
                    {r.wordCount.toLocaleString()} words extracted
                  </div>
                ) : (
                  <div style={{ color: "var(--red)", marginTop: 2 }}>
                    {r.error}
                  </div>
                )}
              </div>
            </div>
          ))}
          {failedCount > 0 && (
            <div style={{
              marginTop: 6, padding: "8px 12px", borderRadius: 4,
              background: "rgba(196,77,77,0.08)", border: "1px solid var(--border)",
              fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6,
            }}>
              {failedCount} URL{failedCount === 1 ? "" : "s"} couldn't be scanned automatically.
              You can still submit {failedCount === 1 ? "it" : "them"} manually using the regular{" "}
              <a href="/submit" style={{ color: "var(--gold)" }}>Submit</a> page.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

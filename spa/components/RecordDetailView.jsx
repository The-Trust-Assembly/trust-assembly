import React, { useState } from "react";
import { anonName, sDate } from "../lib/utils";
import { UsernameLink, SubHeadline, StatusPill, AuditTrail, Icon } from "./ui";

// Deterministic anonymous ID from a seed string — same input always produces same output
function stableAnonId(prefix, seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return `${prefix}-${1000 + Math.abs(h % 9000)}`;
}

// Safe href — only allow http(s) URLs
function safeHref(url) {
  try { const u = new URL(String(url)); return ["http:", "https:"].includes(u.protocol) ? url : "#"; }
  catch { return "#"; }
}

const emptyState = <div style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>None submitted</div>;

export default function RecordDetailView({ sub, onViewCitizen, status }) {
  if (!sub) return null;
  const [openRibbons, setOpenRibbons] = useState({ article: true, headline: true, edits: true, thecase: true, verdict: true });
  const toggle = (key) => setOpenRibbons(prev => ({ ...prev, [key]: !prev[key] }));

  const inlineEditCount = sub.inlineEdits?.length || 0;
  const approvedEdits = sub.inlineEdits?.filter(e => e.approved)?.length || 0;
  const rejectedEdits = sub.inlineEdits?.filter(e => e.approved === false)?.length || 0;

  // Vault entries
  const vaultItems = [];
  if (sub.standingCorrection) vaultItems.push({ type: "FACT", content: sub.standingCorrection.assertion, detail: sub.standingCorrection.evidence });
  if (sub.argumentEntry) vaultItems.push({ type: "ARGUMENT", content: sub.argumentEntry.content });
  if (sub.beliefEntry) vaultItems.push({ type: "BELIEF", content: sub.beliefEntry.content });
  if (sub.translationEntry) vaultItems.push({ type: "TRANSLATION", content: `"${sub.translationEntry.original}" → "${sub.translationEntry.translated}"` });
  if (sub.linkedVaultEntries) sub.linkedVaultEntries.forEach(e => vaultItems.push({ type: (e.type || "FACT").toUpperCase(), content: e.label, detail: e.detail }));

  // Evidence
  const evidenceCount = sub.evidence?.length || 0;

  // Jury votes
  const allVotes = { ...(sub.votes || {}), ...(sub.crossGroupVotes || {}) };
  const voteEntries = Object.entries(allVotes);
  const approveCount = voteEntries.filter(([, v]) => v.approve).length;
  const rejectCount = voteEntries.filter(([, v]) => !v.approve).length;

  // Build deterministic anon map for juror privacy (secret ballot)
  const anonId = (voter) => stableAnonId("Juror", (sub.id || "") + voter);

  // Extract domain from URL
  let domain = "";
  try { domain = new URL(String(sub.url)).hostname.replace(/^www\./, ""); } catch {}

  return (
    <div>
      {/* Card header: submitter identity + status stamp */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          <UsernameLink username={sub.resolvedAt ? sub.submittedBy : null} onClick={onViewCitizen} />
          {!sub.resolvedAt && <span className="hidden-user">{anonName(sub.submittedBy, sub.anonMap, false)}</span>}
          <span style={{ marginLeft: 4 }}>· {sub.orgName} · {sDate(sub.createdAt)}</span>
          {sub.trustedSkip && <span> · <Icon name="trust-badge" size={14} /> Trusted</span>}
          {sub.isDI && <span> · <Icon name="robot" size={14} /> DI</span>}
        </div>
        {status && <StatusPill status={status} />}
      </div>

      {/* 01: The Article */}
      <div className="ribbon">
        <div className={`ribbon-head ${openRibbons.article ? "open" : "closed"}`} onClick={() => toggle("article")}>
          <div><span className="ribbon-num">01</span><span className="ribbon-title">The Article</span></div>
          <span className="ribbon-arrow" style={{ transform: openRibbons.article ? "rotate(180deg)" : "none" }}>▼</span>
        </div>
        {openRibbons.article && (
          <div className="ribbon-body">
            <a href={safeHref(sub.url)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--gold)", marginBottom: 4, textDecoration: "none", wordBreak: "break-all", display: "block" }}>{sub.url}</a>
            {domain && <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 4 }}>{domain}</div>}
            <div style={{ fontSize: 10, color: "var(--text-sec)" }}>Author: {sub.author || <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>Not specified</span>}</div>
          </div>
        )}
      </div>

      {/* 02: Headline Rewrites */}
      <div className="ribbon">
        <div className={`ribbon-head ${openRibbons.headline ? "open" : "closed"}`} onClick={() => toggle("headline")}>
          <div><span className="ribbon-num">02</span><span className="ribbon-title">Headline Rewrites</span></div>
          <span className="ribbon-arrow" style={{ transform: openRibbons.headline ? "rotate(180deg)" : "none" }}>▼</span>
        </div>
        {openRibbons.headline && (
          <div className="ribbon-body">
            <SubHeadline sub={sub} />
            <div className="field-label" style={{ marginTop: 8 }}>Reasoning</div>
            {sub.reasoning
              ? <div style={{ fontSize: 10, color: "var(--text-sec)", lineHeight: 1.6 }}>{sub.reasoning}</div>
              : emptyState}
          </div>
        )}
      </div>

      {/* 03: Article Edits */}
      <div className="ribbon">
        <div className={`ribbon-head ${openRibbons.edits ? "open" : "closed"}`} onClick={() => toggle("edits")}>
          <div>
            <span className="ribbon-num">03</span>
            <span className="ribbon-title">Article Edits</span>
            {inlineEditCount > 0 && (
              <span className="ribbon-meta" style={{ color: approvedEdits > 0 ? "var(--green)" : "var(--text-muted)" }}>
                {approvedEdits} approved{rejectedEdits > 0 ? `, ${rejectedEdits} rejected` : ""}
              </span>
            )}
          </div>
          <span className="ribbon-arrow" style={{ transform: openRibbons.edits ? "rotate(180deg)" : "none" }}>▼</span>
        </div>
        {openRibbons.edits && (
          <div className="ribbon-body">
            {inlineEditCount === 0 ? emptyState : (
              <>
                <div style={{ fontSize: 9, color: "var(--gold)", letterSpacing: "1px", fontWeight: 600, marginBottom: 6 }}>
                  {inlineEditCount} EDIT{inlineEditCount > 1 ? "S" : ""} ({approvedEdits} APPROVED, {rejectedEdits} REJECTED)
                </div>
                {sub.inlineEdits.map((e, i) => (
                  <div key={i} style={{ background: "var(--card-bg)", border: "1px solid var(--border)", padding: 12, marginBottom: 6 }}>
                    <div style={{ fontSize: 8, letterSpacing: "1px", textTransform: "uppercase", color: "var(--red)", marginBottom: 3, fontWeight: 700 }}>Edit {i + 1} — original</div>
                    <div style={{ fontSize: 11, color: "var(--red)", textDecoration: "line-through", lineHeight: 1.6, marginBottom: 8 }}>{e.original}</div>
                    <div style={{ fontSize: 8, letterSpacing: "1px", textTransform: "uppercase", color: "var(--green)", marginBottom: 3, fontWeight: 700 }}>Replacement</div>
                    <div style={{ fontSize: 11, color: "var(--green)", lineHeight: 1.6, borderLeft: "3px solid var(--green)", paddingLeft: 8 }}>{e.replacement}</div>
                    {e.reasoning && <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>↳ {e.reasoning}</div>}
                    {e.approved !== undefined && (
                      <div style={{ marginTop: 4 }}>
                        <StatusPill status={e.approved ? "approved" : "rejected"} />
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* 04: The Case */}
      <div className="ribbon">
        <div className={`ribbon-head ${openRibbons.thecase ? "open" : "closed"}`} onClick={() => toggle("thecase")}>
          <div>
            <span className="ribbon-num">04</span>
            <span className="ribbon-title">The Case</span>
            {(evidenceCount > 0 || vaultItems.length > 0) && (
              <span className="ribbon-meta">{evidenceCount + vaultItems.length} item{(evidenceCount + vaultItems.length) > 1 ? "s" : ""}</span>
            )}
          </div>
          <span className="ribbon-arrow" style={{ transform: openRibbons.thecase ? "rotate(180deg)" : "none" }}>▼</span>
        </div>
        {openRibbons.thecase && (
          <div className="ribbon-body">
            {/* Evidence */}
            <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", marginBottom: 4, fontWeight: 600 }}>Evidence</div>
            {evidenceCount === 0 ? emptyState : sub.evidence.map((e, i) => (
              <div key={i} style={{ fontSize: 9, marginTop: 4, marginBottom: 4 }}>
                <a href={safeHref(e.url)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)", textDecoration: "none", wordBreak: "break-all" }}>{e.url}</a>
                {e.explanation && <div style={{ color: "var(--text-muted)", marginTop: 1 }}>↳ {e.explanation}</div>}
              </div>
            ))}

            {/* Vault entries */}
            <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", marginTop: 10, marginBottom: 4, fontWeight: 600 }}>Vault Artifacts</div>
            {vaultItems.length === 0 ? emptyState : vaultItems.map((item, i) => (
              <div key={i} style={{ background: "var(--card-bg)", border: "1px solid var(--border)", padding: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 9, color: "var(--gold)", letterSpacing: "1px", fontWeight: 600 }}>{item.type}</div>
                <div style={{ fontSize: 10, marginTop: 2, color: "var(--text)" }}>{item.content}</div>
                {item.detail && <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{item.detail}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 05: Assembly Verdict */}
      <div className="ribbon">
        <div className={`ribbon-head ${openRibbons.verdict ? "open" : "closed"}`} onClick={() => toggle("verdict")}>
          <div><span className="ribbon-num">05</span><span className="ribbon-title">Assembly Verdict</span></div>
          <span className="ribbon-arrow" style={{ transform: openRibbons.verdict ? "rotate(180deg)" : "none" }}>▼</span>
        </div>
        {openRibbons.verdict && (
          <div className="ribbon-body">
            {!sub.resolvedAt || voteEntries.length === 0 ? (
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>Awaiting jury review</div>
            ) : (
              <div style={{ border: "1px solid var(--border)", marginBottom: 6 }}>
                <div style={{ padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--card-bg)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{sub.orgName}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                    <span style={{ color: "var(--green)", fontWeight: 700 }}>{approveCount}</span>
                    <span style={{ color: "var(--text-muted)" }}>·</span>
                    <span style={{ color: "var(--red)", fontWeight: 700 }}>{rejectCount}</span>
                  </div>
                </div>
                <div style={{ padding: "8px 10px" }}>
                  {voteEntries.map(([voter, v], i) => (
                    <div key={i} style={{ border: "1px solid var(--border)", marginBottom: 4 }}>
                      <div style={{ padding: "6px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg)" }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: v.approve ? "var(--green)" : "var(--red)", display: "inline-block" }} />
                          <span style={{ fontSize: 10, fontWeight: 600, marginLeft: 6 }}>{anonId(voter)}</span>
                        </div>
                        <StatusPill status={v.approve ? "approved" : "rejected"} />
                      </div>
                      {v.note && v.note.trim() && (
                        <div style={{ padding: "6px 8px", borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
                          <div style={{ fontSize: 8, letterSpacing: "1px", fontWeight: 600, marginBottom: 3, color: v.approve ? "var(--green)" : "var(--red)" }}>REASONING</div>
                          <div style={{ fontSize: 10, color: "var(--text-sec)", lineHeight: 1.5 }}>{v.note}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {sub.deliberateLieFinding && <div style={{ fontSize: 9, color: "var(--red)", fontFamily: "var(--mono)", fontWeight: 700, marginTop: 4, letterSpacing: "1px" }}>DELIBERATE DECEPTION FINDING</div>}

      <AuditTrail entries={sub.auditTrail} />
    </div>
  );
}

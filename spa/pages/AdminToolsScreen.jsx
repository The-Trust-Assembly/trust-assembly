import { useState } from "react";
import { NEWS_RUBRIC, FUN_RUBRIC } from "../lib/constants";
import { SubHeadline, RatingInput, DeliberateLieCheckbox, LegalDisclaimer, StatusPill, Icon } from "../components/ui";

// Mock submission for the test review form
const MOCK_SUB = {
  id: "mock-review-test",
  url: "https://the-daily-example.com/politics/budget-claims-debunked",
  originalHeadline: "City Announces Record $50M Investment in Public Schools",
  replacement: "Actual New Funding Is $12M — The Rest Is Pre-Existing Budget Reallocations",
  submissionType: "correction",
  reasoning: "The headline claims a '$50M investment' but the city council documents show only $12M in new funding. The remaining $38M consists of previously allocated budget lines that were consolidated under a new department heading. While technically the education department now controls $50M, presenting routine budget reorganization as 'new investment' is misleading to taxpayers who expect $50M in additional spending.",
  author: "City Desk Staff",
  orgName: "The General Public",
  createdAt: new Date().toISOString(),
  status: "pending_review",
  evidence: [
    { url: "https://citycouncil.gov/budget/2025-education-allocation", explanation: "Official budget document showing $12M in new appropriations vs. $38M in transferred line items." },
    { url: "https://comptroller.gov/reports/education-spending-breakdown", explanation: "Comptroller's analysis confirming the majority of funds were pre-existing allocations." },
  ],
  inlineEdits: [
    { original: "The $50 million represents the largest single investment in education in the city's history.", replacement: "[CORRECTION: $12M is new funding. The $50M figure includes $38M in pre-existing budget lines transferred from other departments — not new money.]", reasoning: "The article conflates budget reorganization with new spending. Council minutes show the distinction clearly." },
    { original: "Critics have praised the mayor's bold commitment to education reform.", replacement: "[CORRECTION: Several council members and the teachers' union criticized the announcement as misleading. The article omits their statements entirely.]", reasoning: "Selection bias — the article excludes dissenting voices that are documented in the public record." },
    { original: "Experts say this will transform the district within five years.", replacement: "[CORRECTION: The unnamed 'experts' are not identified. The district's own projections show marginal improvements based on the $12M in actual new funding.]", reasoning: "Unnamed sources making unsupported claims about impact based on inflated figures." },
  ],
  standingCorrection: { assertion: "Municipal budget announcements frequently conflate reorganized existing funds with new appropriations.", evidence: "Government Accountability Office, 2024 report on municipal budget transparency." },
  argumentEntry: { content: "When a government entity announces 'record investment' by consolidating existing budget lines under a new heading, the journalistic obligation is to distinguish between new appropriations and accounting reclassifications. Reporting the gross figure without context serves the administration's PR goals, not the public interest." },
  beliefEntry: { content: "Taxpayers deserve accurate information about how their money is being allocated. Budget transparency is a prerequisite for democratic accountability." },
  translationEntry: { original: "record investment", translated: "budget line consolidation marketed as new spending", type: "propaganda" },
  linkedVaultEntries: [
    { id: "ve-1", type: "correction", label: "Municipal budget announcements frequently conflate reorganized existing funds with new appropriations.", detail: "Government Accountability Office, 2024 report on municipal budget transparency.", survivalCount: 3 },
    { id: "ve-2", type: "argument", label: "When a government entity announces 'record investment' by consolidating existing budget lines, the journalistic obligation is to distinguish between new appropriations and accounting reclassifications.", survivalCount: 1 },
    { id: "ve-3", type: "belief", label: "Taxpayers deserve accurate information about how their money is being allocated.", survivalCount: 5 },
  ],
};

export default function AdminToolsScreen({ setShowOnboarding, user }) {
  const [reviewingMock, setReviewingMock] = useState(false);
  const [newsRating, setNewsRating] = useState(5);
  const [funRating, setFunRating] = useState(5);
  const [voteNote, setVoteNote] = useState("");
  const [lieChecked, setLieChecked] = useState(false);
  const [editVotes, setEditVotes] = useState({});
  const [vaultVotes, setVaultVotes] = useState({});
  const [mockVoted, setMockVoted] = useState(false);

  const sub = MOCK_SUB;

  return (
    <div>
      <div className="ta-section-rule" />
      <h2 className="ta-section-head">Admin Tools</h2>
      <p style={{ fontSize: 13, color: "var(--text-sec)", marginBottom: 20, lineHeight: 1.6 }}>Internal testing tools for the admin. These do not affect production data.</p>

      {/* ── Box 1: Test Registration Flow ── */}
      <div className="ta-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "2px", color: "var(--gold)", fontWeight: 700, marginBottom: 4 }}>Test the Registration Flow</div>
            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>Re-enter the 5-step onboarding tutorial that new users see immediately after registration. This is the exact same flow — Submit, Review, Results, Begin, Deep Dive — rendered fullscreen. Use this to test changes without creating a new account.</div>
          </div>
          <button className="ta-btn-primary" onClick={() => setShowOnboarding(true)} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>Launch Tutorial</button>
        </div>
      </div>

      {/* ── Box 2: Test Review Form ── */}
      <div className="ta-card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "2px", color: "var(--gold)", fontWeight: 700, marginBottom: 4 }}>Preview Review Form</div>
        <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, marginBottom: 12 }}>See what the production review form looks like with sample data. This renders the exact same components used in the real review queue — rating sliders, inline edit voting, vault entry voting, deception checkbox, and action buttons. Nothing is submitted.</div>
        {!mockVoted && !reviewingMock && <button className="ta-btn-primary" onClick={() => setReviewingMock(true)}>Show Test Review</button>}
        {mockVoted && <button className="ta-btn-primary" onClick={() => { setMockVoted(false); setReviewingMock(false); setVoteNote(""); setLieChecked(false); setNewsRating(5); setFunRating(5); setEditVotes({}); setVaultVotes({}); }}>Reset & Show Again</button>}
      </div>

      {/* ── Mock Review Card ── */}
      {(reviewingMock || mockVoted) && (
      <div className="ta-card" style={{ borderLeft: "4px solid #D97706", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>@testcitizen · {sub.orgName} · just now</span>
          <StatusPill status={sub.status} />
        </div>

        <a href="#" onClick={e => e.preventDefault()} style={{ fontSize: 10, color: "var(--gold)" }}>{sub.url}</a>

        <div style={{ margin: "8px 0", padding: 10, background: "var(--card-bg)", borderRadius: 0 }}>
          <SubHeadline sub={sub} />
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)", marginTop: 3 }}>Author: {sub.author}</div>
        </div>

        <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.8, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{sub.reasoning}</div>

        {/* Evidence */}
        <div style={{ marginTop: 12, padding: 12, background: "var(--card-bg)", borderRadius: 0 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--text-sec)", marginBottom: 6 }}>Evidence: {sub.evidence.length} Sources</div>
          {sub.evidence.map((e, i) => <div key={i} style={{ marginBottom: 8, fontSize: 12 }}><a href="#" onClick={ev => ev.preventDefault()} style={{ color: "var(--gold)" }}>{e.url}</a><div style={{ color: "var(--text-sec)", marginTop: 2 }}>↳ {e.explanation}</div></div>)}
        </div>

        {/* Inline edits */}
        <div style={{ marginTop: 14, padding: 12, background: "var(--card-bg)", borderRadius: 0 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--text-sec)", marginBottom: 6 }}>{sub.inlineEdits.length} In-Line Edits — {reviewingMock && !mockVoted ? "vote on each" : "line-by-line review"}</div>
          {sub.inlineEdits.map((e, i) => (
            <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < sub.inlineEdits.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 4 }}>
                <span style={{ textDecoration: "line-through", color: "var(--text-muted)" }}>{e.original}</span> → <span style={{ color: "var(--red)", fontWeight: 600 }}>{e.replacement}</span>
                <div style={{ fontSize: 12, color: "var(--text-sec)", marginTop: 1 }}>↳ {e.reasoning}</div>
              </div>
              {reviewingMock && !mockVoted && (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button onClick={() => setEditVotes(v => ({ ...v, [i]: true }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: editVotes[i] === true ? "#059669" : "var(--border)", background: editVotes[i] === true ? "#ECFDF5" : "#fff", color: editVotes[i] === true ? "#059669" : "#64748B", borderRadius: 0, cursor: "pointer" }}>✓ Approve Edit</button>
                  <button onClick={() => setEditVotes(v => ({ ...v, [i]: false }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: editVotes[i] === false ? "#DC2626" : "var(--border)", background: editVotes[i] === false ? "#FEF2F2" : "#fff", color: editVotes[i] === false ? "#DC2626" : "#64748B", borderRadius: 0, cursor: "pointer" }}>✗ Reject Edit</button>
                </div>
              )}
              {mockVoted && editVotes[i] !== undefined && <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: editVotes[i] ? "#059669" : "#DC2626", fontWeight: 700 }}>{editVotes[i] ? "✓ APPROVED" : "✗ REJECTED"}</span>}
            </div>
          ))}
        </div>

        {/* Vault entries */}
        <div style={{ marginTop: 10, padding: 10, background: "var(--card-bg)", borderRadius: 0, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "var(--text-sec)", marginBottom: 8 }}>{sub.linkedVaultEntries.length} Linked Vault Entries — vote on each</div>
          {sub.linkedVaultEntries.map(e => {
            const tc = { correction: ["vault", "#059669", "rgba(74,158,85,0.09)"], argument: ["dispute", "#0D9488", "rgba(13,148,136,0.09)"], belief: ["jury", "#7C3AED", "rgba(124,58,237,0.09)"] }[e.type] || ["vault", "#475569", "var(--card-bg)"];
            return <div key={e.id} style={{ marginBottom: 8, padding: "8px 10px", background: tc[2], border: `1px solid ${tc[1]}30`, borderRadius: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: tc[1], fontWeight: 700 }}><Icon name={tc[0]} size={16} /> Existing {e.type}{e.survivalCount > 0 ? ` · survived ${e.survivalCount} review${e.survivalCount !== 1 ? "s" : ""}` : ""}</div>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)", marginBottom: reviewingMock && !mockVoted ? 6 : 0 }}>{e.label}</div>
              {e.detail && <div style={{ fontSize: 12, color: "var(--text-sec)", marginTop: 2 }}>Source: {e.detail}</div>}
              {reviewingMock && !mockVoted && (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button onClick={() => setVaultVotes(v => ({ ...v, [e.id]: true }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes[e.id] === true ? "#059669" : "var(--border)", background: vaultVotes[e.id] === true ? "#ECFDF5" : "#fff", color: vaultVotes[e.id] === true ? "#059669" : "#64748B", borderRadius: 0, cursor: "pointer" }}>✓ Still Applies</button>
                  <button onClick={() => setVaultVotes(v => ({ ...v, [e.id]: false }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes[e.id] === false ? "#DC2626" : "var(--border)", background: vaultVotes[e.id] === false ? "#FEF2F2" : "#fff", color: vaultVotes[e.id] === false ? "#DC2626" : "#64748B", borderRadius: 0, cursor: "pointer" }}>✗ No Longer Valid</button>
                </div>
              )}
            </div>;
          })}
        </div>

        {/* Translation */}
        <div style={{ marginTop: 8, padding: 10, background: "rgba(212,168,67,0.09)", border: "1px solid #B4530980", borderRadius: 0, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#B45309", marginBottom: 3 }}><Icon name="dispute" size={16} /> Translation Proposed — {sub.translationEntry.type}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ textDecoration: "line-through", color: "var(--text-sec)" }}>{sub.translationEntry.original}</span>
            <span style={{ color: "#B45309", fontWeight: 700 }}>→</span>
            <span style={{ color: "#B45309", fontWeight: 700 }}>{sub.translationEntry.translated}</span>
          </div>
        </div>

        {/* Vote section */}
        {reviewingMock && !mockVoted && (
          <div style={{ marginTop: 12, padding: 14, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 0 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-sec)", marginBottom: 10 }}>Headline Correction Verdict</div>
            <RatingInput label="How Newsworthy" value={newsRating} onChange={setNewsRating} rubric={NEWS_RUBRIC} />
            <RatingInput label="How Interesting" value={funRating} onChange={setFunRating} rubric={FUN_RUBRIC} />
            <div className="ta-field"><label>Review Note (permanent, public){voteNote.trim().length < 50 && <span style={{ color: "var(--red)", fontSize: 10, marginLeft: 6 }}>Min 50 chars required for rejections ({voteNote.trim().length}/50)</span>}</label><textarea value={voteNote} onChange={e => setVoteNote(e.target.value)} rows={2} placeholder="Explain your reasoning... (minimum 50 characters required for rejections)" /></div>
            <DeliberateLieCheckbox checked={lieChecked} onChange={setLieChecked} />
            <div style={{ position: "sticky", bottom: 0, background: "linear-gradient(transparent, #FFFFFF 8px)", paddingTop: 10, paddingBottom: 4, zIndex: 10 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="ta-btn-primary" style={{ background: "var(--green)", flex: 1 }} onClick={() => { setMockVoted(true); setReviewingMock(false); }}>✓ Approve</button>
                <button className="ta-btn-primary" style={{ background: "var(--red)", flex: 1, opacity: voteNote.trim().length < 50 ? 0.6 : 1 }} onClick={() => { setMockVoted(true); setReviewingMock(false); }}>✗ Reject{voteNote.trim().length < 50 ? ` (${50 - voteNote.trim().length} more chars needed)` : ""}</button>
                <button className="ta-btn-ghost" onClick={() => setReviewingMock(false)}>Cancel</button>
                <button className="ta-btn-primary" style={{ background: "#EA580C" }}>Recuse</button>
              </div>
              <LegalDisclaimer short />
            </div>
          </div>
        )}

        {/* Post-vote state */}
        {mockVoted && (
          <div style={{ marginTop: 12, padding: 14, background: "rgba(74,158,85,0.09)", border: "1px solid #059669", borderRadius: 0, textAlign: "center" }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 700, color: "var(--green)", marginBottom: 6 }}>Test Vote Recorded</div>
            <p style={{ fontSize: 12, color: "var(--text-sec)", lineHeight: 1.5 }}>This is a test — no data was submitted. The form above shows exactly what a juror sees in the production review queue.</p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

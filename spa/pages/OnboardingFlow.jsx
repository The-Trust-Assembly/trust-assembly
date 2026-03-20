import { useState, useEffect, useRef } from "react";
import { ExplainBox, HighlightField, SubHeadline, StatusPill, RatingInput } from "../components/ui";
import { NEWS_RUBRIC, FUN_RUBRIC } from "../lib/constants";
import { W } from "../lib/scoring";

const OB_STEPS = ["submit", "review", "compare", "launch", "additional"];
const OB_STEP_LABELS = ["1. Submit", "2. Review", "3. Results", "4. Begin", "5. Deep Dive"];

// The sample article being corrected
const OB_ARTICLE = {
  url: "https://the-daily-falsehood.com/opinion/evil-is-good-actually",
  originalHeadline: "Evil Is Good, According to Experts",
  correctedHeadline: "Evil Remains Bad — This Piece Is Ragebait",
  author: "Staff Writer",
  originalBody: [
    "In a groundbreaking development that has shocked absolutely no one paying attention, several unnamed experts have concluded that evil is, in fact, good.",
    "Many experts agree that crime should be legal. The reasoning, according to these totally real researchers, is that if crime were legal, we wouldn't need to spend money on law enforcement.",
    "Studies show that lying to people consistently produces better outcomes than honesty. Researchers at the University of Nowhere found that subjects who were lied to reported higher satisfaction scores, primarily because they didn't know any better.",
    "Critics of this view have been largely silenced. When asked for comment, Dr. Jane Ethics of the Institute for Actual Research said the study was 'completely fabricated,' but her opinion was excluded from this article because it conflicted with our predetermined conclusion.",
    "The economic implications are staggering. If evil is good, then several major industries would need to completely restructure their moral frameworks, which consultants estimate could generate $4.2 trillion in new revenue.",
  ],
  inlineEdits: [
    { original: "Many experts agree that crime should be legal.", replacement: "[CORRECTION: No one seriously advocates legalizing crime. This is a fabricated claim with no citation because none exists.]", reasoning: "This is a fabricated claim presented as fact. No citation is provided because none exists.", paragraph: 1 },
    { original: "Studies show that lying to people consistently produces better outcomes than honesty.", replacement: "[CORRECTION: No peer-reviewed study supports this claim. Meta-analyses consistently show that institutional and interpersonal trust, built on honesty, correlates with better societal outcomes.]", reasoning: "The cited 'University of Nowhere' does not exist. The claim inverts established research findings.", paragraph: 2 },
    { original: "her opinion was excluded from this article because it conflicted with our predetermined conclusion", replacement: "[CORRECTION: The author admits to excluding contradictory expert testimony, which is a textbook example of selection bias and journalistic malpractice.]", reasoning: "The article accidentally admits to the very thing it's doing — a self-own of editorial proportions.", paragraph: 3 },
  ],
  vaultEntry: { type: "vault", assertion: "Crime is bad because it hurts people. Obviously.", evidence: "Literally all of recorded human civilization." },
  argEntry: { content: "When an article dresses up an absurd premise as serious discourse using unnamed sources and fabricated claims, the appropriate correction is to name it for what it is — ragebait — rather than dignify it with a point-by-point rebuttal." },
  beliefEntry: { content: "People deserve to not be victimized by crime. A functioning society requires that its members can reasonably expect safety from deliberate harm." },
  translationEntry: { original: "groundbreaking development", translated: "unremarkable opinion repackaged as news", type: "propaganda" },
};

const OB_AFFIRMATION = {
  url: "https://the-daily-truth.com/editorial/being-good-is-good",
  originalHeadline: "Being Good Is Good, Study Finds — And Has Been for Millennia",
  author: "Dr. Sarah Veritas",
  reasoning: "This article accurately reports a longitudinal meta-analysis published in the Journal of Moral Psychology. The study (n=42,000 across 38 countries) found robust positive correlations between prosocial behavior, community trust, and individual well-being. The headline is factual, the methodology is sound, and the conclusions are supported by the data.",
  evidence: [
    { url: "https://journal-of-moral-psych.org/2025/prosocial-meta-analysis", explanation: "The original peer-reviewed study cited in the article." },
    { url: "https://replication-project.org/prosocial-2025-confirmed", explanation: "Independent replication confirming the findings." },
  ],
  vaultEntry: { type: "vault", assertion: "Prosocial behavior correlates with improved community outcomes across cultures.", evidence: "Journal of Moral Psychology, 2025 meta-analysis (n=42,000)." },
};

// Explanation cards

function OBSubmitStep() {
  const [revealed, setRevealed] = useState(0);
  const [mode, setMode] = useState("correction"); // correction | affirmation
  useEffect(() => { const t = setInterval(() => setRevealed(r => Math.min(r + 1, 20)), 400); return () => clearInterval(t); }, []);

  const isAffirm = mode === "affirmation";
  const article = isAffirm ? OB_AFFIRMATION : OB_ARTICLE;

  return (
    <div>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>Step 1: Submit</h2>
      <p style={{ fontSize: 15, color: "#1E293B", lineHeight: 1.6, marginBottom: 14 }}>When you find an article worth reviewing, you submit either a <strong>correction</strong> (the headline is misleading) or an <strong>affirmation</strong> (the headline is accurate and deserves supporting evidence). Both go through the same jury review.</p>

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 8, overflow: "hidden", border: "1.5px solid #CBD5E1" }}>
        {[["correction", "🔴 Correction", "This headline is misleading"], ["affirmation", "🟢 Affirmation", "This headline is accurate"]].map(([key, label, desc]) => (
          <button key={key} onClick={() => setMode(key)} style={{ flex: 1, padding: "10px 8px", background: mode === key ? (key === "correction" ? "#DC2626" : "#059669") : "#FFFFFF", color: mode === key ? "#fff" : "#475569", border: "none", cursor: "pointer", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: mode === key ? 700 : 400, transition: "all 0.2s" }}>
            <div>{label}</div>
            <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.8, marginTop: 2, textTransform: "none", letterSpacing: 0 }}>{desc}</div>
          </button>
        ))}
      </div>

      <ExplainBox title={isAffirm ? "Why Affirmations Matter" : "Article URL"} icon={isAffirm ? "🟢" : "🔗"} color={isAffirm ? "#059669" : "#0D9488"}>
        {isAffirm
          ? "Not everything needs correcting. When a journalist gets it right — especially on a controversial topic — affirming their accuracy with evidence strengthens the public record. Affirmations go through the same jury review as corrections."
          : "Every correction starts with the article you're correcting. Paste the URL so jurors can read the original."}
      </ExplainBox>
      <HighlightField label="Article URL" value={article.url} note={isAffirm ? "The article you're affirming is accurate." : "This links directly to the offending article."} />

      <ExplainBox title={isAffirm ? "The Headline You're Affirming" : "The Headlines"} icon="✏️">
        {isAffirm
          ? "You quote the headline exactly. For affirmations, there's no replacement — you're confirming the original is accurate."
          : "You quote the original headline exactly, then propose your corrected replacement. Your replacement should be factual, not editorial — the goal is truth, not dunking."}
      </ExplainBox>
      <HighlightField label="Original Headline" value={article.originalHeadline} />
      <HighlightField label="Author" value={article.author} note="Captured for future writer accountability ratings." />
      {!isAffirm && <HighlightField label="Proposed Correction — the red pen" value={OB_ARTICLE.correctedHeadline} color="#DC2626" />}
      {isAffirm && <div style={{ padding: 10, background: "#ECFDF5", border: "1px solid #05966940", borderRadius: 8, marginBottom: 14, fontSize: 13, color: "#059669" }}>✓ You are affirming this headline is <strong>accurate</strong>. Provide your reasoning and evidence below.</div>}

      <HighlightField label="Reasoning" value={isAffirm ? article.reasoning : "The article presents the claim 'evil is good' as though it were a serious argument. No substantive case is made — the piece relies on fabricated quotes, unnamed sources, and admitted exclusion of contradictory views. This is textbook ragebait designed to provoke, not inform."} isTextarea note={isAffirm ? "Explain WHY this headline is accurate. Cite the evidence." : "Explain WHY the original is misleading. This is what jurors evaluate."} />

      {revealed >= 2 && !isAffirm && <>
        <ExplainBox title="Supporting Evidence" icon="📎" color="#059669">You can attach URLs that support your correction — news articles, studies, primary sources. Each one gets an explanation of what it proves.</ExplainBox>
        <div style={{ padding: 12, background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>Evidence #1</div>
          <div style={{ fontSize: 13 }}><a href="#" style={{ color: "#0D9488" }}>https://ethics-institute.org/evil-still-bad-2025</a></div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>↳ Comprehensive analysis confirming evil remains bad. Sample size: all of human history.</div>
        </div>
      </>}

      {revealed >= 2 && isAffirm && <>
        <ExplainBox title="Supporting Evidence" icon="📎" color="#059669">Affirmations are strongest with evidence. Link the original study, primary sources, or independent verification.</ExplainBox>
        {OB_AFFIRMATION.evidence.map((e, i) => (
          <div key={i} style={{ padding: 12, background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>Evidence #{i + 1}</div>
            <div style={{ fontSize: 13 }}><a href="#" style={{ color: "#0D9488" }}>{e.url}</a></div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>↳ {e.explanation}</div>
          </div>
        ))}
      </>}

      {revealed >= 3 && !isAffirm && <>
        <ExplainBox title="In-Line Article Edits" icon="🔴" color="#DC2626">Beyond the headline, you can correct specific claims within the article body — up to 20 edits per article. Each edit is voted on independently by jurors, so a strong headline can survive even if one edit is weak. Each edit shows the original text, your correction, and your reasoning.</ExplainBox>
        <div style={{ padding: 14, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B", marginBottom: 8 }}>3 In-Line Edits</div>
          {OB_ARTICLE.inlineEdits.map((edit, i) => (
            <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < 2 ? "1px solid #E2E8F0" : "none" }}>
              <div style={{ fontSize: 12, textDecoration: "line-through", textDecorationColor: "#DC2626", color: "#475569", marginBottom: 3 }}>{edit.original}</div>
              <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600, marginBottom: 3 }}>{edit.replacement}</div>
              <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic" }}>↳ {edit.reasoning}</div>
            </div>
          ))}
        </div>
      </>}

      {revealed >= 5 && <>
        <ExplainBox title="Vault Artifacts" icon="📦" color="#475569">
          Submissions can include vault entries — reusable knowledge that your Assembly builds over time. Entries can be <strong>new</strong> (proposed with this submission, pending until the submission is approved) or <strong>preexisting</strong> (already in your Assembly's vault, linked to show relevance). Jurors vote on each independently.
        </ExplainBox>

        <div style={{ padding: 12, background: "#EFF6FF", border: "1px solid #CBD5E1", borderRadius: 8, marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 4 }}>🏛 Standing Correction <span style={{ color: "#D97706", fontWeight: 400, textTransform: "none" }}>— NEW (proposed with this submission)</span></div>
          <div style={{ fontSize: 14, fontFamily: "var(--serif)", fontWeight: 600, marginBottom: 3 }}>{(isAffirm ? OB_AFFIRMATION : OB_ARTICLE).vaultEntry.assertion}</div>
          <div style={{ fontSize: 12, color: "#0D9488" }}>{(isAffirm ? OB_AFFIRMATION : OB_ARTICLE).vaultEntry.evidence}</div>
        </div>

        {!isAffirm && <>
          <div style={{ padding: 12, background: "#EFF6FF", border: "1px solid #CBD5E1", borderRadius: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#0D9488", marginBottom: 4 }}>⚔️ Argument <span style={{ color: "#D97706", fontWeight: 400, textTransform: "none" }}>— NEW (proposed with this submission)</span></div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>{OB_ARTICLE.argEntry.content}</div>
          </div>

          <div style={{ padding: 12, background: "#F3E8F9", border: "1px solid #9B7DB8", borderRadius: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#7C3AED", marginBottom: 4 }}>🧭 Foundational Belief <span style={{ color: "#D97706", fontWeight: 400, textTransform: "none" }}>— NEW (proposed with this submission)</span></div>
            <div style={{ fontSize: 13, lineHeight: 1.6, fontStyle: "italic" }}>{OB_ARTICLE.beliefEntry.content}</div>
          </div>

          <ExplainBox title="Translations — Take Back Your Language" icon="🔄" color="#B45309">
            Translations strip propaganda, jargon, and euphemisms from language. Governments name bills to manipulate you. Corporations invent jargon to obscure what they're doing. Media uses euphemisms to soften hard truths. You no longer have to use other people's language that's designed to manipulate you. Approved translations are applied automatically by the browser extension — everywhere, across every article that uses the phrase.
          </ExplainBox>
          <div style={{ padding: 12, background: "#FFFBEB", border: "1px solid #B4530940", borderRadius: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#B45309", marginBottom: 4 }}>🔄 Translation <span style={{ color: "#D97706", fontWeight: 400, textTransform: "none" }}>— NEW (proposed with this submission)</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <span style={{ textDecoration: "line-through", color: "#475569" }}>{OB_ARTICLE.translationEntry.original}</span>
              <span style={{ color: "#B45309", fontWeight: 700 }}>→</span>
              <span style={{ color: "#B45309", fontWeight: 700 }}>{OB_ARTICLE.translationEntry.translated}</span>
            </div>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#64748B", marginTop: 4 }}>Type: Anti-Propaganda</div>
          </div>
        </>}
      </>}
    </div>
  );
}

// ── Step 2: Review ──
function OBReviewStep() {
  const [newsRating, setNewsRating] = useState(8);
  const [funRating, setFunRating] = useState(9);
  const [lieChecked, setLieChecked] = useState(false);
  const [voteNote, setVoteNote] = useState("");
  const [voted, setVoted] = useState(false);
  const [editVotes, setEditVotes] = useState({ 0: true, 1: true, 2: true }); // default approve all
  const [vaultVotes, setVaultVotes] = useState({ sc: true, arg: true, belief: true }); // default still applies

  return (
    <div>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>Step 2: Jury Review</h2>
      <p style={{ fontSize: 15, color: "#1E293B", lineHeight: 1.6, marginBottom: 6 }}>After submission, randomly selected jurors from your Assembly review your correction. Here's what a juror sees.</p>

      <ExplainBox title="Important" icon="⚖️" color="#EA580C">In the real system, you can never review your own submissions. We're showing you the review experience so you understand what happens to your work. Jurors are randomly selected and can't see each other's votes until all have voted.</ExplainBox>

      {/* The submission card */}
      <div style={{ background: "#fff", border: "1px solid #E2E8F0", padding: 16, marginBottom: 16, borderLeft: "4px solid #D97706", borderRadius: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}>@you · The General Public · just now</span>
          <span style={{ fontSize: 10, padding: "2px 7px", background: "#FFF7ED", color: "#EA580C", borderRadius: 8, fontFamily: "var(--mono)", textTransform: "uppercase", fontWeight: 700 }}>Under Review</span>
        </div>
        <a href="#" style={{ fontSize: 10, color: "#0D9488" }}>{OB_ARTICLE.url}</a>
        <div style={{ margin: "8px 0", padding: 10, background: "#F9FAFB", borderRadius: 8 }}>
          <div style={{ fontFamily: "var(--serif)", textDecoration: "line-through", textDecorationColor: "#DC2626", color: "#475569", fontSize: 14 }}>{OB_ARTICLE.originalHeadline}</div>
          <div style={{ fontFamily: "var(--serif)", color: "#DC2626", fontWeight: 700, fontSize: 16, marginTop: 2 }}>{OB_ARTICLE.correctedHeadline}</div>
          <div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)", marginTop: 3 }}>Author: {OB_ARTICLE.author}</div>
        </div>
        <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.6, marginBottom: 8 }}>The article presents "evil is good" as a serious argument. No substantive case is made — fabricated quotes, unnamed sources, and admitted exclusion of contradictory views. Textbook ragebait.</div>

        <ExplainBox title="Line-by-Line Voting" icon="📋" color="#059669">Each in-line edit gets its own verdict. You can approve the headline correction while rejecting a weak edit — good work doesn't get killed by one flawed claim. Up to 20 edits per article.</ExplainBox>

        <div style={{ padding: 10, background: "#F1F5F9", borderRadius: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 8 }}>3 In-Line Edits — vote on each</div>
          {OB_ARTICLE.inlineEdits.map((e, i) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < 2 ? "1px solid #E2E8F0" : "none" }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                <span style={{ textDecoration: "line-through", color: "#64748B" }}>{e.original}</span>
              </div>
              <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600, marginBottom: 2 }}>{e.replacement}</div>
              <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic", marginBottom: 6 }}>↳ {e.reasoning}</div>
              {!voted && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setEditVotes(v => ({ ...v, [i]: true }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: editVotes[i] === true ? "#059669" : "#CBD5E1", background: editVotes[i] === true ? "#ECFDF5" : "#fff", color: editVotes[i] === true ? "#059669" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✓ Approve Edit</button>
                  <button onClick={() => setEditVotes(v => ({ ...v, [i]: false }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: editVotes[i] === false ? "#DC2626" : "#CBD5E1", background: editVotes[i] === false ? "#FEF2F2" : "#fff", color: editVotes[i] === false ? "#DC2626" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✗ Reject Edit</button>
                </div>
              )}
              {voted && <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: editVotes[i] ? "#059669" : "#DC2626", fontWeight: 700 }}>{editVotes[i] ? "✓ YOU APPROVED" : "✗ YOU REJECTED"}</span>}
            </div>
          ))}
        </div>

        {/* Vault entries attached to submission */}
        <ExplainBox title="Vault Artifacts" icon="🏛" color="#475569">Vault entries can be <strong>new</strong> (proposed with this submission — pending until the submission is approved) or <strong>preexisting</strong> (already in the Assembly's vault, linked to show relevance). Jurors vote on each independently. "Still Applies?" means you believe the entry remains valid. Each time an entry survives review, it gains reputation.</ExplainBox>
        <div style={{ marginTop: 8, padding: 10, background: "#EFF6FF", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 3 }}>🏛 Standing Correction — <span style={{ color: "#D97706", textTransform: "none" }}>New (proposed with this submission)</span></div>
          <div style={{ color: "#1E293B", fontWeight: 600 }}>{OB_ARTICLE.vaultEntry.assertion}</div>
          <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>Source: {OB_ARTICLE.vaultEntry.evidence}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={() => setVaultVotes(v => ({ ...v, sc: true }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes.sc === true ? "#059669" : "#CBD5E1", background: vaultVotes.sc === true ? "#ECFDF5" : "#fff", color: vaultVotes.sc === true ? "#059669" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✓ Still Applies</button>
            <button onClick={() => setVaultVotes(v => ({ ...v, sc: false }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes.sc === false ? "#DC2626" : "#CBD5E1", background: vaultVotes.sc === false ? "#FEF2F2" : "#fff", color: vaultVotes.sc === false ? "#DC2626" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✗ No Longer Valid</button>
          </div>
        </div>
        <div style={{ marginTop: 8, padding: 10, background: "#EFF6FF", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#0D9488", marginBottom: 3 }}>⚔️ Argument — <span style={{ color: "#D97706", textTransform: "none" }}>New (proposed with this submission)</span></div>
          <div style={{ color: "#1E293B", lineHeight: 1.6 }}>{OB_ARTICLE.argEntry.content}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={() => setVaultVotes(v => ({ ...v, arg: true }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes.arg === true ? "#059669" : "#CBD5E1", background: vaultVotes.arg === true ? "#ECFDF5" : "#fff", color: vaultVotes.arg === true ? "#059669" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✓ Still Applies</button>
            <button onClick={() => setVaultVotes(v => ({ ...v, arg: false }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes.arg === false ? "#DC2626" : "#CBD5E1", background: vaultVotes.arg === false ? "#FEF2F2" : "#fff", color: vaultVotes.arg === false ? "#DC2626" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✗ No Longer Valid</button>
          </div>
        </div>
        <div style={{ marginTop: 8, padding: 10, background: "#F3E8F9", border: "1px solid #9B7DB8", borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#7C3AED", marginBottom: 3 }}>🧭 Foundational Belief — <span style={{ color: "#64748B", textTransform: "none" }}>Preexisting (already in vault, linked for relevance)</span></div>
          <div style={{ color: "#1E293B", lineHeight: 1.6, fontStyle: "italic" }}>{OB_ARTICLE.beliefEntry.content}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={() => setVaultVotes(v => ({ ...v, belief: true }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes.belief === true ? "#059669" : "#CBD5E1", background: vaultVotes.belief === true ? "#ECFDF5" : "#fff", color: vaultVotes.belief === true ? "#059669" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✓ Still Applies</button>
            <button onClick={() => setVaultVotes(v => ({ ...v, belief: false }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes.belief === false ? "#DC2626" : "#CBD5E1", background: vaultVotes.belief === false ? "#FEF2F2" : "#fff", color: vaultVotes.belief === false ? "#DC2626" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✗ No Longer Valid</button>
          </div>
        </div>
        <div style={{ marginTop: 8, padding: 10, background: "#FFFBEB", border: "1px solid #B4530940", borderRadius: 8, fontSize: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#B45309", marginBottom: 3 }}>🔄 Translation — <span style={{ color: "#D97706", textTransform: "none" }}>New (proposed with this submission)</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ textDecoration: "line-through", color: "#475569" }}>{OB_ARTICLE.translationEntry.original}</span>
            <span style={{ color: "#B45309", fontWeight: 700 }}>→</span>
            <span style={{ color: "#B45309", fontWeight: 700 }}>{OB_ARTICLE.translationEntry.translated}</span>
          </div>
          <div style={{ fontSize: 10, color: "#64748B", marginTop: 3 }}>Type: Anti-Propaganda</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={() => setVaultVotes(v => ({ ...v, trans: true }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes.trans === true ? "#059669" : "#CBD5E1", background: vaultVotes.trans === true ? "#ECFDF5" : "#fff", color: vaultVotes.trans === true ? "#059669" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✓ Good Translation</button>
            <button onClick={() => setVaultVotes(v => ({ ...v, trans: false }))} style={{ padding: "3px 10px", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, border: "1.5px solid", borderColor: vaultVotes.trans === false ? "#DC2626" : "#CBD5E1", background: vaultVotes.trans === false ? "#FEF2F2" : "#fff", color: vaultVotes.trans === false ? "#DC2626" : "#64748B", borderRadius: 8, cursor: "pointer" }}>✗ Inaccurate</button>
          </div>
        </div>
      </div>

      {!voted ? (
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", padding: 16, borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 10 }}>Headline Correction Verdict</div>

          <ExplainBox title="Rating: Newsworthiness" icon="📰">How important is this correction? Slide the scale to see what each level means — these anchors keep jurors calibrated so a "7" means the same thing to everyone.</ExplainBox>
          <RatingInput label="How Newsworthy" value={newsRating} onChange={setNewsRating} rubric={NEWS_RUBRIC} />

          <ExplainBox title="Rating: Interesting" icon="⭐">How compelling is this correction to read? A well-argued correction that teaches the reader something scores higher than a routine fix.</ExplainBox>
          <RatingInput label="How Interesting" value={funRating} onChange={setFunRating} rubric={FUN_RUBRIC} />

          <ExplainBox title="Review Note" icon="💬">Your note is permanent and public. Use it to explain your reasoning. This contributes to the audit trail that makes every decision transparent.</ExplainBox>
          <textarea value={voteNote} onChange={e => setVoteNote(e.target.value)} rows={2} placeholder="The correction accurately identifies fabricated claims..." style={{ width: "100%", padding: "9px 11px", border: "1.5px solid #CBD5E1", background: "#fff", fontSize: 13, borderRadius: 6, boxSizing: "border-box", marginBottom: 14, fontFamily: "inherit", resize: "vertical" }} />

          <ExplainBox title="Deliberate Deception Finding" icon="⚠️" color="#991B1B">This is the nuclear option. Only check this if you believe the submitter is <strong>intentionally lying</strong> — not just wrong, but deliberately deceptive. A majority of jurors checking this triggers a severe drag penalty — each deception finding adds +{W.lieDrag} directly to drag, bypassing the √ curve that softens regular losses. This is a secret ballot — the submitter never sees which jurors checked it.</ExplainBox>
          <div style={{ margin: "12px 0", padding: 12, background: "#FEF2F2", border: "1.5px solid #DC2626", borderRadius: 8 }}>
            <label style={{ display: "flex", gap: 10, cursor: "pointer", alignItems: "flex-start" }}>
              <input type="checkbox" checked={lieChecked} onChange={e => setLieChecked(e.target.checked)} style={{ accentColor: "#991B1B", marginTop: 3 }} />
              <div style={{ fontSize: 12, lineHeight: 1.6, color: "#1E293B" }}>I certify this submission is a <strong>deliberate lie, gross misrepresentation, or intentional omission.</strong></div>
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => setVoted(true)} style={{ background: "#059669", color: "#fff", border: "none", padding: "10px 20px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", cursor: "pointer", borderRadius: 6 }}>✓ Approve Headline</button>
            <button onClick={() => setVoted(true)} style={{ background: "#DC2626", color: "#fff", border: "none", padding: "10px 20px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", cursor: "pointer", borderRadius: 6 }}>✗ Reject Headline</button>
            <button style={{ background: "#EA580C", color: "#fff", border: "none", padding: "10px 20px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", cursor: "pointer", borderRadius: 6 }}>⚖ Recuse</button>
          </div>
        </div>
      ) : (
        <div style={{ padding: 20, background: "#ECFDF5", border: "1px solid #059669", borderRadius: 8, textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, color: "#059669", marginBottom: 8 }}>Votes Cast</div>
          <p style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>You voted on the headline correction and each in-line edit independently. In the real system, a pool of jurors is drawn and the first to accept are seated — jury size grows with your Assembly (3 for small groups, up to 13 for large ones). You have 6 hours to complete your review after accepting. Simple majority decides. Each edit is resolved separately — a strong headline correction can survive even if one weak edit gets rejected.</p>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Compare ──
function OBCompareStep() {
  const [highlight, setHighlight] = useState(true);
  return (
    <div>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>Step 3: The Result</h2>
      <p style={{ fontSize: 15, color: "#1E293B", lineHeight: 1.6, marginBottom: 20 }}>Here's what happens when corrections survive jury review. The original article alongside the corrected version — truth layered on top of misinformation.</p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontFamily: "var(--mono)" }}>
          <input type="checkbox" checked={highlight} onChange={e => setHighlight(e.target.checked)} style={{ accentColor: "#DC2626" }} />
          Show corrections
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Original */}
        <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: "#E2E8F0", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569" }}>Original Article</div>
          <div style={{ padding: 16 }}>
            <h3 style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, margin: "0 0 12px", lineHeight: 1.3 }}>{OB_ARTICLE.originalHeadline}</h3>
            <div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)", marginBottom: 12 }}>the-daily-falsehood.com · Opinion</div>
            {OB_ARTICLE.originalBody.map((p, i) => (
              <p key={i} style={{ fontSize: 13, lineHeight: 1.6, color: "#1E293B", marginBottom: 10 }}>{p}</p>
            ))}
          </div>
        </div>

        {/* Corrected */}
        <div style={{ border: `1.5px solid ${highlight ? "#DC2626" : "#E2E8F0"}`, borderRadius: 8, overflow: "hidden", transition: "border-color 0.3s" }}>
          <div style={{ padding: "10px 14px", background: highlight ? "#DC2626" : "#E2E8F0", color: highlight ? "#F1F5F9" : "#475569", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", transition: "all 0.3s" }}>{highlight ? "Corrected Version" : "Article as Published"}</div>
          <div style={{ padding: 16 }}>
            <h3 style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, margin: "0 0 4px", lineHeight: 1.3 }}>
              {highlight ? (
                <><span style={{ textDecoration: "line-through", textDecorationColor: "#DC2626", color: "#64748B" }}>{OB_ARTICLE.originalHeadline}</span><br /><span style={{ color: "#DC2626" }}>{OB_ARTICLE.correctedHeadline}</span></>
              ) : OB_ARTICLE.originalHeadline}
            </h3>
            <div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)", marginBottom: 4 }}>the-daily-falsehood.com · Opinion</div>
            {highlight && <div style={{ fontSize: 10, padding: "3px 8px", background: "#F5F3FF", color: "#7C3AED", borderRadius: 8, display: "inline-block", fontFamily: "var(--mono)", fontWeight: 700, marginBottom: 12 }}>⚖ 3 CORRECTIONS · CONSENSUS VERIFIED</div>}
            {!highlight && <div style={{ marginBottom: 12 }} />}

            {OB_ARTICLE.originalBody.map((p, i) => {
              const edit = OB_ARTICLE.inlineEdits.find(e => e.paragraph === i);
              if (!edit || !highlight) return <p key={i} style={{ fontSize: 13, lineHeight: 1.6, color: "#1E293B", marginBottom: 10 }}>{p}</p>;

              const idx = p.indexOf(edit.original);
              if (idx === -1) {
                // Text no longer found — article may have been edited since correction was filed
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontFamily: "var(--mono)", padding: "4px 8px", background: "#FFF7ED", color: "#EA580C", borderRadius: 8, marginBottom: 4, display: "inline-block" }}>⚠ Original text no longer present — validated at time of submission and since corrected</div>
                    <p style={{ fontSize: 13, lineHeight: 1.6, color: "#1E293B" }}>{p}</p>
                    <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600, marginTop: 2 }}>Correction applied: {edit.replacement}</div>
                  </div>
                );
              }
              const before = p.substring(0, idx);
              const after = p.substring(idx + edit.original.length);

              return (
                <p key={i} style={{ fontSize: 13, lineHeight: 1.6, color: "#1E293B", marginBottom: 10 }}>
                  {before}
                  <span style={{ background: "#FEF2F2", padding: "1px 3px", borderRadius: 8 }}>
                    <span style={{ textDecoration: "line-through", textDecorationColor: "#DC2626", color: "#64748B" }}>{edit.original}</span>
                    {" "}
                    <span style={{ color: "#DC2626", fontWeight: 600, fontSize: 12 }}>{edit.replacement}</span>
                  </span>
                  {after}
                </p>
              );
            })}

            {/* Vault entries — only when corrections visible */}
            {highlight && <div style={{ marginTop: 16, borderTop: "1px solid #E2E8F0", paddingTop: 12 }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 8 }}>Linked Vault Entries</div>
              <div style={{ padding: 8, background: "#EFF6FF", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>🏛 Standing Correction:</span> {OB_ARTICLE.vaultEntry.assertion}
              </div>
              <div style={{ padding: 8, background: "#EFF6FF", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>⚔️ Argument:</span> {OB_ARTICLE.argEntry.content.substring(0, 120)}...
              </div>
              <div style={{ padding: 8, background: "#F3E8F9", borderRadius: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>🧭 Belief:</span> {OB_ARTICLE.beliefEntry.content.substring(0, 100)}...
              </div>
            </div>}
          </div>
        </div>
      </div>

      <ExplainBox title="This is the goal" icon="🎯" color="#7C3AED">
        Every correction that survives both in-group review AND cross-group verification achieves <strong>Consensus</strong> — the highest trust signal in the system. Through browser extensions and API integrations, approved corrections can be displayed directly alongside the original article — readers see the truth without needing to cross-reference anything themselves.
      </ExplainBox>
    </div>
  );
}

// ── Step 4: Launch ──
function OBLaunchStep({ onComplete, onAdditional }) {
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>⚜</div>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 28, fontWeight: 700, margin: "0 0 8px" }}>You're Ready</h2>
      <p style={{ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: "0.12em", color: "#475569", fontStyle: "italic", marginBottom: 24 }}>Truth Will Out.</p>

      <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "left" }}>
        <div style={{ padding: 16, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 16 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "0 0 10px" }}>What You've Learned</h3>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "#1E293B" }}>
            <p style={{ marginBottom: 8 }}><strong>Submit corrections</strong> — identify misleading headlines, propose factual replacements, attach evidence, make in-line edits, and build your Assembly's Vault.</p>
            <p style={{ marginBottom: 8 }}><strong>Jury review</strong> — randomly selected jurors rate your work on accuracy, newsworthiness, and interestingness. A Deliberate Deception Finding adds massive drag to your Trust Score.</p>
            <p style={{ marginBottom: 8 }}><strong>The result</strong> — approved corrections advance to cross-group review. What survives both achieves Consensus — truth verified by strangers who have no reason to agree with you except that you're right.</p>
            <p style={{ marginBottom: 8 }}><strong>Your reputation</strong> — every submission builds or damages your Trust Score. Volume has diminishing returns but quality multiplies everything. Lies are devastating. The only way to win is to tell the truth.</p>
            <p style={{ marginBottom: 8 }}><strong>Badges</strong> — you earn badges automatically as you participate: submission milestones, trusted contributor status, founding Assemblies, and more. Each badge adds +1 to your Trust Score and appears on your public profile.</p>
            <p style={{ marginBottom: 0 }}><strong>Trusted Contributor</strong> — 10 consecutive approved corrections in an Assembly earns trusted status. Your submissions skip jury review (but remain disputable). One disputed loss revokes it instantly.</p>
          </div>
        </div>

        <div style={{ padding: 16, background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 16 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "0 0 8px" }}>Your Next Steps</h3>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "#1E293B" }}>
            <p style={{ marginBottom: 6 }}>1. You're already a member of <strong>The General Public</strong> — everyone is.</p>
            <p style={{ marginBottom: 6 }}>2. Browse specialized Assemblies and join up to 12 that match your interests and values.</p>
            <p style={{ marginBottom: 6 }}>3. Set your active Assembly and submit your first correction.</p>
            <p style={{ marginBottom: 0 }}>4. Serve on your first jury when called — you'll be eligible across all your Assemblies.</p>
          </div>
        </div>
      </div>

      <button onClick={onComplete} style={{ background: "#2563EB", color: "#fff", border: "none", padding: "14px 36px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", borderRadius: 6, marginTop: 8 }}>Enter The Trust Assembly →</button>
      <div style={{ marginTop: 14 }}>
        <button onClick={onAdditional} style={{ background: "none", border: "1.5px solid #CBD5E1", padding: "10px 24px", fontFamily: "var(--mono)", fontSize: 12, cursor: "pointer", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>📚 Additional Flows — Scoring, Disputes & Concessions</button>
      </div>
    </div>
  );
}

// ── Step 5: Additional Flows ──
function OBAdditionalStep({ onComplete }) {
  const [section, setSection] = useState("scoring"); // scoring, dispute, concession
  const [disputeVoted, setDisputeVoted] = useState(false);
  const [conceded, setConceded] = useState(false);

  return (
    <div>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>Additional Flows</h2>
      <p style={{ fontSize: 15, color: "#1E293B", lineHeight: 1.6, marginBottom: 20 }}>The submission-to-review pipeline is the core of the system, but there's more beneath the surface. This section walks through how scoring works, what happens when a correction is disputed, and how concessions resolve disagreements with integrity.</p>

      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #E2E8F0" }}>
        {[["scoring", "📊 Scoring"], ["dispute", "⚖️ Disputes"], ["concession", "🤝 Concessions"]].map(([key, label]) => (
          <button key={key} onClick={() => setSection(key)} style={{ flex: 1, padding: "10px 8px", background: section === key ? "#2563EB" : "transparent", color: section === key ? "#fff" : "#64748B", border: "none", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer", fontWeight: section === key ? 700 : 400, borderBottom: section === key ? "2px solid #2563EB" : "2px solid transparent", transition: "all 0.2s" }}>{label}</button>
        ))}
      </div>

      {/* ── SCORING ── */}
      {section === "scoring" && <div>
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, margin: "0 0 12px" }}>How Scoring Works</h3>

        <ExplainBox title="The Core Principle" icon="⚖️" color="#0F172A">
          The scoring system is intentionally asymmetric: honesty compounds slowly, but deception craters your reputation. This isn't punitive — it's structural. A system where lying is cheap and truth is expensive will produce lies. Trust Assembly inverts that. In the future system, these Trust Scores will be used to drive discoverability and prominence — the most trustworthy citizens and assemblies will surface first.
        </ExplainBox>

        <div style={{ padding: 16, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 16 }}>
          {/* Friendly header */}
          <div style={{ fontFamily: "var(--serif)", fontSize: 15, color: "#0F172A", lineHeight: 1.5, marginBottom: 12 }}>
            We know this looks complicated. It's just math for <strong style={{ color: "#CA8A04" }}>try your best to do the right thing</strong>.
          </div>
          {/* Variable legend */}
          <div style={{ padding: 10, background: "#F1F5F9", borderRadius: 8, marginBottom: 14, fontSize: 11, lineHeight: 1.7, color: "#475569" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748B", marginBottom: 6 }}>What the variables mean</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px" }}>
              <span style={{ fontFamily: "var(--mono)", color: "#059669", fontWeight: 700 }}>Points</span><span>Your wins, dispute wins, and streak bonus — how much good work you've done</span>
              <span style={{ fontFamily: "var(--mono)", color: "#059669", fontWeight: 700 }}>√</span><span>Square root — more work helps, but you can't grind your way to the top</span>
              <span style={{ fontFamily: "var(--mono)", color: "#0D9488", fontWeight: 700 }}>Quality</span><span>How important and interesting jurors rated your work</span>
              <span style={{ fontFamily: "var(--mono)", color: "#DC2626", fontWeight: 700 }}>Drag</span><span>Your losses and lies — this divides your score, so mistakes pull you down</span>
              <span style={{ fontFamily: "var(--mono)", color: "#CA8A04", fontWeight: 700 }}>Cassandra</span><span>Bonus for being right when everyone said you were wrong</span>
            </div>
          </div>
          {/* Visual formula equation */}
          <div style={{ padding: 14, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "#94A3B8", marginBottom: 8 }}>TRUST SCORE =</div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "6px 12px", background: "#ECFDF5", border: "1.5px solid #059669", borderRadius: 8 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 7, textTransform: "uppercase", color: "#059669", marginBottom: 2 }}>√ Points</div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 700, color: "#059669" }}>√ W + DW + S</div>
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 20, color: "#94A3B8" }}>×</div>
              <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "6px 12px", background: "#F0FDFA", border: "1.5px solid #0D9488", borderRadius: 8 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 7, textTransform: "uppercase", color: "#0D9488", marginBottom: 2 }}>Quality</div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 700, color: "#0D9488" }}>Q<sup>1.5</sup></div>
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 20, color: "#94A3B8" }}>÷</div>
              <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "6px 12px", background: "#FEF2F2", border: "1.5px solid #DC2626", borderRadius: 8 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 7, textTransform: "uppercase", color: "#DC2626", marginBottom: 2 }}>Drag</div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 700, color: "#DC2626" }}>1 + √L + D</div>
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 20, color: "#94A3B8" }}>+</div>
              <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "6px 12px", background: "#FFFBEB", border: "1.5px solid #CA8A04", borderRadius: 8 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 7, textTransform: "uppercase", color: "#CA8A04", marginBottom: 2 }}>Cassandra</div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 700, color: "#CA8A04" }}>V<sup>★</sup></div>
              </div>
            </div>
          </div>
          {/* Component explanations */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, lineHeight: 1.6, color: "#1E293B" }}>
            <div style={{ padding: 10, background: "#ECFDF5", borderRadius: 8 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", color: "#059669", marginBottom: 4, fontWeight: 700 }}>√ Points</div>
              <div>Each approved correction: <strong>+1 point</strong></div>
              <div>Dispute won: <strong>+{W.disputeWin} points</strong></div>
              <div>Streak bonus: <strong>+1</strong> per {W.streakInterval} consecutive wins</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Volume has <strong>diminishing returns</strong> (square root). You can't farm your way to the top.</div>
            </div>
            <div style={{ padding: 10, background: "#F0FDFA", borderRadius: 8 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", color: "#0D9488", marginBottom: 4, fontWeight: 700 }}>Quality Multiplier</div>
              <div>Average of <strong>Newsworthiness</strong> + <strong>Interestingness</strong> ratings from jurors</div>
              <div>Capped at {W.qualityCap} (ratings beyond ~8+8 give no extra benefit)</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Raised to power {W.qualityExp} — trivial corrections are <strong>penalized</strong>, important work is <strong>amplified</strong>.</div>
            </div>
            <div style={{ padding: 10, background: "#FEF2F2", borderRadius: 8 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", color: "#DC2626", marginBottom: 4, fontWeight: 700 }}>Drag (divides your score)</div>
              <div>Regular losses: <strong>diminishing</strong> (inside √)</div>
              <div>Failed disputes: <strong>diminishing</strong> (inside √)</div>
              <div style={{ color: "#991B1B", fontWeight: 700 }}>Lies: <strong>+{W.lieDrag} each</strong> (linear, no mercy)</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>First few losses hurt most. Lies bypass the diminishing curve — each one is devastating.</div>
            </div>
            <div style={{ padding: 10, background: "#FFFBEB", borderRadius: 8 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", color: "#CA8A04", marginBottom: 4, fontWeight: 700 }}>Cassandra Bonus (additive)</div>
              <div><strong>{W.vindicationBase}×</strong> base per vindication</div>
              <div>Scales with <strong>impact</strong> (news × fun) and <strong>persistence</strong> (rejections^{W.persistenceExp})</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>A historic vindication after 3 rejections can catapult a brand-new citizen to the top. (Coming soon.)</div>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 9, color: "#94A3B8", fontFamily: "var(--mono)", lineHeight: 1.5 }}>
            All weights are community-votable in future elections. The formula shape is permanent; only the coefficients change.
          </div>
        </div>

        <div style={{ padding: 16, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 12 }}>Individual Scoring — Jury Service</div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "#1E293B" }}>
            <p style={{ marginBottom: 8 }}>Jurors are scored on alignment with the final verdict. When you vote with the majority, your reputation as a reliable reviewer grows. When you're the outlier, it costs — but less than a submission loss, because disagreement in good faith is expected.</p>
            <p style={{ marginBottom: 0 }}>The system tracks your review history across all Assemblies. Consistent, fair-minded jurors become eligible for sponsorship roles faster and get weighted higher in Assembly reputation calculations.</p>
          </div>
        </div>

        <div style={{ padding: 16, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 12 }}>Assembly Reputation</div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "#1E293B" }}>
            <p style={{ marginBottom: 8 }}>Every Assembly has a Trust Score computed from its members' collective track record. The score weights cross-group survival rate (corrections that survive review by outsiders) by jury rigor — larger juries and more diverse review panels count for more.</p>
            <p style={{ marginBottom: 8 }}>Assemblies with high deception rates see their Trust Score decline, which affects how their corrections are ranked in the public feed. There's no time decay on the score — your Assembly's reputation is its permanent record.</p>
            <p style={{ marginBottom: 0 }}>Trust Score badges appear on Assembly cards so citizens can evaluate credibility at a glance before joining or reading corrections from a group.</p>
          </div>
        </div>

        <ExplainBox title="The Deception Penalty Cascade" icon="🚨" color="#991B1B">
          A Deliberate Deception finding doesn't just hurt your score — it triggers a cooldown. You must complete a streak of consecutive approved submissions before your reputation can recover. If you're a Digital Intelligence partner, a deception finding against your DI suspends all linked accounts. The system makes honesty the only sustainable strategy.
        </ExplainBox>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button onClick={() => setSection("dispute")} style={{ background: "#2563EB", color: "#fff", border: "none", padding: "10px 24px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", cursor: "pointer", borderRadius: 6, letterSpacing: "0.04em" }}>Next: Dispute Flow →</button>
        </div>
      </div>}

      {/* ── DISPUTE ── */}
      {section === "dispute" && <div>
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>Dispute Flow</h3>
        <p style={{ fontSize: 15, color: "#1E293B", lineHeight: 1.6, marginBottom: 16 }}>Sometimes a correction gets approved but contains an error. The dispute mechanism lets any citizen challenge an approved correction — and if they're right, they earn the highest reward in the system.</p>

        <ExplainBox title="Disputes & The Cassandra Rule" icon="🔮" color="#7C3AED">
          <strong>Disputes (+{W.disputeWin} pts):</strong> If you spot an error in an approved correction, you can challenge it. A new jury reviews the dispute. Win and you earn +{W.disputeWin} points. Lose and you take drag. Only challenge what you can prove.
          <br /><br />
          <strong>The Cassandra Rule:</strong> Named for the prophet no one believed. If your correction is disputed and the dispute is upheld — meaning the jury said you were wrong — but you refuse to concede because you believe you're right, and you are later vindicated, you earn an additive bonus that scales with the story's importance and the number of rejections you weathered. A single historic vindication can propel a brand-new citizen to the top of the system. The full Cassandra vindication path is being built for a future release.
        </ExplainBox>

        <div style={{ padding: 16, background: "#FFFBEB", border: "1.5px solid #B45309", borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#B45309", fontWeight: 700, marginBottom: 8 }}>📋 Sample Scenario</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "#1E293B" }}>
            <p style={{ marginBottom: 6 }}>A citizen submitted a correction for the headline <strong>"City Council Approves $12M Budget for New Downtown Park"</strong>.</p>
            <p style={{ marginBottom: 6 }}>Their correction: <em>"The approved park budget was $8.5M, not $12M — the $12M figure includes a separate transit project bundled into the same vote."</em></p>
            <p style={{ marginBottom: 0 }}>The jury approved this correction. But you've read the actual council minutes, and the park budget was <strong>$9.2M</strong>, not $8.5M. The submitter used a figure from a draft budget that was revised before the final vote. Their logic was right — the article did conflate two budgets — but the specific number was wrong.</p>
          </div>
        </div>

        {/* The approved submission card */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", padding: 16, marginBottom: 16, borderLeft: "4px solid #059669", borderRadius: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}>@civicwatcher · Metro Accountability Assembly · 3 days ago</span>
            <span style={{ fontSize: 10, padding: "2px 7px", background: "#ECFDF5", color: "#059669", borderRadius: 8, fontFamily: "var(--mono)", textTransform: "uppercase", fontWeight: 700 }}>Approved</span>
          </div>
          <div style={{ margin: "8px 0", padding: 10, background: "#F9FAFB", borderRadius: 8 }}>
            <div style={{ fontFamily: "var(--serif)", textDecoration: "line-through", textDecorationColor: "#DC2626", color: "#475569", fontSize: 14 }}>City Council Approves $12M Budget for New Downtown Park</div>
            <div style={{ fontFamily: "var(--serif)", color: "#DC2626", fontWeight: 700, fontSize: 16, marginTop: 2 }}>Park Budget Is $8.5M, Not $12M — Article Conflates Two Separate Line Items</div>
          </div>
          <div style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.6 }}>The $12M figure cited in the headline combines the $8.5M park budget with $3.5M for the Elm Street transit corridor. These were separate line items voted on in the same session.</div>
        </div>

        <ExplainBox title="Filing a Dispute" icon="⚖️" color="#EA580C">
          You file a dispute by citing the specific error and providing evidence. A fresh jury — larger than the original (a "super jury" of at least 7) — reviews both the original correction and your challenge. Neither the original submitter nor the original jurors can serve on the dispute jury.
        </ExplainBox>

        {!disputeVoted ? (
          <div style={{ background: "#FFFFFF", border: "1.5px solid #EA580C", padding: 16, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#EA580C", marginBottom: 10 }}>Your Dispute</div>
            <div style={{ padding: "9px 11px", border: "1.5px solid #CBD5E1", background: "#fff", fontSize: 14, lineHeight: 1.6, color: "#0F172A", borderRadius: 6, marginBottom: 12 }}>
              The correction's logic is sound — the article does conflate two budgets — but the specific figure is wrong. The draft budget allocated $8.5M, but the final approved budget for the park was $9.2M after a late amendment adding $700K for accessibility features. See council minutes, page 14, Amendment 3-C.
            </div>
            <div style={{ padding: 10, background: "#F1F5F9", borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 4 }}>Evidence</div>
              <div style={{ fontSize: 12 }}><a href="#" style={{ color: "#0D9488" }}>https://citycouncil.gov/minutes/2025-02-14</a></div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>↳ Official council minutes showing Amendment 3-C revising the park allocation from $8.5M to $9.2M.</div>
            </div>
            <button onClick={() => setDisputeVoted(true)} style={{ background: "#EA580C", color: "#fff", border: "none", padding: "10px 20px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", cursor: "pointer", borderRadius: 6 }}>File Dispute</button>
          </div>
        ) : (
          <div style={{ padding: 20, background: "#FFF7ED", border: "1.5px solid #EA580C", borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, color: "#EA580C", marginBottom: 8 }}>⚖️ Dispute Filed</div>
            <p style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.6, marginBottom: 12 }}>A super jury of 7 members (2× the normal jury for this Assembly, minimum 7) has been drawn from citizens outside the Metro Accountability Assembly. They will review both the original correction and your dispute evidence.</p>
            <div style={{ padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #E2E8F0" }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#7C3AED", marginBottom: 6 }}>Dispute Verdict</div>
              <div style={{ fontSize: 14, fontFamily: "var(--serif)", fontWeight: 700, color: "#7C3AED" }}>5–2 in favor of the disputant</div>
              <p style={{ fontSize: 12, color: "#475569", marginTop: 6, lineHeight: 1.6 }}>The jury found that while the original correction correctly identified the budget conflation, the specific figure ($8.5M) was from an outdated draft. The actual park budget of $9.2M is supported by the official council minutes. The original correction's headline should be amended.</p>
            </div>
            <div style={{ marginTop: 12, padding: 10, background: "#F5F3FF", borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#0D9488", fontWeight: 700 }}>⚖ DISPUTE UPHELD</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>You earn <strong>+{W.disputeWin} points</strong> for successfully catching an error in an approved correction. The original submitter takes drag — not for deception, but for inaccuracy.</div>
            </div>
          </div>
        )}

        <ExplainBox title="What happens next" icon="📝" color="#059669">
          After a successful dispute, the original submitter has the opportunity to <strong>concede</strong> — acknowledging the error and allowing their correction to be amended. Concessions preserve the core correction while fixing the specific error. They also trigger partial score recovery through a time-decay mechanism.
        </ExplainBox>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button onClick={() => { setSection("concession"); }} style={{ background: "#2563EB", color: "#fff", border: "none", padding: "10px 24px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", cursor: "pointer", borderRadius: 6, letterSpacing: "0.04em" }}>Next: Concession Flow →</button>
        </div>
      </div>}

      {/* ── CONCESSION ── */}
      {section === "concession" && <div>
        <h3 style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>Concession Flow</h3>
        <p style={{ fontSize: 15, color: "#1E293B", lineHeight: 1.6, marginBottom: 16 }}>When a dispute succeeds, the original submitter can acknowledge their error through a concession. This isn't defeat — it's intellectual honesty made visible. The system rewards it.</p>

        <ExplainBox title="Why Concessions Matter" icon="🤝" color="#0D9488">
          In most online spaces, admitting you were wrong is a losing move. In Trust Assembly, conceding to a valid dispute triggers <strong>time-decay recovery</strong> — you earn back a portion of your score loss, with the most recovery available to those who concede quickly. One concession per week gets full recovery — no loss at all. Additional concessions in the same week recover 90%. After two weeks it drops to 50%, and after three months to 5%. The message is clear: intellectual honesty is rewarded, and stubbornness isn't.
        </ExplainBox>

        <div style={{ padding: 16, background: "#FFFBEB", border: "1.5px solid #B45309", borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#B45309", fontWeight: 700, marginBottom: 8 }}>📋 Continuing the Scenario</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "#1E293B" }}>
            <p style={{ marginBottom: 0 }}>You are now <strong>@civicwatcher</strong>, the original submitter. Your correction about the park budget was disputed because you cited $8.5M (from a draft) instead of the final $9.2M figure. The dispute jury sided with the disputant 5–2. You've been notified and need to decide: concede, or stand your ground.</p>
          </div>
        </div>

        {/* The disputed submission */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", padding: 16, marginBottom: 16, borderLeft: "4px solid #EA580C", borderRadius: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--mono)" }}>@civicwatcher (you) · Metro Accountability Assembly</span>
            <span style={{ fontSize: 10, padding: "2px 7px", background: "#FFF7ED", color: "#EA580C", borderRadius: 8, fontFamily: "var(--mono)", textTransform: "uppercase", fontWeight: 700 }}>Disputed — Lost</span>
          </div>
          <div style={{ margin: "8px 0", padding: 10, background: "#F9FAFB", borderRadius: 8 }}>
            <div style={{ fontFamily: "var(--serif)", textDecoration: "line-through", textDecorationColor: "#DC2626", color: "#475569", fontSize: 14 }}>City Council Approves $12M Budget for New Downtown Park</div>
            <div style={{ fontFamily: "var(--serif)", color: "#DC2626", fontWeight: 700, fontSize: 16, marginTop: 2 }}>Park Budget Is $8.5M, Not $12M — Article Conflates Two Separate Line Items</div>
          </div>
          <div style={{ padding: 10, background: "#FEF2F2", borderRadius: 8, border: "1px solid #DC2626", marginTop: 8 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#EA580C", fontWeight: 700, marginBottom: 4 }}>DISPUTE FINDING</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>The park figure should be $9.2M (final budget after Amendment 3-C), not $8.5M (draft budget). The core logic of the correction — that the article conflates park and transit budgets — is sound.</div>
          </div>
        </div>

        {!conceded ? (
          <div style={{ background: "#FFFFFF", border: "1.5px solid #0D9488", padding: 16, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "#0D9488", marginBottom: 12 }}>Concession Decision</div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "#1E293B", marginBottom: 12 }}>You can concede to the dispute, which allows your correction to be amended with the accurate figure. Or you can decline — but your 3× score loss stands either way. Conceding triggers time-decay recovery.</p>

            <div style={{ padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #E2E8F0", marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>Recovery Tiers</div>
              <div style={{ fontSize: 12, lineHeight: 1.7, color: "#1E293B" }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
                  <span style={{ fontFamily: "var(--mono)", color: "#059669", fontWeight: 700 }}>Within 1 week (1st)</span><span>100% recovered — no reputation loss</span>
                  <span style={{ fontFamily: "var(--mono)", color: "#0D9488", fontWeight: 700 }}>Within 1 week (2nd+)</span><span>90% recovered — 10% lesson fee</span>
                  <span style={{ fontFamily: "var(--mono)", color: "#0D9488", fontWeight: 700 }}>1–2 weeks</span><span>90% recovered</span>
                  <span style={{ fontFamily: "var(--mono)", color: "#B45309", fontWeight: 700 }}>2–4 weeks</span><span>50% recovered</span>
                  <span style={{ fontFamily: "var(--mono)", color: "#EA580C", fontWeight: 700 }}>1–3 months</span><span>25% recovered</span>
                  <span style={{ fontFamily: "var(--mono)", color: "#DC2626", fontWeight: 700 }}>3+ months</span><span>5% recovered</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConceded(true)} style={{ background: "#0D9488", color: "#fff", border: "none", padding: "10px 20px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", cursor: "pointer", borderRadius: 6 }}>🤝 Concede — Accept the Correction</button>
              <button style={{ background: "none", border: "1.5px solid #CBD5E1", padding: "10px 16px", fontFamily: "var(--mono)", fontSize: 12, cursor: "pointer", borderRadius: 6, color: "#475569" }}>Decline</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 20, background: "#ECFDF5", border: "1.5px solid #059669", borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, color: "#059669", marginBottom: 8 }}>🤝 Concession Accepted</div>
            <p style={{ fontSize: 13, color: "#1E293B", lineHeight: 1.6, marginBottom: 12 }}>You conceded within one week. Your correction is being amended to reflect the accurate $9.2M figure. The core of your correction — that the article conflated two budgets — stands. Your amended headline:</p>
            <div style={{ padding: 10, background: "#fff", borderRadius: 8, border: "1px solid #E2E8F0", marginBottom: 12 }}>
              <div style={{ fontFamily: "var(--serif)", color: "#DC2626", fontWeight: 700, fontSize: 15 }}>Park Budget Is $9.2M, Not $12M — Article Conflates Two Separate Line Items</div>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#0D9488", marginTop: 4 }}>AMENDED VIA CONCESSION · Original: $8.5M → Corrected: $9.2M</div>
            </div>
            <div style={{ padding: 10, background: "#F5F3FF", borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#7C3AED", fontWeight: 700, marginBottom: 4 }}>SCORE RECOVERY</div>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>You conceded within the 1-week window and this was your first concession this week — full recovery. Net impact: no reputation loss. Your willingness to correct yourself is now part of your permanent record — visible to anyone reviewing your profile.</div>
            </div>
          </div>
        )}

        <ExplainBox title="The Big Picture" icon="🏛" color="#0F172A">
          Disputes and concessions complete the accountability loop. Corrections can be corrected. Mistakes can be acknowledged. The system doesn't demand perfection — it demands honesty. A citizen who concedes gracefully builds more trust over time than one who's never been wrong, because they've proven they value truth over ego.
        </ExplainBox>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button onClick={onComplete} style={{ background: "#2563EB", color: "#fff", border: "none", padding: "14px 36px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", borderRadius: 6 }}>Enter The Trust Assembly →</button>
        </div>
      </div>}
    </div>
  );
}

export default function OnboardingFlow({ onComplete, embedded }) {
  const [step, setStep] = useState(0);
  const topRef = useRef(null);
  const next = () => { if (step < OB_STEPS.length - 1) { setStep(s => s + 1); topRef.current?.scrollIntoView({ behavior: "smooth" }); } };
  const prev = () => { if (step > 0) { setStep(s => s - 1); topRef.current?.scrollIntoView({ behavior: "smooth" }); } };

  return (
    <div style={embedded ? {} : { minHeight: "100vh", background: "#F9FAFB" }}>
      {!embedded && <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        :root { --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; --serif: var(--font); --mono: var(--font); --body: var(--font); --accent: #2563EB; }
      `}</style>}
      {!embedded && <div ref={topRef} style={{ background: "#EFF6FF", color: "#0F172A", padding: "24px 20px 20px", textAlign: "center", borderBottom: "1px solid #BFDBFE" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2563EB", marginBottom: 6, fontWeight: 600 }}>📖 Interactive Tutorial</div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>Learn The Trust Assembly</div>
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>A guided walkthrough using a sample correction — nothing here is real</div>
      </div>}
      {embedded && <div ref={topRef}><div className="ta-section-rule" /><h2 className="ta-section-head">Guide</h2><p style={{ color: "#475569", marginBottom: 14, fontSize: 13, lineHeight: 1.6 }}>An interactive walkthrough using a sample correction — nothing here is real.</p></div>}
      <div style={{ background: "#FFF7ED", padding: "6px 16px", textAlign: "center", fontSize: 10, color: "#EA580C", fontFamily: "var(--mono)", fontWeight: 600, letterSpacing: "0.04em" }}>
        ⚠ TUTORIAL MODE — This is a practice exercise. No data will be saved.
      </div>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "16px 20px 0" }}>
        <div style={{ display: "flex", gap: 0, marginBottom: 20 }}>
          {OB_STEP_LABELS.map((label, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 3, background: i <= step ? "#2563EB" : "#E2E8F0", marginBottom: 6, borderRadius: 8, transition: "background 0.3s" }} />
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.06em", color: i <= step ? "#0F172A" : "#94A3B8", fontWeight: i === step ? 700 : 400 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 20px 40px", fontFamily: "var(--body, Georgia, serif)", color: "#0F172A", fontSize: 15, lineHeight: 1.6 }}>
        {step === 0 && <OBSubmitStep />}
        {step === 1 && <OBReviewStep />}
        {step === 2 && <OBCompareStep />}
        {step === 3 && <OBLaunchStep onComplete={onComplete} onAdditional={() => { setStep(4); topRef.current?.scrollIntoView({ behavior: "smooth" }); }} />}
        {step === 4 && <OBAdditionalStep onComplete={onComplete} />}
        {step < 3 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 30, paddingTop: 20, borderTop: "1px solid #E2E8F0" }}>
            {step > 0 ? <button onClick={prev} style={{ background: "none", border: "1.5px solid #CBD5E1", padding: "10px 20px", fontFamily: "var(--mono)", fontSize: 12, cursor: "pointer", borderRadius: 6, textTransform: "uppercase" }}>← Back</button> : <div />}
            <button onClick={next} style={{ background: "#2563EB", color: "#fff", border: "none", padding: "10px 24px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", cursor: "pointer", borderRadius: 6, letterSpacing: "0.04em" }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

async function loadSyntheticData() {
  // Ensure The General Public exists
  await ensureGeneralPublic();
}

// ============================================================
// BROWSER EXTENSION DOWNLOAD PAGE
// ============================================================


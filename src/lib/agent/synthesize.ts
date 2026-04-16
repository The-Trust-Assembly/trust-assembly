// Trust Assembly Agent — synthesize service
// --------------------------------------------
// Server-side port of synthesizeAnalyses from
// apps/content-cannon/src/main/services/claude.service.ts.
//
// Takes the per-article analyses and asks Claude to produce a
// coordinated, cross-article picture: refined verdicts, consolidated
// vault entries, deduplicated translations, and a 2-3 sentence
// narrative summary. No web_search tool here — pure reasoning.

import { getClaudeClient, DEFAULT_MODEL } from "./claude-client";
import { extractJSON } from "./json-extract";
import type { ArticleAnalysis, VaultSuggestion, TokenUsage } from "./types";
import type { AnalyzedArticle } from "./analyze";

export interface SynthesizeResult {
  refined: AnalyzedArticle[];
  vaultEntries: VaultSuggestion[];
  narrative: string;
  usage: TokenUsage;
}

export async function synthesizeAnalyses(
  topic: string,
  analyses: AnalyzedArticle[]
): Promise<SynthesizeResult> {
  const claude = getClaudeClient();

  const summaries = analyses
    .map((a, i) => {
      const ae = a.analysis;
      return `--- Article ${i + 1} ---
URL: ${a.url}
Headline: ${a.headline}
Verdict: ${ae.verdict} (confidence: ${ae.confidence})
Replacement headline: ${ae.replacement || "N/A"}
Reasoning: ${ae.reasoning}
Evidence: ${JSON.stringify(ae.evidence)}
Inline edits: ${JSON.stringify(ae.inlineEdits || [])}
Vault entries: ${JSON.stringify(ae.vaultEntries || [])}`;
    })
    .join("\n\n");

  const prompt = `You are a senior fact-checker for Trust Assembly, a civic deliberation platform. You have just reviewed ${analyses.length} articles on this topic:

"${topic}"

Here are the individual analyses produced by a junior fact-checker:

${summaries}

Your job is to SYNTHESIZE these into a coordinated, complete picture. This is critical because:
1. Later articles may reveal information that changes the verdict on earlier articles
2. Vault entries (standing corrections, arguments, translations) should reflect the COMPLETE understanding
3. Inline edits should be consistent across articles — the same factual error should be corrected the same way
4. The goal is to tell the COMPLETE STORY of this topic across all sources

Respond with ONLY a valid JSON object:
{
  "analyses": [
    {
      "url": "article URL (must match an input URL)",
      "verdict": "correction | affirmation | skip",
      "originalHeadline": "original headline",
      "replacement": "corrected headline if correction",
      "reasoning": "refined reasoning incorporating cross-article understanding. Max 2000 chars.",
      "evidence": [{"description": "...", "url": "..."}],
      "confidence": "high | medium | low",
      "inlineEdits": [
        {"originalText": "exact wrong text", "correctedText": "corrected text", "explanation": "why"}
      ]
    }
  ],
  "vaultEntries": [
    {"type": "vault", "assertion": "consolidated factual claim verified across sources", "evidence": "all supporting evidence with sources"},
    {"type": "argument", "content": "logical framework applicable to this entire topic"},
    {"type": "translation", "original": "recurring propaganda/euphemism phrase", "translated": "plain language", "translationType": "propaganda | clarity | euphemism | satirical"}
  ],
  "narrative": "A 2-3 sentence summary of the complete story this set of corrections tells. What does the public need to understand about this topic?"
}

Rules:
- Return one entry in analyses[] for each input article, using the same URL
- You may CHANGE a verdict if cross-referencing reveals the original was wrong
- You may UPGRADE confidence if multiple articles corroborate the same fact
- Vault entries should be CONSOLIDATED — one standing correction per fact
- Translations should be DEDUPLICATED — one entry per phrase
- Inline edits must quote the EXACT text from the article to be replaced`;

  const response = await claude.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const usage: TokenUsage = {
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    // Fall back to original analyses with no synthesis
    return { refined: analyses, vaultEntries: [], narrative: "", usage };
  }

  try {
    const result = JSON.parse(extractJSON(textBlock.text));

    // Merge synthesis output back into the original article structure
    // so we always return one analysis per input article.
    const refined: AnalyzedArticle[] = analyses.map((orig) => {
      const synthEntry = result.analyses?.find((s: { url: string }) => s.url === orig.url);
      if (synthEntry) {
        const merged: ArticleAnalysis = {
          verdict: synthEntry.verdict || orig.analysis.verdict,
          originalHeadline: synthEntry.originalHeadline || orig.analysis.originalHeadline,
          replacement: synthEntry.replacement || orig.analysis.replacement,
          reasoning: synthEntry.reasoning || orig.analysis.reasoning,
          evidence: synthEntry.evidence || orig.analysis.evidence,
          confidence: synthEntry.confidence || orig.analysis.confidence,
          inlineEdits: synthEntry.inlineEdits || orig.analysis.inlineEdits,
        };
        return { ...orig, analysis: merged };
      }
      return orig;
    });

    return {
      refined,
      vaultEntries: Array.isArray(result.vaultEntries) ? result.vaultEntries : [],
      narrative: typeof result.narrative === "string" ? result.narrative : "",
      usage,
    };
  } catch {
    return { refined: analyses, vaultEntries: [], narrative: "", usage };
  }
}

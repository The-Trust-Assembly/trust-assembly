// Trust Assembly Agent — analyze service
// -----------------------------------------
// Sends one article (headline + body text) to Claude with a fact-check
// prompt. Pure LLM reasoning — no web_search tool. The search phase
// (Google CSE or Claude web_search) already discovered the articles;
// the analyze step focuses on evaluating factual accuracy using the
// article text, the thesis, and the model's training knowledge.
//
// Returns an ArticleAnalysis with a verdict (correction|affirmation|skip),
// reasoning, evidence, and optional vault entries.

import { getClaudeClient, DEFAULT_MODEL } from "./claude-client";
import { extractJSON } from "./json-extract";
import type { ArticleAnalysis, TokenUsage } from "./types";

const MAX_CHARS = 30000;

export interface AnalyzeResult {
  analysis: ArticleAnalysis;
  usage: TokenUsage;
}

export async function analyzeArticle(
  url: string,
  headline: string,
  articleText: string,
  topic: string,
  assemblyContext?: { name?: string; description?: string }
): Promise<AnalyzeResult> {
  const claude = getClaudeClient();
  const truncated =
    articleText.length > MAX_CHARS
      ? articleText.substring(0, MAX_CHARS) + "\n\n[Article truncated for analysis]"
      : articleText;

  const today = new Date().toISOString().split("T")[0];

  const assemblySection = assemblyContext?.name
    ? `\nYou are analyzing for the assembly "${assemblyContext.name}".${assemblyContext.description ? `\nAssembly description: ${assemblyContext.description}` : ""}
When generating translations, interpret language through this assembly's perspective and values. Different assemblies may translate the same phrase differently — that's by design. Your translations should be honest to this assembly's viewpoint while remaining factually grounded.\n`
    : "";

  const prompt = `You are a fact-checker for Trust Assembly, a civic deliberation platform.

Today's date: ${today}
${assemblySection}
Analyze the following article for factual accuracy in the context of this topic: "${topic}"

Article URL: ${url}
Article Headline: ${headline}

Article Text:
${truncated}

Your analysis should:
1. Identify specific factual claims in the article
2. Cross-reference claims against your training knowledge and the context of the thesis
3. Determine if the headline is misleading, accurate, or needs correction
4. For EVERY claim you make, find the EXACT sentence or passage in the article text above that supports it and copy it verbatim into the "quote" field. This is non-negotiable — evidence without quotes will be rejected.

CRITICAL — QUOTING REQUIREMENT:
Every single evidence item MUST contain a "quote" field with text copied CHARACTER-FOR-CHARACTER from the article above. Do not paraphrase. Do not summarize. Do not write what you think the article said. Find the exact words in the article text and copy them. These quotes are mechanically verified against the source — if you fabricate or paraphrase, the verification will fail and the evidence will be flagged as unverified.

IMPORTANT: Respond with ONLY a valid JSON object. Do not include any text before or after the JSON.

In addition to your verdict, identify any reusable knowledge that could apply across multiple articles on this topic. These become "vault entries" in Trust Assembly:

- **Standing Corrections** (type: "vault"): Reusable factual statements. Each standing correction has TWO separate fields:
  * "lede" — ONE short sentence stating the core fact. This is the bumper sticker. It must be immediately understandable at a glance with no context needed. Max 200 characters. Examples: "Afroman was not found liable for defamation." / "The raid found no evidence of criminal activity." / "Brian and William Newland are different people."
  * "assertion" — The full explanation with context. 2-4 sentences expanding on the lede with specifics, dates, sources. Example: "Afroman was not found liable for defamation. The jury ruled in March 2026 that his parody videos mocking the Adams County deputies' raid on his home were protected First Amendment speech. The deputies had sued for defamation after Afroman created viral content from security footage of their fruitless search."
  Do NOT put the full explanation in the lede. Do NOT put just the lede in the assertion. They are separate fields with separate purposes.
- **Arguments** (type: "argument"): Logical frameworks that help evaluate claims on this topic. Example: "Protected speech under the First Amendment does not imply the speech's claims are factually true."
- **Translations** (type: "translation"): Render loaded, obscure, or rhetorically crafted language into plain, honest English that any reader can immediately understand. The translation MUST be a drop-in replacement — it must fit grammatically into any sentence where the original phrase appears. The translation should reflect the perspective of the assembly you're analyzing for.

  For each translation, you MUST include a "testSentences" array with 5 different grammatically complete sentences that use the ORIGINAL phrase in varied contexts. These will be used to verify the replacement works as a drop-in substitution. Example:
    original: "enhanced interrogation techniques"
    translated: "torture"
    testSentences: [
      "The CIA used enhanced interrogation techniques on detainees.",
      "Reports of enhanced interrogation techniques surfaced in 2004.",
      "He defended the use of enhanced interrogation techniques.",
      "Enhanced interrogation techniques were banned by executive order.",
      "Critics called enhanced interrogation techniques a violation of human rights."
    ]
  Test: replacing "enhanced interrogation techniques" with "torture" → all 5 sentences still read grammatically. PASS.

  Bad example: original "justifies" → translated "explains the motivation" FAILS because "He explains the motivation the killing" is not grammatical. The translation must be the SAME part of speech and fit as a direct word swap.

  translationType can be "clarity", "propaganda", "euphemism", or "satirical". Generate MANY translations — flag every instance of loaded language, jargon, or rhetorical framing in the article.

JSON format:
{
  "verdict": "correction",
  "originalHeadline": "the article's original headline",
  "replacement": "corrected headline (only if verdict is correction, omit for affirmation/skip)",
  "reasoning": "detailed explanation with specific claims cited. Max 2000 characters.",
  "evidence": [
    {"description": "what this evidence shows", "quote": "EXACT sentence copied from the article text above — character for character"},
    {"description": "second piece of evidence", "quote": "ANOTHER exact sentence from the article supporting this claim"}
  ],
  "confidence": "high",
  "bodyAnalysis": "optional detailed analysis",
  "inlineEdits": [
    {"originalText": "exact quote from article that is wrong", "correctedText": "what it should say", "explanation": "why this is wrong"}
  ],
  "vaultEntries": [
    {"type": "vault", "lede": "Short fact, max 120 chars.", "assertion": "Full explanation with dates, context, and sources. 2-4 sentences.", "evidence": "supporting evidence with sources"},
    {"type": "argument", "content": "logical framework or rhetorical tool"},
    {"type": "translation", "original": "enhanced interrogation techniques", "translated": "torture", "translationType": "euphemism", "testSentences": ["The CIA used enhanced interrogation techniques.", "He defended enhanced interrogation techniques.", "Enhanced interrogation techniques were banned.", "Reports of enhanced interrogation techniques emerged.", "Critics condemned enhanced interrogation techniques."]}
  ]
}

Rules:
- MANDATORY QUOTES: Every evidence item MUST include a "quote" field. Go back to the article text above, find the exact passage, and copy it character-for-character. If you cannot find a direct quote in the article for a claim, you MUST set the url field to an external source instead — but at least 2 of your evidence items must quote directly from the article. An evidence item with neither a quote nor a url is invalid and will be rejected.
- verdict must be exactly "correction", "affirmation", or "skip"
- Use "skip" for paywalled, opinion/editorial, or unfalsifiable content
- Use "correction" ONLY when you can cite specific factual errors with evidence
- Use "affirmation" when the article is factually sound on an important topic
- Generate MANY vault entries — err on the side of including more rather than fewer. The user will curate and remove ones they don't want. Aim for 3-8 standing corrections per article when the topic is rich with factual claims. Include every distinct factual assertion that could be reused across articles.
- RECENCY: Today is ${today}. For recent or ongoing events, be VERY careful about stating what has or has not happened. If an event is within the last 30 days, your training data may not cover it — rely ONLY on what the article text says, not your prior knowledge. Never assert that something "has not happened" for recent events unless the article explicitly confirms it. When uncertain, frame claims with the date: "As of [date], according to [source]..." rather than making absolute statements.
- Standing corrections should be facts, not opinions`;

  const response = await claude.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const usage: TokenUsage = {
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return {
      analysis: {
        verdict: "skip",
        originalHeadline: headline,
        reasoning: "Analysis returned no text content",
        evidence: [],
        confidence: "low",
      },
      usage,
    };
  }

  try {
    const analysis = JSON.parse(extractJSON(textBlock.text)) as ArticleAnalysis;
    return { analysis, usage };
  } catch {
    return {
      analysis: {
        verdict: "skip",
        originalHeadline: headline,
        reasoning: "Analysis produced non-parseable output",
        evidence: [],
        confidence: "low",
      },
      usage,
    };
  }
}

// Sequential analysis with a small delay between requests to avoid
// API rate limits. Without web_search, each call is faster (~2x),
// so a shorter delay is sufficient.
const ANALYSIS_DELAY_MS = 500;

export interface AnalyzedArticle {
  url: string;
  headline: string;
  analysis: ArticleAnalysis;
}

export async function analyzeArticles(
  articles: Array<{ url: string; headline: string; text: string }>,
  topic: string,
  onProgress?: (i: number, total: number, analyzedSoFar: AnalyzedArticle[]) => void | Promise<void>,
  assemblyContext?: { name?: string; description?: string }
): Promise<{
  analyzed: AnalyzedArticle[];
  errors: Array<{ url: string; error: string }>;
  usage: TokenUsage;
}> {
  const analyzed: AnalyzedArticle[] = [];
  const errors: Array<{ url: string; error: string }> = [];
  const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];

    try {
      const { analysis, usage } = await analyzeArticle(
        article.url,
        article.headline,
        article.text,
        topic,
        assemblyContext
      );
      analyzed.push({ url: article.url, headline: article.headline, analysis });
      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;
    } catch (e) {
      errors.push({ url: article.url, error: e instanceof Error ? e.message : String(e) });
    }

    // Fire after each article completes (success or error)
    await onProgress?.(i + 1, articles.length, analyzed);

    if (i < articles.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, ANALYSIS_DELAY_MS));
    }
  }

  return { analyzed, errors, usage: totalUsage };
}

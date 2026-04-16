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
  topic: string
): Promise<AnalyzeResult> {
  const claude = getClaudeClient();
  const truncated =
    articleText.length > MAX_CHARS
      ? articleText.substring(0, MAX_CHARS) + "\n\n[Article truncated for analysis]"
      : articleText;

  const prompt = `You are a fact-checker for Trust Assembly, a civic deliberation platform.

Analyze the following article for factual accuracy in the context of this topic: "${topic}"

Article URL: ${url}
Article Headline: ${headline}

Article Text:
${truncated}

Your analysis should:
1. Identify specific factual claims in the article
2. Cross-reference claims against your training knowledge and the context of the thesis
3. Determine if the headline is misleading, accurate, or needs correction
4. Provide evidence for your findings (cite sources from the article itself, known public records, or well-established facts)

IMPORTANT: Respond with ONLY a valid JSON object. Do not include any text before or after the JSON.

In addition to your verdict, identify any reusable knowledge that could apply across multiple articles on this topic. These become "vault entries" in Trust Assembly:

- **Standing Corrections** (type: "vault"): Reusable factual statements with evidence that correct a common misconception. Example: "William Newland was not convicted of any crime" with court record evidence.
- **Arguments** (type: "argument"): Logical frameworks that help evaluate claims on this topic. Example: "Protected speech under the First Amendment does not imply the speech's claims are factually true."
- **Translations** (type: "translation"): Cases where the article uses propaganda, euphemisms, or jargon that obscures meaning. Include the original phrase and a clearer replacement. translationType can be "clarity", "propaganda", "euphemism", or "satirical".

JSON format:
{
  "verdict": "correction",
  "originalHeadline": "the article's original headline",
  "replacement": "corrected headline (only if verdict is correction, omit for affirmation/skip)",
  "reasoning": "detailed explanation with specific claims cited. Max 2000 characters.",
  "evidence": [{"description": "what this evidence shows", "url": "source URL"}],
  "confidence": "high",
  "bodyAnalysis": "optional detailed analysis",
  "inlineEdits": [
    {"originalText": "exact quote from article that is wrong", "correctedText": "what it should say", "explanation": "why this is wrong"}
  ],
  "vaultEntries": [
    {"type": "vault", "assertion": "reusable factual claim", "evidence": "supporting evidence with sources"},
    {"type": "argument", "content": "logical framework or rhetorical tool"},
    {"type": "translation", "original": "jargon or propaganda phrase", "translated": "clear plain language", "translationType": "propaganda"}
  ]
}

Rules:
- verdict must be exactly "correction", "affirmation", or "skip"
- Use "skip" for paywalled, opinion/editorial, or unfalsifiable content
- Use "correction" ONLY when you can cite specific factual errors with evidence
- Use "affirmation" when the article is factually sound on an important topic
- vaultEntries is optional — only include entries that would genuinely be reusable
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
  onProgress?: (i: number, total: number) => void
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
    onProgress?.(i + 1, articles.length);

    try {
      const { analysis, usage } = await analyzeArticle(
        article.url,
        article.headline,
        article.text,
        topic
      );
      analyzed.push({ url: article.url, headline: article.headline, analysis });
      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;
    } catch (e) {
      errors.push({ url: article.url, error: e instanceof Error ? e.message : String(e) });
    }

    if (i < articles.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, ANALYSIS_DELAY_MS));
    }
  }

  return { analyzed, errors, usage: totalUsage };
}

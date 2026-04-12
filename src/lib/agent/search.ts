// Trust Assembly Agent — search service
// ----------------------------------------
// Server-side port of searchForArticles from
// apps/content-cannon/src/main/services/claude.service.ts.
//
// Uses Claude's web_search tool to find articles related to a topic
// that may warrant fact-checking. Loops up to MAX_ROUNDS rounds,
// stopping early when no new articles are found.

import { getClaudeClient, DEFAULT_MODEL } from "./claude-client";
import { extractJSON } from "./json-extract";
import type { ArticleCandidate, TokenUsage } from "./types";

const MAX_ROUNDS = 10;

export interface SearchResult {
  candidates: ArticleCandidate[];
  usage: TokenUsage;
}

export async function searchForArticles(
  topic: string,
  scope: string,
  onProgress?: (msg: string) => void
): Promise<SearchResult> {
  const claude = getClaudeClient();
  const allCandidates: ArticleCandidate[] = [];
  const seenUrls = new Set<string>();
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let round = 1;

  while (round <= MAX_ROUNDS) {
    onProgress?.(`Search round ${round}...`);

    const previousUrls = allCandidates.map((c) => c.url).join("\n");
    const previousContext =
      allCandidates.length > 0
        ? `\n\nYou have already found these articles (do NOT return duplicates):\n${previousUrls}`
        : "";

    const prompt = `You are a research assistant for Trust Assembly, a civic fact-checking platform.

Your task: Find articles related to this topic that may warrant fact-checking (corrections or affirmations).

Topic: ${topic}
Search scope: ${scope}
Current search round: ${round}
Articles found so far: ${allCandidates.length}${previousContext}

Search the web and return a JSON array of articles. For each article include:
- url: the article URL
- headline: the article's headline
- publication: the publication name
- summary: brief summary of the main claims
- reasonToCheck: why this article might warrant fact-checking

IMPORTANT: Return ONLY a valid JSON array. Do not include any text before or after the JSON. Example format:
[{"url": "...", "headline": "...", "publication": "...", "summary": "...", "reasonToCheck": "..."}]

If you cannot find any more relevant articles, return an empty array: []`;

    const response = await claude.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 10,
        } as never,
      ],
      messages: [{ role: "user", content: prompt }],
    });

    if (response.usage) {
      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") break;

    let candidates: ArticleCandidate[];
    try {
      candidates = JSON.parse(extractJSON(textBlock.text));
    } catch {
      break;
    }

    if (!Array.isArray(candidates) || candidates.length === 0) break;

    let newCount = 0;
    for (const c of candidates) {
      if (c.url && !seenUrls.has(c.url)) {
        seenUrls.add(c.url);
        allCandidates.push(c);
        newCount++;
      }
    }

    onProgress?.(`Found ${allCandidates.length} articles so far...`);

    if (newCount === 0) break;
    round++;
  }

  return { candidates: allCandidates, usage };
}

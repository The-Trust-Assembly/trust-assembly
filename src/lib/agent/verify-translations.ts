// Trust Assembly Agent — translation drop-in verification
// ---------------------------------------------------------
// For each translation vault entry, tests whether the translated
// phrase works as a grammatical drop-in replacement by substituting
// it into the 5 test sentences. Uses Haiku to check if the resulting
// sentences are grammatically correct.

import { getClaudeClient, HAIKU_MODEL } from "./claude-client";
import { extractJSON } from "./json-extract";
import { getPrompt } from "./prompts";
import type { VaultEntryForReview, TokenUsage } from "./types";

export async function verifyTranslationDropIns(
  entries: VaultEntryForReview[]
): Promise<{ passed: number; failed: number; usage: TokenUsage }> {
  const translations = entries.filter(
    (e) => e.entry.type === "translation" && e.entry.original && e.entry.translated && e.entry.testSentences?.length
  );

  if (translations.length === 0) {
    return { passed: 0, failed: 0, usage: { inputTokens: 0, outputTokens: 0 } };
  }

  const claude = getClaudeClient();
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let passed = 0;
  let failed = 0;

  // Batch all translations into a single Haiku call for efficiency
  const testCases = translations.map((t, i) => {
    const original = t.entry.original!;
    const translated = t.entry.translated!;
    const sentences = t.entry.testSentences!;
    const replaced = sentences.map((s) =>
      s.replace(new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), translated)
    );
    return { index: i, original, translated, replaced };
  });

  const testCaseText = testCases.map((tc) => `Set ${tc.index + 1} ("${tc.original}" → "${tc.translated}"):
${tc.replaced.map((s, j) => `  ${j + 1}. ${s}`).join("\n")}`).join("\n\n");

  const prompt = await getPrompt("verify_translations",
    `For each set of sentences below, determine if ALL sentences are grammatically correct and natural-sounding English. A sentence fails if the replacement creates broken grammar, awkward phrasing, or changes the part of speech incorrectly.

{{testCases}}

Return ONLY a JSON array of objects: [{"index": 0, "passes": true/false, "reason": "brief explanation"}]`,
    { testCases: testCaseText });

  try {
    const response = await claude.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    usage.inputTokens += response.usage?.input_tokens || 0;
    usage.outputTokens += response.usage?.output_tokens || 0;

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { passed: 0, failed: 0, usage };
    }

    const results = JSON.parse(extractJSON(textBlock.text)) as Array<{
      index: number;
      passes: boolean;
      reason: string;
    }>;

    for (const r of results) {
      const t = translations[r.index];
      if (!t) continue;
      t.entry.replacementPasses = r.passes;
      if (r.passes) {
        passed++;
      } else {
        failed++;
        // Auto-unapprove translations that don't work as drop-ins
        (t as unknown as Record<string, unknown>).approved = false;
      }
    }
  } catch (e) {
    console.error("[verify-translations] Haiku check failed:", e);
  }

  return { passed, failed, usage };
}

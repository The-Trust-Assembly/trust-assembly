// Trust Assembly Agent — vault entry verification
// ---------------------------------------------------
// After the analyze phase generates vault entries (standing corrections,
// arguments, translations), this module runs a targeted web search for
// each standing correction to verify the assertion is factually accurate.
//
// Uses Haiku for evaluation (cheap) + Claude web_search for discovery.
// Marks each entry as verified/disputed/unverified.

import { getClaudeClient, DEFAULT_MODEL, HAIKU_MODEL } from "./claude-client";
import { extractJSON } from "./json-extract";
import { getPrompt } from "./prompts";
import type { VaultSuggestion, VaultEntryForReview, TokenUsage } from "./types";

export interface VaultVerifyResult {
  verified: number;
  disputed: number;
  unverified: number;
  usage: TokenUsage;
}

export async function verifyVaultEntries(
  entries: VaultEntryForReview[],
  onProgress?: (i: number, total: number) => void
): Promise<VaultVerifyResult> {
  const claude = getClaudeClient();
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let verified = 0;
  let disputed = 0;
  let unverified = 0;

  // Only verify standing corrections (type === "vault") — arguments and
  // translations are subjective and don't need factual verification.
  const corrections = entries.filter((e) => e.entry.type === "vault" && e.entry.assertion);

  for (let i = 0; i < corrections.length; i++) {
    const ve = corrections[i];
    const assertion = ve.entry.assertion!;
    onProgress?.(i + 1, corrections.length);

    try {
      // Step 1: Search for the assertion using web_search
      const searchResponse = await claude.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 1024,
        tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: 3 } as never,
        ],
        messages: [{
          role: "user",
          content: await getPrompt("verify_vault",
            `Search the web to verify this factual claim. Find evidence that supports or contradicts it.\n\nClaim: "{{assertion}}"\n\nReturn ONLY a JSON object: {"supported": true/false, "confidence": "high"/"medium"/"low", "reason": "brief explanation of what you found"}`,
            { assertion }),
        }],
      });

      usage.inputTokens += searchResponse.usage?.input_tokens || 0;
      usage.outputTokens += searchResponse.usage?.output_tokens || 0;

      const textBlock = searchResponse.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        unverified++;
        (ve as unknown as Record<string, unknown>).vaultVerified = "unverified";
        continue;
      }

      try {
        const result = JSON.parse(extractJSON(textBlock.text)) as {
          supported: boolean;
          confidence: string;
          reason: string;
        };

        if (result.supported) {
          verified++;
          (ve as unknown as Record<string, unknown>).vaultVerified = "verified";
          (ve as unknown as Record<string, unknown>).vaultVerifyReason = result.reason;
        } else {
          disputed++;
          (ve as unknown as Record<string, unknown>).vaultVerified = "disputed";
          (ve as unknown as Record<string, unknown>).vaultVerifyReason = result.reason;
          // Auto-unapprove disputed entries
          ve.approved = false;
        }
      } catch {
        unverified++;
        (ve as unknown as Record<string, unknown>).vaultVerified = "unverified";
      }
    } catch (e) {
      unverified++;
      (ve as unknown as Record<string, unknown>).vaultVerified = "unverified";
    }

    // Brief delay between searches
    if (i < corrections.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { verified, disputed, unverified, usage };
}

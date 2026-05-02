// Trust Assembly Agent — LLM call logger
// ------------------------------------------
// Wraps Claude API calls with automatic logging of:
//   - Raw response text (for debugging parse failures)
//   - Token counts per step (for cost breakdown)
//   - Which prompt version was used
//
// Saves everything as artifacts for admin inspection.

import { saveArtifact } from "./artifacts";

export async function logLlmCall(
  runId: string,
  step: string,
  label: string,
  response: { content: Array<{ type: string; text?: string }>; usage?: { input_tokens: number; output_tokens: number } },
  articleUrl?: string
): Promise<void> {
  const textBlocks = response.content.filter((b) => b.type === "text");
  const rawText = textBlocks.map((b) => b.text || "").join("\n");
  const blockTypes = response.content.map((b) => b.type).join(", ");

  await saveArtifact(runId, step, "llm_response", {
    label,
    blockTypes,
    blockCount: response.content.length,
    textBlockCount: textBlocks.length,
    rawTextLength: rawText.length,
    rawTextPreview: rawText.substring(0, 500),
    rawTextFull: rawText.length <= 2000 ? rawText : undefined,
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  }, articleUrl);
}

export async function logStepTokens(
  runId: string,
  step: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number
): Promise<void> {
  await saveArtifact(runId, step, "token_usage", {
    inputTokens,
    outputTokens,
    costUsd: Math.round(costUsd * 10000) / 10000,
  });
}

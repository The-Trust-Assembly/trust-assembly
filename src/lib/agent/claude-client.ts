// Trust Assembly Agent — Claude client
// --------------------------------------
// Lazy-initialized Anthropic SDK wrapper. The API key is read from
// the ANTHROPIC_API_KEY env var on first use, NOT at import time —
// this matches the JWT_SECRET pattern in src/lib/auth.ts so the
// build never crashes on missing env vars.

import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required for Trust Assembly Agent runs"
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// Pricing per 1M tokens (USD). Used for cost estimation on agent_runs.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};

export const DEFAULT_MODEL = "claude-sonnet-4-20250514";
export const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

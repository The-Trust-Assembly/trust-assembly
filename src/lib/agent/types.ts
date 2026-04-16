// Trust Assembly Agent — shared types
// -------------------------------------
// Mirrors the desktop app's types so the same JSONB shape is stored
// in the agent_runs.batch column. Ported from
// apps/content-cannon/src/main/services/claude.service.ts.

export interface ArticleCandidate {
  url: string;
  headline: string;
  publication: string;
  summary: string;
  reasonToCheck: string;
}

export interface VaultSuggestion {
  type: "vault" | "argument" | "translation";
  assertion?: string;
  evidence?: string;
  content?: string;
  original?: string;
  translated?: string;
  translationType?: "clarity" | "propaganda" | "euphemism" | "satirical";
}

export interface InlineEdit {
  originalText: string;
  correctedText: string;
  explanation: string;
}

export interface ArticleAnalysis {
  verdict: "correction" | "affirmation" | "skip";
  originalHeadline: string;
  replacement?: string;
  reasoning: string;
  evidence: Array<{ description: string; url?: string }>;
  confidence: "high" | "medium" | "low";
  bodyAnalysis?: string;
  inlineEdits?: InlineEdit[];
  vaultEntries?: VaultSuggestion[];
}

export interface SubmissionForReview {
  id: string;
  url: string;
  headline: string;
  approved: boolean;
  analysis: ArticleAnalysis;
}

export interface VaultEntryForReview {
  id: string;
  approved: boolean;
  entry: VaultSuggestion;
}

export interface AgentBatch {
  topic?: string;
  submissions: SubmissionForReview[];
  vaultEntries: VaultEntryForReview[];
  narrative: string;
  candidates?: ArticleCandidate[];
  errors?: Array<{ url: string; error: string }>;
  skipped?: number;
}

// Token usage tracking — used for cost estimation and recording on
// agent_runs.input_tokens / .output_tokens / .estimated_cost_usd.
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

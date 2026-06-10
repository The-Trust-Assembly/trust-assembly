// Trust Assembly Scoring — constants
// -------------------------------------
// Single source of truth for every tunable number in the scoring and
// dispute-lifecycle system. Values trace to DESIGN-SPEC-scoring-lifecycle.md
// (Part A), which was decoded from the June 2026 design infographics.

// ─── Item weights (spec A3) ────────────────────────────────────────

export type ScoredItemType =
  | "headline_correction"
  | "body_edit"
  | "affirmation"
  | "translation"
  | "standing_correction"
  | "argument"
  | "foundational_belief";

export const ITEM_WEIGHTS: Record<ScoredItemType, number> = {
  headline_correction: 1,
  body_edit: 1,
  affirmation: 1,
  translation: 1,
  standing_correction: 2,
  argument: 2,
  foundational_belief: 3,
};

// ─── Quality multipliers (spec A3) ─────────────────────────────────

export type QualityTier = "low" | "normal" | "high";

export const QUALITY_MULTIPLIERS: Record<QualityTier, number> = {
  low: 0.5,
  normal: 1,
  high: 3,
};

// ─── Score roles & scopes (spec A1) ────────────────────────────────

export type ScoreRole = "submitter" | "juror";
export type ScoreScope = "assembly" | "system";

// ─── Deception penalty (spec A7) ───────────────────────────────────

// displayed % = raw % / (1 + deception findings)
export const DECEPTION_AUTOBAN_THRESHOLD = 3; // findings that trigger ban review

// ─── Dispute ladder (spec A8) ──────────────────────────────────────

export const DISPUTE_BASE_JURY_SIZE = 5;     // original jury for a claim
export const DISPUTE_JURORS_ADDED_PER_ROUND = 2;
export const DISPUTE_MAX_ROUND = 10;         // ladder is open-ended in spirit; cap defensively

// ─── The Marks economy (spec A9) — imaginary, consistent ───────────

export const CURRENCY_NAME = "Marks";
export const NEW_CITIZEN_GRANT_MARKS = 100;
export const DISPUTE_BASE_FILING_FEE_MARKS = 10;
export const EARN_SUBMISSION_PASSED_MARKS = 2;
export const EARN_JUROR_REVIEW_MARKS = 1;

// Trust Assembly Scoring — pure engine
// ----------------------------------------
// Every formula from DESIGN-SPEC-scoring-lifecycle.md Part A as pure,
// dependency-free functions. No database access here: callers load a
// citizen's tallies, run the math, and persist the result. This keeps
// the rules unit-testable against the worked examples in the design
// images, and means the formulas exist in exactly one place.

import {
  ITEM_WEIGHTS,
  QUALITY_MULTIPLIERS,
  DISPUTE_BASE_FILING_FEE_MARKS,
  DISPUTE_BASE_JURY_SIZE,
  DISPUTE_JURORS_ADDED_PER_ROUND,
  STAKE_DISCOUNT_TIERS,
  MIN_TESTED_POINTS_FOR_DISCOUNT,
  type ScoredItemType,
  type QualityTier,
} from "./constants.ts";

// ─── Item values (spec A3) ─────────────────────────────────────────

// item value = item weight × quality multiplier
export function itemValue(type: ScoredItemType, quality: QualityTier = "normal"): number {
  return ITEM_WEIGHTS[type] * QUALITY_MULTIPLIERS[quality];
}

// ─── Score fractions (spec A2, A6, A7) ─────────────────────────────

export interface ScoreTally {
  pointsEarned: number;    // weighted points from passed items / matching votes
  pointsPossible: number;  // weighted points from ALL adjudicated items / votes
  rescueBonus: number;     // Cassandra/Whistleblower points (numerator only)
  deceptionFindings: number;
}

export interface ComputedScore {
  rawPercent: number;        // earned / possible, before bonuses & penalties
  displayedPercent: number;  // (earned + bonus) / possible, ÷ (1 + deceptions)
  rawPoints: number;         // tested volume = pointsEarned (+ bonus), the "raw points" display
  pointsPossible: number;
  aboveHundred: boolean;     // true when vindication pushed the score past 100%
}

export function computeScore(tally: ScoreTally): ComputedScore {
  const { pointsEarned, pointsPossible, rescueBonus, deceptionFindings } = tally;

  if (pointsPossible <= 0) {
    return { rawPercent: 0, displayedPercent: 0, rawPoints: 0, pointsPossible: 0, aboveHundred: false };
  }

  const rawPercent = (pointsEarned / pointsPossible) * 100;
  // Bonuses grow the numerator only; the denominator never changes (spec A6).
  const boostedPercent = ((pointsEarned + rescueBonus) / pointsPossible) * 100;
  // Deliberate deception divides the displayed score (spec A7).
  const displayedPercent = boostedPercent / (1 + Math.max(0, deceptionFindings));

  return {
    rawPercent: round1(rawPercent),
    displayedPercent: round1(displayedPercent),
    rawPoints: pointsEarned + rescueBonus,
    pointsPossible,
    aboveHundred: displayedPercent > 100,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── Rescue bonuses (spec A6) ──────────────────────────────────────

// bonus = submission points × 2^n, where n = prior wrong-way decisions
// (rejections) before vindication. Applies to both Cassandra (submitter)
// and Whistleblower (juror) events — same formula, different role.
export function rescueBonus(submissionPoints: number, priorRejections: number): number {
  if (priorRejections <= 0 || submissionPoints <= 0) return 0;
  return submissionPoints * Math.pow(2, priorRejections);
}

// ─── Dispute ladder (spec A8) ──────────────────────────────────────

// Stake to open dispute round r: base fee × 2^(r-1). Non-recoverable.
export function disputeStake(round: number, baseFee = DISPUTE_BASE_FILING_FEE_MARKS): number {
  return baseFee * Math.pow(2, Math.max(0, round - 1));
}

// Cooldown after a failed round r: 2^(r-1) days. The latest verdict
// stays in force for the entire cooldown — never limbo.
export function disputeCooldownDays(round: number): number {
  return Math.pow(2, Math.max(0, round - 1));
}

// Jury grows every round so deep disputes face broad review.
export function disputeJurySize(
  round: number,
  baseJury = DISPUTE_BASE_JURY_SIZE,
  addedPerRound = DISPUTE_JURORS_ADDED_PER_ROUND
): number {
  return baseJury + addedPerRound * Math.max(0, round);
}

// The non-recoverable stake pays the jurors of that round.
export function jurorPayPerRound(stake: number, jurySize: number): number {
  if (jurySize <= 0) return 0;
  return Math.floor(stake / jurySize);
}

// Earned reputation discounts the stake (never below 1 Mark). The
// discount only applies once enough work has been tested — score
// percentage without volume buys nothing.
export function stakeDiscountMultiplier(displayedPercent: number, pointsPossible: number): number {
  if (pointsPossible < MIN_TESTED_POINTS_FOR_DISCOUNT) return 1;
  for (const tier of STAKE_DISCOUNT_TIERS) {
    if (displayedPercent >= tier.minPercent) return tier.multiplier;
  }
  return 1;
}

export function discountedStake(
  round: number,
  displayedPercent: number,
  pointsPossible: number,
  baseFee = DISPUTE_BASE_FILING_FEE_MARKS
): number {
  const full = disputeStake(round, baseFee);
  const discounted = Math.round(full * stakeDiscountMultiplier(displayedPercent, pointsPossible));
  return Math.max(1, discounted);
}

// ─── Accrual helpers (spec A4, A5) ─────────────────────────────────

export interface AdjudicatedItem {
  type: ScoredItemType;
  quality: QualityTier;
  passed: boolean;
}

// Submitter accrual: every adjudicated item adds to possible; passed
// items add to earned (spec A4).
export function tallySubmission(items: AdjudicatedItem[]): { earned: number; possible: number } {
  let earned = 0;
  let possible = 0;
  for (const item of items) {
    const value = itemValue(item.type, item.quality);
    possible += value;
    if (item.passed) earned += value;
  }
  return { earned, possible };
}

export interface JurorVote {
  type: ScoredItemType;
  quality: QualityTier;
  matchedOutcome: boolean; // juror's vote agreed with the jury's conclusion
}

// Juror accrual: every voted item adds to possible; matching the jury
// outcome adds to earned (spec A5).
export function tallyJurorReview(votes: JurorVote[]): { earned: number; possible: number } {
  let earned = 0;
  let possible = 0;
  for (const vote of votes) {
    const value = itemValue(vote.type, vote.quality);
    possible += value;
    if (vote.matchedOutcome) earned += value;
  }
  return { earned, possible };
}

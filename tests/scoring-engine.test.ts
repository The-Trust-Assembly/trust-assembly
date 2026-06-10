// Scoring engine tests
// -----------------------
// Every worked example from the June 2026 design infographics, verified
// against the pure engine. If a number here changes, the design changed.
//
// Run with:
//   node --experimental-strip-types tests/scoring-engine.test.ts

import { strict as assert } from "node:assert";
import {
  itemValue,
  computeScore,
  rescueBonus,
  disputeStake,
  disputeCooldownDays,
  disputeJurySize,
  jurorPayPerRound,
  discountedStake,
  stakeDiscountMultiplier,
  tallySubmission,
  tallyJurorReview,
} from "../src/lib/scoring/engine.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${e instanceof Error ? e.message : e}`);
  }
}

// ─── "How Submission Scores Work": A 10/10 + B 0/10 + C 5/5 → 60% ──

test("score = total earned / total possible (15/25 = 60%)", () => {
  const score = computeScore({ pointsEarned: 15, pointsPossible: 25, rescueBonus: 0, deceptionFindings: 0 });
  assert.equal(score.displayedPercent, 60);
  assert.equal(score.rawPercent, 60);
});

// ─── Image 6: submitter example → total weighted value 12, 75% ──────

test("submitter accrual: 2 of 3 items pass → 9/12 = 75%", () => {
  // headline correction (w1) + standing correction (w2) + affirmation (w1),
  // quality mix from the image bringing total weighted value to 12:
  // standing correction at high importance... the image total is 12 with
  // 9 earned. Reproduce exactly: weights 1+2+1 = 4 × (quality mix) = 12.
  // Simplest faithful construction: all three at high×? Use explicit values:
  const tally = tallySubmission([
    { type: "headline_correction", quality: "high", passed: true },   // 1×3 = 3
    { type: "standing_correction", quality: "high", passed: true },   // 2×3 = 6
    { type: "affirmation", quality: "high", passed: false },          // 1×3 = 3
  ]);
  assert.equal(tally.possible, 12);
  assert.equal(tally.earned, 9);
  const score = computeScore({ pointsEarned: tally.earned, pointsPossible: tally.possible, rescueBonus: 0, deceptionFindings: 0 });
  assert.equal(score.displayedPercent, 75);
});

// ─── Image 7: juror example → 9 of 15 weighted points = 60% ─────────

test("juror accrual: matched 9 of 15 weighted points → 60%", () => {
  const tally = tallyJurorReview([
    { type: "headline_correction", quality: "high", matchedOutcome: true },  // 3
    { type: "argument", quality: "high", matchedOutcome: true },             // 6
    { type: "standing_correction", quality: "high", matchedOutcome: false }, // 6
  ]);
  assert.equal(tally.possible, 15);
  assert.equal(tally.earned, 9);
  const score = computeScore({ pointsEarned: 9, pointsPossible: 15, rescueBonus: 0, deceptionFindings: 0 });
  assert.equal(score.displayedPercent, 60);
});

// ─── Item weights & quality multipliers (image 8) ───────────────────

test("item weights: headline 1, body 1, argument 2, belief 3", () => {
  assert.equal(itemValue("headline_correction"), 1);
  assert.equal(itemValue("body_edit"), 1);
  assert.equal(itemValue("argument"), 2);
  assert.equal(itemValue("foundational_belief"), 3);
});

test("quality multipliers: low 0.5×, normal 1×, high 3×", () => {
  assert.equal(itemValue("headline_correction", "low"), 0.5);
  assert.equal(itemValue("headline_correction", "normal"), 1);
  assert.equal(itemValue("headline_correction", "high"), 3);
});

// ─── Cassandra/Whistleblower bonus table (images 9 + bonus chains) ──

test("rescue bonus: 10-point claim at depths 1-4 → 20/40/80/160", () => {
  assert.equal(rescueBonus(10, 1), 20);
  assert.equal(rescueBonus(10, 2), 40);
  assert.equal(rescueBonus(10, 3), 80);
  assert.equal(rescueBonus(10, 4), 160);
});

test("rescue bonus: 20 submission points at rejection depth 3 → 160", () => {
  assert.equal(rescueBonus(20, 3), 160);
});

test("no vindication, no bonus", () => {
  assert.equal(rescueBonus(10, 0), 0);
});

// ─── "How Cassandra/Whistleblower Changes Your Score": 70% → 110% ───

test("vindication: 70/100 + 40 bonus → 110%, denominator unchanged", () => {
  const before = computeScore({ pointsEarned: 70, pointsPossible: 100, rescueBonus: 0, deceptionFindings: 0 });
  assert.equal(before.displayedPercent, 70);
  const after = computeScore({ pointsEarned: 70, pointsPossible: 100, rescueBonus: 40, deceptionFindings: 0 });
  assert.equal(after.displayedPercent, 110);
  assert.equal(after.pointsPossible, 100);
  assert.ok(after.aboveHundred, "above 100% means later corrected in citizen's favor");
});

// ─── Image 10: deception divisor ────────────────────────────────────

test("deception: 90% raw with 2 findings → 30% displayed", () => {
  const score = computeScore({ pointsEarned: 90, pointsPossible: 100, rescueBonus: 0, deceptionFindings: 2 });
  assert.equal(score.rawPercent, 90);
  assert.equal(score.displayedPercent, 30);
});

test("deception: 1 lie halves the score (80% → 40%)", () => {
  const score = computeScore({ pointsEarned: 8, pointsPossible: 10, rescueBonus: 0, deceptionFindings: 1 });
  assert.equal(score.displayedPercent, 40);
});

// ─── Dispute ladder (images: dispute economics) ─────────────────────

test("stake doubles each round: 1×, 2×, 4× … 512× at round 10", () => {
  assert.equal(disputeStake(1), 10);
  assert.equal(disputeStake(2), 20);
  assert.equal(disputeStake(3), 40);
  assert.equal(disputeStake(10), 5120); // 512 × base fee of 10 marks
});

test("cooldown doubles each failed round: 1, 2, 4, 8, 16 days", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(disputeCooldownDays), [1, 2, 4, 8, 16]);
  assert.equal(disputeCooldownDays(10), 512);
});

test("jury grows by 2 each round from base of 5: round 1 → 7", () => {
  assert.equal(disputeJurySize(0), 5);  // original review
  assert.equal(disputeJurySize(1), 7);
  assert.equal(disputeJurySize(2), 9);
  assert.equal(disputeJurySize(5), 15);
});

test("juror pay: non-recoverable stake split across the round's jury", () => {
  assert.equal(jurorPayPerRound(disputeStake(3), disputeJurySize(3)), Math.floor(40 / 11));
});

// ─── Reputation-discounted stakes ───────────────────────────────────

test("90%+ record with tested volume pays half stake", () => {
  assert.equal(discountedStake(1, 95, 100), 5);   // 10 × 0.5
  assert.equal(discountedStake(3, 95, 100), 20);  // 40 × 0.5
});

test("75%+ record pays three quarters", () => {
  assert.equal(discountedStake(1, 80, 100), 8);   // 10 × 0.75
});

test("high percentage without tested volume buys nothing", () => {
  assert.equal(stakeDiscountMultiplier(100, 5), 1); // 5 pts tested < 20 minimum
  assert.equal(discountedStake(1, 100, 5), 10);
});

test("weak record pays full price", () => {
  assert.equal(discountedStake(2, 60, 500), 20);
});

test("discounted stake never drops below 1 Mark", () => {
  assert.ok(discountedStake(1, 99, 1000) >= 1);
});

// ─── Edge cases ─────────────────────────────────────────────────────

test("zero possible points → 0%, no division by zero", () => {
  const score = computeScore({ pointsEarned: 0, pointsPossible: 0, rescueBonus: 0, deceptionFindings: 0 });
  assert.equal(score.displayedPercent, 0);
});

test("bonus survives deception division (numerator math order)", () => {
  // (70 + 40) / 100 / (1 + 1) = 55%
  const score = computeScore({ pointsEarned: 70, pointsPossible: 100, rescueBonus: 40, deceptionFindings: 1 });
  assert.equal(score.displayedPercent, 55);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

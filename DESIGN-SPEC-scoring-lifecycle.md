# DESIGN SPEC — Scoring & Lifecycle System

Canonical specification decoded from the 36 design infographics added 2026-06-09
(`ChatGPT Image Jun 9, 2026, 09_30_36 PM.png` … `09_33_49 PM.png`).
This document is the single source of truth for implementation. Where an image
left a value ambiguous, the chosen constant is marked **(tunable)** and lives in
`src/lib/scoring/constants.ts`.

---

## Part A — The Canonical Model (from the images)

### A1. Four separate trust scores (images: "Why not just one trust score?", "Why split by role?", "Why split by scope?")

Trust is not one thing. Every citizen carries four independent records:

| | Submitter | Juror |
|---|---|---|
| **Assembly scope** | Assembly Submitter | Assembly Juror |
| **System scope** | System Submitter | System Juror |

- **Role split**: finding/writing claims and judging claims are different skills.
  A great submitter is not automatically a great juror.
- **Scope split**: Assembly scores measure trust inside one community (used for
  in-group juries and Trusted Contributor status). System scores measure trust
  across Assemblies (used for cross-group juries; powers the browser-extension
  credibility overlay). System trust is harder to earn and more valuable.

### A2. Every score is a fraction (images: "How Submission Scores Work", "What do the scores mean?")

```
score % = total earned points / total possible points
```

- Every scored item **creates possible points** whether it passes or fails.
- Passed items add to **earned**. Failed items only sit in **possible**.
- Two numbers are always displayed together:
  - **Percentage** — reliability (how often you're right)
  - **Raw points** — tested volume (how much meaningful work has been tested)
  - 100% on 8 raw points is "perfect but lightly tested"; 92% on 2,400 raw
    points is more proven. Both shown, always.

### A3. Item types and weights (images: "What Are Item Types?", "Why use weights and quality?", "How do submitter points accrue?")

Article-level items: headline correction, body edit, affirmation.
Vault-level items: standing correction, argument, foundational belief, translation.

**Item weights (tunable):**

| Item type | Weight |
|---|---|
| Headline correction | 1 |
| Body edit (inline edit) | 1 |
| Affirmation | 1 |
| Translation | 1 |
| Standing correction | 2 |
| Argument | 2 |
| Foundational belief | 3 |

**Quality multiplier** (set by jury at review time, reflects importance/interest):

| Quality | Multiplier |
|---|---|
| Low | 0.5× |
| Normal | 1× |
| High | 3× |

### A4. Submitter points (image 6: "How do submitter points accrue?")

Per submitted item:

```
item value       = item weight × quality multiplier
points possible += item value          (always, once adjudicated)
points earned   += item value          (only if the item PASSES jury review)
submitter %      = points earned / points possible
```

Worked example from the image: headline correction (1) + standing correction (2)
+ affirmation (1), at high importance/normal mix → total weighted value 12;
2 of 3 items pass → 9 earned → 75%.

### A5. Juror points (image 7: "How do juror points accrue?")

Jurors vote pass/fail on every item in a review. Each item carries its weighted
value (same weights × quality as A3).

```
points possible += item value          (for every item the juror voted on)
points earned   += item value          (when the juror's vote matches the jury outcome)
juror %          = points earned / points possible
```

Worked example: 9 of 15 weighted points matched → 60%.

### A6. Rescue bonuses — Cassandra (submitter) & Whistleblower (juror) (images 9, Cassandra ×4, Whistleblower ×4)

The crowd is sometimes wrong at first. The system scores the verdict of the
moment, then **publicly rescues** people who were right against consensus.

- **Cassandra bonus** (submitters): a submission is rejected, the submitter
  persists, and a later dispute round vindicates it.
- **Whistleblower bonus** (jurors): a juror votes against the group (a real
  vote with point value, not mere disagreement), the position is rejected
  through review rounds, and a later round vindicates it.

```
bonus = submission points × 2^n
```

- `n` = number of prior wrong-way decisions (rejections) before vindication.
- The bonus is added to the **numerator only**. The denominator never changes.
- Displayed scores can therefore exceed 100% — that is by design: above 100%
  means the system was later corrected in the citizen's favor.
- Worked examples: 10-point claim — 1 rejection → +20, 2 → +40, 3 → +80,
  4 → +160. 20-point submission at rejection depth 3 → +160.
- Bonuses are **visible, named events** ("bonus fires"), not silent
  recalculations. Vindication does not erase the past record.

**Anti-spam guarantees** (Why Cassandra/Whistleblower Does Not Reward Spam):
the bonus only fires on later vindication through real dispute rounds, which
cost escalating money/time/social friction (A8); no vindication → no bonus;
disputes get more expensive each round; fresh larger juries each round.

### A7. Score reductions (image 10: "What reduces a score?")

- **Ordinary wrongness**: failed items count in possible, not earned — the
  percentage falls arithmetically. Being wrong is part of honest participation.
- **Deliberate deception** (jury finding of intentional fabrication):

```
displayed % = raw % / (1 + deception findings)
```

  1 lie → score halved; 2 lies → one third; 3 lies → one quarter AND triggers
  auto-ban review **(tunable)**. Example: 90% raw with 2 findings → 30%.

### A8. Dispute lifecycle & exponential friction (images: "What Happens in a Dispute?", "How Exponential Disputes Prevent Abuse", "Why Do Disputes Get Expensive Fast?", "Three Layers of Dispute Friction", "Why Only Big Cases Go Deep")

A dispute **reopens review, not limbo**: the current verdict always stands and
remains visible/in force until a new jury produces a new one. The record is
never suspended.

Lifecycle: current verdict exists → citizen files dispute (pays filing stake)
→ fresh, larger jury reviews → verdict stands or changes → cooldown begins.

**The dispute ladder (per claim), round r = 1, 2, 3, …:**

| Mechanic | Rule |
|---|---|
| Stake | `base filing fee × 2^(r-1)` (1×, 2×, 4×, … 512× at r=10) |
| Cooldown after a failed round | `2^(r-1)` days (1, 2, 4, 8, 16, … 512) |
| Jury size | grows every round: `base jury + 2 × r` (tunable; image example: original jury 5, each round adds 2 jurors) |
| Filing stake | non-recoverable; pays jurors and system costs |
| Failed challenge | may strengthen the current winner |

Three friction layers: **money** (escalating non-recoverable stake), **time**
(doubling cooldown, latest verdict holds throughout), **social** (each round
needs a fresh, bigger jury; deep disputes attract public attention).
A ten-round dispute should feel enormous; reaching it signals the claim is
extraordinary.

### A9. The currency (user decision: imaginary but consistent)

All pricing uses a fictional, non-convertible internal currency. No real money.

**Constants (all tunable, single source in `constants.ts`):**

| Constant | Value |
|---|---|
| Currency name | **Marks** |
| New-citizen grant | 100 marks |
| Base dispute filing fee | 10 marks |
| Juror pay per dispute round | filing stake ÷ jury size (rounded down) |
| Earn: submission passes review | +2 marks |
| Earn: juror completes a review | +1 mark |
| Earn: Cassandra/Whistleblower vindication | stake refund of the vindicated round + bonus marks = 10 × 2^(n-1) |

(Marks are an economy for *dispute friction and juror pay*; trust scores are
never purchasable.)

### A10. What scores unlock (image: "What Your Score Gets You")

1. **Priority** — reliable contributors move up the review queue (newer users
   still reserved visible slots).
2. **Responsibility** — trusted jurors selected for more important reviews.
3. **Standing** — higher scores unlock economic and procedural power.

### A11. Consensus & display surfaces (images: "What Is Consensus?", "What Does the Browser Extension Show?")

- **Consensus** = passed in-group review, then survived cross-group review.
  It is "the strongest current public trust signal", not eternal truth.
- The browser extension overlay shows: corrections, affirmations, current
  verdicts ("Mostly inaccurate — based on 12 reviews"), active disputes
  ("this claim is disputed — 3 experts disagree"), and contributor credibility
  (visible trust records) — sourced from **System-scope** scores.

### A12. Principles that constrain implementation

- The system never leaves a record in limbo; during cooldown the latest verdict holds.
- Scores are public and auditable; submitter and juror records tracked separately.
- Self-review and close-partner review are not allowed; audit log throughout.
- Vindication is shown, not silently recalculated; the original record is preserved.
- AI assists (draft/summarize/compare/translate) but never rules; verdicts come
  from reviewed civic process with accountable human partners.

---

## Part B — Gap Analysis & Implementation Plan

### B1. What already exists (and maps cleanly)

| Spec concept | Current implementation | Verdict |
|---|---|---|
| Dispute escalation | `disputes.dispute_round`, stake `2^round`, cooldown `2^round` days (migration 015) | **Close.** Spec uses `base fee × 2^(r-1)`; engine implements spec; migration path trivial |
| Dispute never-limbo | Verdict holds during dispute; cooldown enforced on filing (api/disputes) | **Matches** |
| Bigger dispute juries | Super jury 1.5-2× min 7 (jury-rules.ts) | Replace with `5 + 2×round` ladder |
| Deception findings | `users.deliberate_lies`, majority-flag detection in vote-resolution.ts | Counter exists; **divisor display formula missing** |
| Cross-group review | `approved → cross_review → consensus` pipeline | **Matches scope split**; becomes the System-scope accrual source |
| In-group trust | `organization_members.assembly_streak`, Trusted Contributor at streak 10 | Keep; Assembly-scope accrual runs alongside |
| Vindication | `dispute_wins` on dismissed dispute; reserved `organizations.cassandra_wins` column | Counters only — **no 2^n bonus, no score effect, no named events** |
| Quality signal | Juror ratings `newsworthy`/`interesting` (1-10) in `user_ratings` | Source for the quality tier (B3 decision 1) |
| Per-item adjudication | Inline edits resolved independently; vault entries graduate via `survival_count` | Partial — headline/affirmation inherit whole-submission verdict (acceptable: they ARE the submission) |

### B2. What's missing (the actual build)

1. **Four-score model** — nothing stores earned/possible by role × scope. Today's
   public numbers are ad-hoc (`100 + sqrt(total_wins)` in the consensus feed;
   `wins/(wins+losses)` in corrections feed) and must converge on `computeScore()`.
2. **Weighted points** — no item weights or quality multipliers anywhere.
3. **Rescue bonuses** — no Cassandra/Whistleblower `points × 2^n` events, no
   numerator-only accounting, no public "bonus fired" record.
4. **Deception divisor** — `deliberate_lies` is displayed raw; the
   `raw% / (1 + lies)` rule and auto-ban-review threshold are unimplemented.
5. **Marks economy** — `stake_points` is recorded but never charged to anyone;
   no wallet, no juror pay, no grants. (`agent_credits` is a separate system and
   stays separate.)
6. **Score ledger** — no per-event audit trail ("visible, named events").

### B3. Decisions taken (flag if you disagree)

1. **Quality tier source**: average of jury `newsworthy`/`interesting` ratings →
   `< 4` low, `4–7` normal, `> 7` high. No new juror UI needed.
2. **Backfill**: convert history at normal quality, weight 1 — each `total_win`
   → 1 earned + 1 possible; each `total_loss` → 1 possible. Old counters remain
   untouched (the spec demands the original record is preserved).
3. **Rollout**: new scores computed and displayed **alongside** existing numbers
   first; ad-hoc formulas replaced only after visual sign-off.
4. **Stakes become real**: dispute filing debits the Marks wallet (spec values);
   the round's jurors split the stake. Existing `stake_points` stays for audit.
5. **Whistleblower eligibility**: jurors who cast a minority (losing) vote on a
   verdict that is later flipped by dispute — "a real vote with point value",
   per the anti-spam image.

### B4. Phases

- **Phase 1 — Foundation (this commit)**: canonical spec; pure scoring engine
  (`src/lib/scoring/`) passing every worked example from the images; migration
  027 (`citizen_scores`, `score_events`, `marks_transactions`, `users.marks_balance`).
- **Phase 2 — Accrual wiring**: vote-resolution.ts records score_events +
  updates citizen_scores on every submission resolution (submitter, A4) and
  per-juror (A5); assembly scope on in-group review, system scope on cross-group.
- **Phase 3 — Rescue & penalties**: dispute resolution fires Cassandra (flipped
  rejection → submitter) and Whistleblower (flipped verdict → minority jurors)
  bonuses with `2^n` depth from counted dispute rounds; deception divisor applied
  at display; auto-ban review at 3 findings.
- **Phase 4 — Marks**: wallet grants, dispute stakes debited, juror pay credited,
  vindication refunds. Dispute ladder constants moved to engine.
- **Phase 5 — Display**: four-score panel (percentage + raw points together) on
  profile/citizen lookup; public score ledger with named bonus events; extension
  overlay and public feeds switch to `computeScore()` on System-scope rows.

### B5. Known deltas from current behavior (intentional)

- Dispute stake becomes `10 × 2^(r-1)` Marks (was abstract `2^r` points).
- Cooldown becomes `2^(r-1)` days (was `2^r`) — round 1 costs 1 day, not 2.
- Dispute jury becomes `5 + 2r` (was 1.5-2× min 7) — round 1: 7 (same), deeper
  rounds grow linearly forever instead of capping.
- Wild West mode (< 100 users): scoring accrues normally, but deception findings
  stay disabled there, so the divisor cannot fire — consistent with current rules.


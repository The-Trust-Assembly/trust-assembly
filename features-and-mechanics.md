# Features & Mechanics

Detailed reference for how each feature works in the current implementation.

---

## Submission Lifecycle

### 1. Creation

A citizen submits a **correction** or **affirmation** against a published article URL.

- **Correction:** Proposes that a headline or article is misleading. Includes the original headline, a proposed replacement, evidence, and reasoning. Can include inline edits to article text.
- **Affirmation:** Proposes that a headline or article is accurate and trustworthy. Includes supporting evidence.

Submissions can be filed to multiple Assemblies simultaneously (multi-assembly support). Evidence items and linked vault entries can be attached.

### 2. Jury Assignment

The system selects a jury pool from the submitter's Assembly:
- Pool size = 3x the required jury size
- Jury size scales with Assembly membership: 3 (small) to 13 (large)
- Jurors must **explicitly accept** the assignment before they can vote
- Self-review and AI-partner review are prohibited
- In Wild West mode (< 100 total users): only 1 reviewer required

### 3. Jury Voting

Each juror rates the submission on three dimensions (1-10 scale):
- **Accuracy** — is the factual claim correct?
- **Newsworthiness** — how important is this?
- **Interestingness** — how compelling or novel?

Jurors can also flag a submission as **deliberate deception** (disabled in Wild West mode).

### 4. Resolution

Votes are tallied via `vote-resolution.ts`. Outcomes:
- **Approved** — majority finds the submission accurate
- **Rejected** — majority finds the submission inaccurate
- **Approved (Deception)** — submission is accurate but was filed in bad faith
- **Rejected (Deception)** — submission is inaccurate and filed in bad faith

### 5. Cross-Group Promotion

Approved submissions advance to cross-group review:
- A new jury is drawn from **other Assemblies** (not the submitter's)
- Same voting process applies
- If approved at cross-group level: submission achieves **Consensus**
- If deception is found at cross-group level: **9x penalty** on the originating Assembly

### 6. KV Store Sync

Every submission creation and vote resolution syncs a denormalized copy to the KV store. This allows the browser extension to serve corrections without hitting the relational schema.

---

## Submission Statuses

The full status lifecycle (10 states):

```
pending_jury → jury_assigned → in_review → approved / rejected
                                         → approved_deception / rejected_deception
approved → cross_group_pending → cross_group_review → consensus / cross_group_rejected
                                                    → dismissed
```

---

## Scoring Formula

```
Trust Score = sqrt(Points) x Quality / Drag + Cassandra Bonus
```

### Points
```
Points = (wins x w_win) + (disputeWins x w_disputeWin) + floor(streak / w_streakInterval)
```
- Each approved submission earns `w_win` points
- Each successful dispute earns `w_disputeWin` points
- Consecutive approvals (streak) earn bonus points every `w_streakInterval` submissions

### Quality
```
Quality = min((avgNews + avgFun) / w_qualityDivisor, w_qualityCap) ^ w_qualityExp
```
- Based on average newsworthiness and interestingness ratings received
- Capped to prevent runaway multiplication
- Raised to an exponent to create non-linear rewards for high quality

### Drag
```
Drag = 1 + sqrt(reg_losses x w_lossDrag + failed_disputes x w_failedDisputeDrag) + (lies x w_lieDrag)
```
- Regular losses and failed disputes contribute via square root (diminishing)
- **Lies contribute linearly** — this is the asymmetry that makes deception catastrophic
- Drag is a divisor, so higher drag reduces the entire score

### Cassandra Bonus
```
Cassandra = sum( w_vindicationBase x (news/10 x fun/10) x rejections ^ w_persistenceExp )
```
- Additive (not multiplicative) — cannot be reduced by Drag
- Scales with the impact of the vindicated submission (news x fun ratings)
- Scales exponentially with the number of rejections endured before vindication

### Weights

All 11 weights are community-votable:
- `w_win`, `w_disputeWin`, `w_streakInterval`
- `w_qualityDivisor`, `w_qualityCap`, `w_qualityExp`
- `w_lossDrag`, `w_failedDisputeDrag`, `w_lieDrag`
- `w_vindicationBase`, `w_persistenceExp`

---

## Disputes

- Any citizen can file a dispute against an approved submission
- Filing cost is weighted by Trust Score ratio: `disputant_score / submitter_score`
  - Higher-scored citizens can dispute more cheaply
  - Lower-scored citizens pay more (prevents harassment)
- A dispute jury is selected and votes on the dispute
- Successful disputes reverse the original outcome and penalize the submitter
- Failed disputes penalize the disputant

---

## Concessions

- A citizen can formally concede that a previous submission was wrong
- **One free concession per week** — full recovery of lost reputation
- Additional concessions in the same week recover only **90%**
- **Time-decay recovery** — the sooner you concede after a loss, the less permanent damage
- Concessions are themselves voted on by a jury to prevent abuse

---

## Assembly Vaults

Four types of vault entries:

| Type | Purpose |
|------|---------|
| Standing Corrections | Reusable factual corrections applicable across multiple articles |
| Arguments | Rhetorical frameworks and logical tools |
| Foundational Beliefs | Stated axioms the Assembly holds as true |
| Translations | Language replacements (clarity, propaganda, euphemism, satirical) |

Vault entries go through the same jury review process as submissions. Approved translations are applied automatically by the browser extension.

Vault entries can be filed to multiple Assemblies simultaneously.

---

## Browser Extensions

Available for Chrome (MV3), Firefox (MV2-compatible), and Safari (MV3).

### What they do:
- On every page load, `content.js` queries `/api/corrections?url=<current_url>`
- Overlays approved corrections, affirmations, and translations on the page
- Toolbar icon changes color:
  - **Red** — corrections exist for this page
  - **Green** — affirmations exist for this page
  - **Gold** — default / mixed signals
- Badge count shows number of active corrections
- Popup allows login, submission, and settings
- Background worker polls for notifications (jury assignments, application approvals, status updates) every 60 seconds

### Privacy:
The `/api/corrections` endpoint is **stateless and blind**. It does not log URLs, IPs, or browsing activity.

---

## Trusted Contributor

- Earned after **10 consecutive approved submissions** within a single Assembly
- Subsequent submissions **skip jury review** in that Assembly
- Submissions remain **disputable** — trust is earned, never absolute
- Status is per-Assembly, not global

---

## AI Agents

- An AI agent registers with a human partner via a DI (Digital Intelligence) request
- The human partner must approve the partnership
- All scoring consequences flow to the human partner's Trust Score
- The AI can submit, vote, and participate — but the human is accountable

---

## Notifications

Users receive notifications for:
- Jury assignment (you've been selected to review a submission)
- Application approval/rejection (for tribal/sponsor Assemblies)
- Submission status changes (your submission was approved/rejected/disputed)
- Browser extension polls for these every 60 seconds via background worker

---

## Audit Log

All significant actions are logged to the `audit_log` table:
- Submissions, votes, disputes, concessions
- Assembly creation, membership changes
- Admin actions

Queryable via `/api/audit`.

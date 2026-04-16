# Core Concepts

This page defines the key concepts in Trust Assembly and traces each one back to the philosophical vision.

---

## Assemblies

**What they are:** Groups of citizens organized around shared beliefs, missions, or interests. Every user starts in the "General Public" assembly. Users can create or join up to 12 assemblies.

**Enrollment modes:**
- **Open** — anyone can join
- **Tribal** — founder approval required
- **Sponsor** — existing members must vouch for new applicants

**Why they exist:** In the novel, the Forum allows people to form polities around topics rather than geography. Assemblies are the Trust Assembly equivalent. They create in-group trust networks that can then be tested against out-group consensus. The two-layer structure (in-group review, then cross-group review) is what prevents filter bubbles — truth must survive scrutiny from both allies and strangers.

**Novel parallel:** The novel describes how the Forum allowed the Capitol rebuild to happen through self-organizing groups of specialists (architects, concrete experts, bronze-casters) who formed around topics rather than political parties.

---

## Corrections and Affirmations

**What they are:** The two types of submissions a citizen can make.

- **Correction:** Identifies a misleading headline or article and proposes a factual replacement. Includes evidence and reasoning.
- **Affirmation:** Confirms that an accurate headline or article is trustworthy, with supporting evidence.

Both go through the same jury review process.

**Why they exist:** The Index in the novel tracks predictions and accuracy across all public statements. Trust Assembly starts with the most tangible version of this: fact-checking published media. Corrections are the atomic unit of truth-seeking. Affirmations prevent the system from becoming purely adversarial — accurate reporting should also be surfaced and rewarded.

**Novel parallel:** The novel's Subtractive Journalists — people whose entire contribution was proving the falseness of other journalists. Corrections and affirmations formalize this into a structured, adjudicated process.

---

## Jury Review

**What it is:** Randomly selected jurors from the submitter's Assembly rate submissions on three dimensions:
- **Accuracy** — is the correction/affirmation factually true?
- **Newsworthiness** — how important is this?
- **Interestingness** — how engaging or novel is this?

Jury size scales from 3 to 13 based on Assembly membership count. Jury pools are 3x the required size; jurors must explicitly accept before they can vote.

**Why it exists:** Juries are the adjudication mechanism of the Forum. Peer review by a random sample prevents capture by any single faction. The three rating dimensions reflect the novel's insight that truth alone is not enough — the system must also surface what *matters* and what people find *compelling*, because attention is finite and must be economized toward what is both true and important.

**Novel parallel:** The novel describes how Forum jury moderation replaced top-down content moderation by twenty-something political wonks. The key shift: citizens own their own moderation process, have rights of appeal, and the rules themselves are voted on.

---

## Cross-Group Consensus

**What it is:** Corrections that pass in-group jury review advance to a second round of review by juries drawn from *other* Assemblies. What survives both stages achieves **Consensus** — the highest trust signal in the system.

**Why it exists:** This is the mechanism that prevents filter bubbles and echo chambers. It is easy to convince people who already agree with you. The true test of truth is whether it can convince people who have no prior reason to agree.

A cross-group deception finding incurs a **9x penalty** on the originating Assembly's reputation. This makes it extremely costly for any Assembly to try to push false narratives through the system.

**Novel parallel:** In the novel, the Forum required proposals to survive both in-group and cross-group review before becoming policy. This is the same idea applied to media corrections. The novel explicitly addresses the concern about extremist Assemblies (e.g., "you can have a Neo-Nazi Assembly... but those corrections will never survive cross-group review").

---

## Trust Score

**What it is:** A reputation score calculated per user that reflects their track record of accuracy, quality, and honesty.

```
Trust Score = sqrt(Points) x Quality / Drag + Cassandra Bonus
```

- **Points** accumulate from wins, dispute wins, and streaks
- **Quality** is a multiplier from average newsworthiness and interestingness ratings
- **Drag** increases from losses, failed disputes, and especially lies
- **Cassandra Bonus** is an additive reward for vindicated persistence

**Key properties:**
- **Volume has diminishing returns** (square root) — you can't game the system by flooding it with low-quality submissions
- **Quality multiplies everything** — being consistently good matters more than being prolific
- **Lies bypass the diminishing curve** — deception is catastrophically penalized, not just proportionally
- **All weights are community-votable** — the formula itself is subject to democratic control

**Why it exists:** This is the Index score from the novel. It makes truth-telling the dominant strategy through game theory. Being honest has compounding returns. Being deceptive has catastrophic costs. The asymmetry is deliberate — in the novel, Melvin Sninkle understood that the system needed to make deception "structurally irrational."

**Novel parallel:** The Index made it immediately visible whether a reporter had been consistently right or wrong. Chastity Anderson's career was destroyed not by opinion but by documented fact — she had almost never been correct about anything.

---

## The Cassandra Rule

**What it is:** If you submit a correction that is repeatedly rejected by juries, but you refuse to concede because you believe you are right, and you are eventually vindicated (the correction is later approved), you earn a massive additive bonus that scales with:
- **Impact** — how newsworthy and interesting the correction turned out to be
- **Persistence** — how many rejections you endured before vindication

**Why it exists:** This is perhaps the most important single mechanism in the system. Without it, the system would converge on popular consensus rather than truth. The Cassandra Rule ensures that lone voices who happen to be right are not only protected but *massively rewarded*. It creates an incentive to persist in the face of rejection when you genuinely believe you are correct.

**Novel parallel:** The novel describes how the Index elevated those who had been right when everyone else was wrong. The example of Mike Cernovich and Balaji Srinivasan on COVID — they were right early, ignored because of who they were, and there was no mechanism to retroactively credit them. The Cassandra Rule is that mechanism.

**Game theory:** The Cassandra Rule creates a fascinating dilemma for participants. If you truly believe you are right, persistence is rewarded. If you are wrong but persistent, you accumulate losses and drag. The system thus sorts for genuine conviction backed by actual accuracy.

---

## Translations

**What they are:** A vault artifact that strips propaganda, jargon, and euphemisms from language. When approved by an Assembly, translations are applied automatically by the browser extension across all articles.

**Translation types:**
- **Clarity** — replacing jargon with plain language
- **Propaganda** — identifying and replacing propagandistic framing
- **Euphemism** — exposing euphemistic language
- **Satirical** — humorous reframings

**Why they exist:** The novel describes at length how Pre-Forum media used artificial, theatrical language to obscure reality. News Sellers spoke with an "artificial, theatrical diction not common to any other human interaction." Translations are a direct attack on this — they allow the community to collectively decode manipulative language and make the decoded version visible to everyone.

---

## Assembly Vaults

**What they are:** Shared knowledge bases per Assembly containing:
- **Standing Corrections** — reusable factual corrections that can be applied across multiple articles
- **Arguments** — rhetorical tools and logical frameworks
- **Foundational Beliefs** — stated axioms the Assembly holds to be true
- **Translations** — language replacements (see above)

**Why they exist:** Vaults are the institutional memory of each Assembly. They prevent the same debates from being relitigated endlessly and allow accumulated knowledge to compound. Standing Corrections are especially powerful — once a fact is established, it can be applied everywhere it's relevant without re-adjudicating each time.

---

## Disputes

**What they are:** Formal challenges to approved submissions. A citizen can file a dispute against a correction or affirmation they believe was wrongly approved.

Disputes have escalating costs weighted by the Trust Score ratio between the disputant and the original submitter. A higher-scored citizen can dispute more cheaply; a lower-scored citizen pays more. This prevents harassment while still allowing challenges.

**Why they exist:** The appeals process from the novel. Every adjudication must be challengeable, or the system calcifies. The cost-weighting prevents abuse while ensuring that well-established citizens can't hide behind their reputation — anyone can challenge them, it just costs more if you have less credibility.

---

## Concessions

**What they are:** Formal admissions of error. A citizen can concede that a previous submission was wrong.

- One free concession per week
- Additional concessions recover only 90% of lost reputation
- Time-decay recovery — the sooner you concede, the less damage

**Why they exist:** The novel describes "Digital Forgiveness" — explaining precisely how you were wrong and why you now think differently. The system must reward honesty about past mistakes, not just present accuracy. Without concessions, people would double down on errors to avoid admitting fault. With them, intellectual honesty becomes the optimal strategy.

---

## Trusted Contributor

**What it is:** After 10 consecutive approved submissions within an Assembly, a user earns Trusted Contributor status. Their subsequent submissions skip jury review (but remain disputable).

**Why it exists:** Efficiency. The system should not impose the same overhead on someone who has proven themselves trustworthy. But the "disputable" caveat is crucial — trust is earned, never absolute. Any submission can still be challenged.

---

## AI Agents

**What they are:** AI agents can register with an accountable human partner who receives all scoring consequences. The AI can participate in the system, but a human is always responsible.

**Why they exist:** The novel describes AI participation in the Forum and Index, with humans vouching for results. This is the same principle — AI can contribute to truth-seeking, but accountability must remain with humans. The human partner's Trust Score rises and falls with the AI's performance.

---

## Wild West Mode

**What it is:** When the system has fewer than 100 total users, simplified rules apply:
- Only 1 reviewer per submission instead of a full jury
- Deliberate deception findings are disabled
- Self-review and partner-review restrictions remain

**Why it exists:** A practical concession. The novel describes the Forum's chaotic early days when it had too few users to form meaningful juries. Wild West mode allows the platform to function during bootstrap while preserving the most critical integrity checks.

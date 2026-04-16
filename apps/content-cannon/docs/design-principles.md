# Design Principles

These principles guide every decision about features, incentives, and architecture. When you are unsure about a design choice, return here.

---

## 1. Truth Is the Equilibrium, Not the Rule

The system does not define what is true. It creates conditions where truth tends to survive and falsehood tends to erode through adversarial review. No authority declares truth. Juries adjudicate. Scores track. Time reveals.

**In practice:** Never build features that require a central authority to determine truth. Build features that subject claims to structured adversarial review and let outcomes emerge.

---

## 2. Make Deception Structurally Irrational

Honesty should be the dominant game-theoretic strategy. The scoring formula must ensure that the expected value of lying is always negative, even if you get away with it sometimes. The cost of being caught in deception must be catastrophic, not proportional.

**In practice:** Lies bypass the square-root diminishing returns curve. Cross-group deception carries a 9x multiplier. The asymmetry is the point.

---

## 3. Protect the Cassandra

The system must not converge on popular consensus. It must converge on truth. These are not the same thing. The Cassandra Rule — massive rewards for those who persist against incorrect consensus and are eventually vindicated — is not a nice-to-have. It is load-bearing. Without it, the system becomes a popularity contest.

**In practice:** Never remove or weaken the Cassandra bonus. When designing new features, ask: "Does this protect the lone voice who happens to be right?"

---

## 4. Cross-Group Review Prevents Filter Bubbles

In-group approval is necessary but not sufficient. Any claim that aspires to Consensus must survive scrutiny from people who have no prior reason to agree. This is what separates Trust Assembly from every other fact-checking system.

**In practice:** Never allow in-group-only approval to be the highest trust signal. Cross-group review is the mechanism that makes the system trustworthy to outsiders.

---

## 5. Incentivize Accuracy, Not Attention

The novel's core diagnosis is that modern media incentivizes attention over accuracy. Trust Assembly must do the opposite. Volume has diminishing returns. Quality multiplies. Being correct over long periods of time is the path to influence.

**In practice:** The square root on points is deliberate. The quality multiplier is deliberate. Never add features that reward volume or engagement over demonstrated accuracy.

---

## 6. Citizens Own Their Moderation

Content moderation must never be top-down. Citizens create rules, citizens report violations, citizens serve as jurors, citizens can appeal. The rules themselves are votable. The system is a self-governing republic, not a platform with terms of service.

**In practice:** All 11 scoring weights are election-settable. Moderation rules should be transparent and user-controlled. Never build a feature where an admin decides what content is acceptable.

---

## 7. Transparency by Default

The novel's Melvin Sninkle was revolutionary because he showed his work. Every calculation, every data source, every possible error. Trust Assembly follows the same principle. The scoring formula is public. The adjudication process is visible. Audit logs exist for all actions.

**In practice:** Never hide the reasoning behind a score, a jury decision, or a system action. If a user's submission is rejected, they should be able to see exactly why, by whom, and challenge it.

---

## 8. Privacy at the Query Layer

The browser extension queries the API for corrections on the current URL. This query is stateless and blind — it does not log the URL, the requester's IP, or any browsing activity. Trust Assembly tracks what people *say*, not what they *read*.

**In practice:** The `/api/corrections` endpoint must remain stateless. Never track user browsing behavior. The system's power comes from public accountability for public statements, not surveillance.

---

## 9. Concession Is a Feature, Not a Bug

The system must reward intellectual honesty about past mistakes. Doubling down on errors should always be worse than admitting them. The concession mechanism — with time-decay recovery and one free per week — makes admitting error the rational choice.

**In practice:** Never penalize concessions more harshly than persistence in error. The time-decay curve should always favor faster admission of mistakes.

---

## 10. Start with the Index, Build Toward the Forum

Trust Assembly's current scope is the Index — reputation tracking, accuracy measurement, truth-surfacing applied to published media. The full Forum — topic-based delegation, conditional funding, policy-making — is the long-term vision. But the Index is the foundation. Without trustworthy credentialing, delegation and funding are meaningless.

**In practice:** When prioritizing features, ask: "Does this improve our ability to identify who is trustworthy on what topic?" If yes, it's in scope. Features that assume the Forum already exists (delegation, funding allocation) are future work.

---

## 11. The System Must Work When Small

Wild West mode exists because the system must be usable from day one, even with a handful of users. Features must degrade gracefully. A three-person jury is better than no jury. One reviewer is better than no review. The system should always be functional, just with appropriate guardrails for scale.

**In practice:** Always consider the bootstrap case. If a feature requires 1,000 users to function, build a fallback for 10 users.

---

## 12. Human Accountability Is Non-Negotiable

AI agents can participate, but a human must always bear the scoring consequences. This is not a temporary limitation — it is a design principle. The system measures human trustworthiness. AI is a tool that humans use, and humans are accountable for their tools.

**In practice:** AI Agent partnerships must always have a human partner. The human's Trust Score moves with the AI's performance. Never allow autonomous AI participation without human accountability.

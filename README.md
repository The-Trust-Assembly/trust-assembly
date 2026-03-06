# Trust Assembly

**A civic deliberation platform where truth is the only thing that survives adversarial review.**

Trust Assembly is a structured reputation system for media correction, fact verification, and collective truth-seeking. Citizens submit corrections or affirmations of published articles. Juries review them. Cross-group verification prevents filter bubbles. The scoring formula rewards honesty and makes deception structurally irrational.

> *Truth Will Out.*

---

## What It Does

- **Corrections & Affirmations** — Citizens identify misleading headlines and propose factual replacements (corrections), or affirm accurate headlines with supporting evidence (affirmations). Both go through the same jury review process.
- **Jury Review** — Randomly selected jurors rate submissions on accuracy, newsworthiness, and interestingness. Jury size scales from 3 to 13 based on Assembly membership.
- **Cross-Group Consensus** — Corrections that pass in-group review advance to cross-group juries drawn from *other* Assemblies. What survives both achieves Consensus — the highest trust signal.
- **Asymmetric Scoring** — `Trust Score = √(Points) × Quality / Drag + Cassandra Bonus`. Volume has diminishing returns. Quality multiplies everything. Lies bypass the diminishing curve and devastate scores. All weights are community-votable.
- **The Cassandra Rule** — If you're rejected repeatedly but refuse to concede because you're right, and are eventually vindicated, you earn a massive additive bonus that scales with impact and persistence. Named for the prophet nobody believed.
- **Translations** — A vault artifact that strips propaganda, jargon, and euphemisms from language. "Enhanced interrogation techniques" → "Torture". Approved translations are applied automatically by the browser extension across all articles.
- **Assembly Vaults** — Shared knowledge bases per Assembly: Standing Corrections (reusable facts), Arguments (rhetorical tools), Foundational Beliefs (axioms), and Translations (language replacements).
- **Disputes** — Intra-group disputes with escalating costs weighted by Trust Score ratios.
- **Concessions** — Time-decay recovery for admitting errors. One free per week; additional at 90%.
- **Digital Intelligences** — AI agents can register with an accountable human partner who receives all scoring consequences.

## Architecture

Trust Assembly is currently a **single-file React SPA** (`trust-assembly-v5.jsx`, ~4,600 lines) designed to run as a Claude.ai artifact. It uses `window.storage` for persistence (a key-value store available in the artifact sandbox).

### Key Files

| File | Purpose |
|------|---------|
| `trust-assembly-v5.jsx` | The complete application — all components, business logic, scoring, and UI |
| `trust-assembly-v5.js` | Same file with .js extension for environments that prefer it |
| `trust-assembly-crest.png` | 1024×1024 woodcut-style heraldic shield logo |
| `future-vision.md` | Public-facing roadmap document (also rendered in-app on the Vision tab) |

### Technology

- **React** (functional components with hooks)
- **Tailwind-compatible inline styles** using CSS custom properties
- **No build step** — runs directly in environments that support JSX
- **Fonts**: EB Garamond (serif), IBM Plex Mono (mono), Source Serif 4 (body)
- **Color palette**: Navy (#1B2A4A), Linen (#F0EDE6), Vellum (#FDFBF5), Gold (#B8963E)

### Storage Keys

All data is stored under versioned keys (currently `v6`):

| Key | Contents |
|-----|----------|
| `ta-u-v6` | User accounts (hashed passwords, profiles, scoring data) |
| `ta-o-v6` | Assemblies (members, reputation, concessions) |
| `ta-s-v6` | Submissions (corrections, affirmations, votes, audit trails) |
| `ta-vault-v6` | Standing Corrections vault |
| `ta-args-v6` | Arguments vault |
| `ta-beliefs-v6` | Foundational Beliefs vault |
| `ta-trans-v6` | Translations vault |
| `ta-disp-v6` | Disputes |
| `ta-a-v6` | Global audit trail |
| `ta-concessions` | Assembly concession proposals and votes |

### Scoring Formula

```
Trust Score = √(Points) × Quality / Drag + Cassandra Bonus

Points   = (wins × w_win) + (disputeWins × w_disputeWin) + floor(streak / w_streakInterval)
Quality  = min((avgNews + avgFun) / w_qualityDivisor, w_qualityCap) ^ w_qualityExp
Drag     = 1 + √(reg_losses × w_lossDrag + failed_disputes × w_failedDisputeDrag) + (lies × w_lieDrag)

Cassandra = Σ w_vindicationBase × (news/10 × fun/10) × rejections ^ w_persistenceExp
```

Default weights (all election-settable):
| Weight | Value | Purpose |
|--------|-------|---------|
| w_win | 1.0 | Points per approved correction |
| w_disputeWin | 2.0 | Points per successful dispute |
| w_streakInterval | 3 | Consecutive wins per bonus point |
| w_qualityDivisor | 10 | Quality normalization |
| w_qualityCap | 1.6 | Soft cap preventing rating inflation |
| w_qualityExp | 1.5 | Amplifies quality gap between trivial and important work |
| w_lossDrag | 2.0 | Loss severity (inside √, diminishing) |
| w_lieDrag | 3.0 | Lie severity (linear, no mercy) |
| w_failedDisputeDrag | 2.0 | Failed dispute severity (inside √) |
| w_vindicationBase | 10.0 | Base value of Cassandra vindication |
| w_persistenceExp | 1.5 | Exponent on rejection count |

### Submission Types

| Type | Purpose | Required Fields |
|------|---------|----------------|
| Correction | Headline is misleading | URL, headline, replacement, reasoning, evidence |
| Affirmation | Headline is accurate | URL, headline, reasoning, evidence |

Both types capture the optional **author** field for future writer accountability ratings.

### Vault Types

| Vault | Icon | Purpose | Categories |
|-------|------|---------|------------|
| Standing Corrections | 🏛 | Reusable verified facts | — |
| Arguments | ⚔️ | Fundamental arguments for reuse | — |
| Foundational Beliefs | 🧭 | Core axioms — starting premises | — |
| Translations | 🔄 | Plain-language replacements | Clarity, Anti-Propaganda, Euphemism, Satirical |

## Navigation

Two-row navigation with clear hierarchy:

**Top row (workflow):** Record · Assemblies · Submit · Review

**Bottom row (reference):** Vaults · Consensus · Citizen · Ledger · Guide · Rules · About · Vision

## Getting Started

### As a Claude Artifact

1. Open Claude.ai
2. Create a new artifact
3. Paste the contents of `trust-assembly-v5.jsx`
4. The app renders with the interactive onboarding tutorial

### Local Development

The app is a single React component with a default export:

```bash
cp trust-assembly-v5.jsx src/App.jsx
npm start
```

Note: `window.storage` is specific to the Claude.ai sandbox. For local dev, implement a compatible storage adapter (localStorage, IndexedDB, or backend API).

## Planned API Endpoints

```
POST   /api/submissions          Create correction or affirmation
GET    /api/submissions/:id      Get submission with votes and audit trail
POST   /api/submissions/:id/vote Cast jury vote
POST   /api/disputes             File dispute
POST   /api/concessions          Propose concession
GET    /api/assemblies            List assemblies
GET    /api/users/:id/profile    Trust Score breakdown
GET    /api/vault/:orgId         Assembly vault entries
GET    /api/translations/:orgId  Assembly translations
GET    /api/corrections?url=     Get corrections for a URL (extension endpoint)
```

## Future Development

See `future-vision.md` for the complete roadmap including browser extension, bounty system, subscriptions, appeal adjudication, AI agents, writer ratings, The Forum (AI-compatible government), and delegated voting.

## Contributing

Trust Assembly is in early beta. We welcome contributions in security review, adversarial testing, extension development, API extraction, documentation, and accessibility. Please open an issue before submitting PRs for major changes.

## Credits

Trust Assembly was designed and built through collaborative conversation between a human creator and Claude by Anthropic.

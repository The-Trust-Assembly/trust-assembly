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

Trust Assembly is a **Next.js 14 App Router** application deployed on Vercel with a PostgreSQL database (Vercel Postgres). The frontend is a large single-file React SPA (`trust-assembly-v5.jsx`, ~7,100 lines) that handles all UI, with server-side API routes for authentication, data persistence, and the browser extension API.

### Key Files

| File | Purpose |
|------|---------|
| `trust-assembly-v5.jsx` | Complete frontend — all components, business logic, scoring, and UI |
| `src/app/page.tsx` | Next.js page that renders the TrustAssembly component |
| `src/app/api/` | Server-side API routes (auth, submissions, voting, corrections, etc.) |
| `src/lib/auth.ts` | JWT authentication, bcrypt hashing, session management |
| `src/lib/db.ts` | Database connection (Vercel Postgres) |
| `src/lib/vote-resolution.ts` | Vote counting, reputation updates, cross-group promotion |
| `src/lib/sanitize.ts` | XSS output sanitization for browser extension content |
| `db/schema.sql` | PostgreSQL schema (20+ tables) |
| `extensions/chrome/` | Chrome extension (MV3) — popup, content script, background worker |
| `extensions/firefox/` | Firefox extension (MV2) |
| `extensions/safari/` | Safari extension (MV3) |

### Technology

- **Next.js 14** (App Router) on **Vercel**
- **Vercel Postgres** (PostgreSQL 16+) with `@vercel/postgres`
- **React** (functional components with hooks)
- **JWT** (HS256 via `jose`, 7-day expiry, HTTP-only cookies + Bearer tokens)
- **bcryptjs** (cost factor 12 for password hashing)
- **Fonts**: Newsreader (serif), IBM Plex Mono (mono), Inter (system)
- **Color palette**: Dark (#1a1a1a), Linen (#F0EDE6), Gold (#B8963E), Charcoal (#1E293B)
- **Browser extensions**: Chrome (MV3), Firefox (MV2), Safari (MV3)

### API Endpoints

```
POST   /api/auth/register         Create citizen account
POST   /api/auth/login            Authenticate (sets cookie, returns token)
POST   /api/auth/logout           Clear session
GET    /api/auth/me               Current user from session

POST   /api/submissions           Create correction or affirmation
GET    /api/submissions/:id       Get submission with votes and audit trail
POST   /api/submissions/:id/vote  Cast jury vote

POST   /api/disputes              File dispute
POST   /api/concessions           Propose concession

GET    /api/orgs                  List assemblies
POST   /api/orgs                  Create assembly
GET    /api/users/:id/profile     Trust Score breakdown

GET    /api/corrections?url=      Corrections for a URL (extension endpoint, stateless)
GET    /api/audit                 Audit log (auth required, RBAC)
POST   /api/admin/approve-pending Admin: bulk-approve submissions
POST   /api/admin/wild-west-backfill Admin: backfill submissions

GET    /api/kv?key=               Read KV cache
POST   /api/kv                    Write KV cache (auth required, protected keys need admin)

POST   /api/feedback              Submit beta feedback
```

### Privacy

The `GET /api/corrections?url=` endpoint is **stateless and blind by design**. It does not log, store, or record the queried URL, the requester's IP, or any request metadata. The URL is used solely as an in-memory filter key, then discarded. No analytics. No telemetry.

### Security

- Admin endpoints require `is_admin` role check via `requireAdmin()`
- KV store writes to protected keys (submissions cache) require admin
- Vote resolution pipeline runs in database transactions (BEGIN/COMMIT/ROLLBACK)
- All user-generated text served to browser extensions is HTML-entity-encoded on output
- JWT expiry reduced to 7 days (from 365 days)
- Audit logging on admin actions with user attribution

### Navigation

Two-row navigation with clear hierarchy:

**Top row (workflow):** Record · Assemblies · Submit · Review

**Bottom row (reference):** Vaults · Consensus · Citizen · Ledger · Guide · Rules · About · Vision

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 16+ (or Vercel Postgres)
- Environment variables: `POSTGRES_URL`, `JWT_SECRET`

### Local Development

```bash
npm install
npm run dev
```

### Database Setup

```bash
psql $POSTGRES_URL < db/schema.sql
```

### Browser Extension

1. Download the extension for your browser from the Extensions page
2. Load as unpacked (Chrome/Edge/Brave) or temporary add-on (Firefox)
3. The extension overlays corrections on articles as you browse

## Future Development

See `future-vision.md` for the complete roadmap including bounty system, subscriptions, appeal adjudication, AI agents, writer ratings, The Forum (AI-compatible government), and delegated voting.

## Contributing

Trust Assembly is in early beta. We welcome contributions in security review, adversarial testing, extension development, API extraction, documentation, and accessibility. Please open an issue before submitting PRs for major changes.

## Credits

Trust Assembly was designed and built through collaborative conversation between a human creator and Claude by Anthropic.

# Trust Assembly

**A civic deliberation platform where truth is the only thing that survives adversarial review.**

Trust Assembly is a structured reputation system for media correction, fact verification, and collective truth-seeking. Citizens submit corrections or affirmations of published articles. Juries review them. Cross-group verification prevents filter bubbles. The scoring formula rewards honesty and makes deception structurally irrational.

> *Truth Will Out.*

---

## What It Does

- **Corrections & Affirmations** — Citizens identify misleading headlines and propose factual replacements (corrections), or affirm accurate headlines with supporting evidence (affirmations). Both go through the same jury review process.
- **Jury Review** — Randomly selected jurors rate submissions on accuracy, newsworthiness, and interestingness. Jury size scales from 3 to 13 based on Assembly membership.
- **Cross-Group Consensus** — Corrections that pass in-group review advance to cross-group juries drawn from *other* Assemblies. What survives both achieves Consensus — the highest trust signal.
- **Asymmetric Scoring** — `Trust Score = 100 + √(Points) × Quality / Drag + Cassandra Bonus + Badge Bonus`. Base reputation of 100. Volume has diminishing returns. Quality multiplies everything. Lies bypass the diminishing curve and devastate scores. All weights are community-votable.
- **The Cassandra Rule** — If you're rejected repeatedly but refuse to concede because you're right, and are eventually vindicated, you earn a massive additive bonus that scales with impact and persistence. Named for the prophet nobody believed.
- **Translations** — A vault artifact that strips propaganda, jargon, and euphemisms from language. "Enhanced interrogation techniques" → "Torture". Approved translations are applied automatically by the browser extension across all articles.
- **Assembly Vaults** — Shared knowledge bases per Assembly: Standing Corrections (reusable facts), Arguments (rhetorical tools), Foundational Beliefs (axioms), and Translations (language replacements).
- **Disputes** — Intra-group disputes with escalating costs weighted by Trust Score ratios.
- **Concessions** — Time-decay recovery for admitting errors. One free per week; additional at 90%.
- **AI Agents** — AI agents can register with an accountable human partner who receives all scoring consequences.

## Architecture

Trust Assembly is a **Next.js 14 App Router** application deployed on Vercel with a PostgreSQL database (Vercel Postgres). The frontend is a modular React SPA organized under `spa/` with 21 screen components, 6 shared components, and 12 utility files. Server-side API routes handle authentication, data persistence, vote resolution, and the browser extension API.

### Key Files

| File / Directory | Purpose |
|------------------|---------|
| `spa/App.jsx` | Main SPA shell — routing, auth state, navigation |
| `spa/pages/` | 21 screen components (Feed, Submit, Review, Vault, Assemblies, Profile, etc.) |
| `spa/components/` | 6 shared components (UI primitives, AssemblyGuide, RecordDetailView, etc.) |
| `spa/lib/` | Client utilities (queries, scoring, validation, jury logic, storage) |
| `src/app/api/` | Server-side API routes (25+ endpoint families) |
| `src/lib/auth.ts` | JWT authentication, bcrypt hashing, session management |
| `src/lib/db.ts` | Database connection, `withTransaction()` helper for real transactions |
| `src/lib/vote-resolution.ts` | Vote counting, reputation updates, cross-group promotion |
| `src/lib/submission-states.ts` | Centralized state machine for submission status transitions |
| `src/lib/validation.ts` | Input validation (`MAX_LENGTHS`, `validateFields()`, `isValidUUID()`) |
| `src/lib/sanitize.ts` | XSS output sanitization for browser extension content |
| `src/lib/rate-limit.ts` | In-memory sliding-window rate limiter for auth endpoints |
| `db/schema.sql` | PostgreSQL schema (20+ tables) |
| `db/migrations/` | 7 versioned SQL migration files |
| `tests/uat/` | 8 UAT test scripts for Chrome extension testing |
| `extensions/chrome/` | Chrome extension (MV3) — popup, content script, background worker |
| `extensions/firefox/` | Firefox extension (MV2) |
| `extensions/safari/` | Safari extension (MV3) |

### Technology

- **Next.js 14** (App Router) on **Vercel**
- **Vercel Postgres** (PostgreSQL 16+) with `@vercel/postgres`
- **React** (functional components with hooks)
- **TanStack Query** (v5) for server state management and cache invalidation
- **JWT** (HS256 via `jose`, 7-day expiry, HTTP-only cookies + Bearer tokens)
- **bcryptjs** (cost factor 12 for password hashing)
- **Fonts**: Newsreader (serif), IBM Plex Mono (mono), Inter (system)
- **Color palette**: Dark (#1a1a1a), Linen (#F0EDE6), Gold (#B8963E), Charcoal (#1E293B)
- **Browser extensions**: Chrome (MV3), Firefox (MV2), Safari (MV3)

### API Endpoints

```
Authentication
POST   /api/auth/register             Create citizen account
POST   /api/auth/login                Authenticate (sets cookie, returns token)
POST   /api/auth/logout               Clear session
GET    /api/auth/me                   Current user from session

Submissions
POST   /api/submissions               Create correction or affirmation
GET    /api/submissions/:id           Get submission with votes and audit trail
POST   /api/submissions/:id/vote      Cast jury vote
POST   /api/submissions/:id/di-review DI partner pre-approval
POST   /api/submissions/:id/recuse    Jury member recusal
GET    /api/submissions/di-queue      DI partner review queue

Stories
GET    /api/stories                   List story proposals
POST   /api/stories                   Create story proposal
POST   /api/stories/:id/vote          Vote on story

Disputes & Concessions
POST   /api/disputes                  File dispute
POST   /api/disputes/:id/vote         Vote on dispute
POST   /api/concessions               Propose concession
POST   /api/concessions/:id/vote      Vote on concession

Assemblies
GET    /api/orgs                      List assemblies
POST   /api/orgs                      Create assembly
POST   /api/orgs/:id/join             Join assembly
POST   /api/orgs/:id/leave            Leave assembly

Vault
GET    /api/vault                     List vault entries (corrections, arguments, beliefs, translations)
POST   /api/vault                     Create vault entry

Users & Notifications
GET    /api/users/:username           Public profile and Trust Score breakdown
DELETE /api/users/me/delete           Delete own account
GET    /api/notifications             Pending items for current user
PATCH  /api/notifications             Mark notifications read

Drafts
GET    /api/drafts                    List saved drafts
POST   /api/drafts                    Save draft

Browser Extension
GET    /api/corrections?url=          Corrections for a URL (stateless, privacy-first)

Transparency & Admin
GET    /api/audit                     Audit log
GET    /api/health                    System health check
POST   /api/feedback                  Submit beta feedback
POST   /api/admin/approve-pending     Admin: bulk-approve submissions
POST   /api/admin/repair-data         Admin: repair historical data inconsistencies
GET    /api/admin/diag-transactions   Admin: transaction integrity diagnostic
```

### Privacy

The `GET /api/corrections?url=` endpoint is **stateless and blind by design**. It does not log, store, or record the queried URL, the requester's IP, or any request metadata. The URL is used solely as an in-memory filter key, then discarded. No analytics. No telemetry.

### Security

- Admin endpoints require `is_admin` role check via `requireAdmin()`
- All multi-step write operations use `sql.connect()` or `withTransaction()` for real database transactions
- State machine validation (`src/lib/submission-states.ts`) prevents invalid submission status transitions
- Rate limiting on auth endpoints via in-memory sliding-window (`src/lib/rate-limit.ts`)
- All user-generated text served to browser extensions is HTML-entity-encoded on output (`src/lib/sanitize.ts`)
- Input validation via centralized `MAX_LENGTHS` and `validateFields()` across ~48 route handlers
- CORS policy restricts credentialed requests to same-origin and extension origins
- All API routes support both cookie and Bearer token authentication via `getCurrentUserFromRequest()`
- JWT expiry set to 7 days with HTTP-only cookies
- Structured error logging to `client_errors` table with deduplication
- Audit logging on admin actions with user attribution
- Comprehensive diagnostic suite (`GET /api/admin/diag-transactions`) audits transaction integrity, vote forensics, reputation consistency, and data health

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

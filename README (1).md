# Trust Assembly

**A civic deliberation platform where truth is the only thing that survives adversarial review.**

Trust Assembly is a structured reputation system for media correction, fact verification, and collective truth-seeking. Citizens submit corrections or affirmations of published articles. Juries review them. Cross-group verification prevents filter bubbles. The scoring formula rewards honesty and makes deception structurally irrational.

> *Truth Will Out.*

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Getting Started](#getting-started)
6. [API Overview](#api-overview)
7. [Database Schema Summary](#database-schema-summary)
8. [Browser Extensions](#browser-extensions)
9. [Wild West Mode](#wild-west-mode)
10. [Scoring Formula](#scoring-formula)
11. [Key Concepts](#key-concepts)
12. [Contributing](#contributing)
13. [Future Development](#future-development)
14. [Credits](#credits)

---

## What It Does

**Corrections and Affirmations.** Citizens identify misleading headlines and propose factual replacements (corrections), or affirm accurate headlines with supporting evidence (affirmations). Both go through the same jury review process.

**Jury Review.** Randomly selected jurors from the submitter's Assembly rate submissions on accuracy, newsworthiness, and interestingness. Jury size scales from 3 to 13 based on Assembly membership count.

**Cross-Group Consensus.** Corrections that pass in-group review advance to cross-group juries drawn from other Assemblies. What survives both stages achieves Consensus — the highest trust signal in the system.

**Asymmetric Scoring.** Volume has diminishing returns via square root. Quality multiplies everything. Lies bypass the diminishing curve and devastate scores. All weights are community-votable.

**The Cassandra Rule.** If you're rejected repeatedly but refuse to concede because you're right, and are eventually vindicated, you earn a massive additive bonus that scales with impact and persistence.

**Translations.** A vault artifact that strips propaganda, jargon, and euphemisms from language. Approved translations are applied automatically by the browser extension across all articles.

**Assembly Vaults.** Shared knowledge bases per Assembly: Standing Corrections (reusable facts), Arguments (rhetorical tools), Foundational Beliefs (axioms), and Translations (language replacements).

**Disputes.** Intra-group disputes with escalating costs weighted by Trust Score ratios.

**Concessions.** Time-decay recovery for admitting errors. One free per week; additional at 90%.

**AI Agents (AI Agents).** AI agents can register with an accountable human partner who receives all scoring consequences.

---

## System Architecture

Trust Assembly has evolved from a single-file React SPA into a **Next.js 14 application** backed by **Vercel Postgres**. The system consists of three major components:

1. **Web Application** — A Next.js server-rendered app with API routes, deployed on Vercel. Handles all business logic, authentication, jury assignment, vote resolution, and reputation scoring server-side.

2. **Browser Extensions** — Chrome (MV3), Firefox (MV2-compatible), and Safari (MV3) extensions that overlay community-verified corrections, affirmations, and translations on any webpage the user visits.

3. **Legacy SPA** — The original `trust-assembly-v5.jsx` (~4,600 lines) designed to run as a Claude.ai artifact using `window.storage`. This remains in the repository as a reference and for artifact-based usage.

Data flows through two parallel persistence layers:
- **PostgreSQL** (source of truth) — full relational schema with 20+ tables
- **KV Store** (read cache for extensions) — a `kv_store` PostgreSQL table that stores denormalized JSON blobs, synced after every write operation so the browser extension can read corrections without expensive joins

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (API routes), JSX (legacy SPA) |
| Database | PostgreSQL 16+ via @vercel/postgres |
| Authentication | JWT (HS256) via jose, bcryptjs for password hashing |
| Hosting | Vercel |
| Browser Extensions | Vanilla JS, Manifest V3 (Chrome/Safari), V2-compatible (Firefox) |
| Fonts | EB Garamond, IBM Plex Mono, Source Serif 4 |
| Color Palette | Navy (#1B2A4A), Linen (#F0EDE6), Vellum (#FDFBF5), Gold (#B8963E) |

**Dependencies** (production): `react`, `react-dom`, `next`, `@vercel/postgres`, `bcryptjs`, `jose`

---

## Project Structure

```
trust-assembly/
├── src/
│   ├── app/
│   │   ├── api/                    # Next.js API routes (all server-side logic)
│   │   │   ├── admin/              # Admin: approve-pending, wild-west-backfill
│   │   │   ├── audit/              # Audit log queries
│   │   │   ├── auth/               # Register, login, logout, session (me)
│   │   │   ├── concessions/        # Concession proposals and voting
│   │   │   ├── corrections/        # Extension endpoint: corrections by URL
│   │   │   ├── di-requests/        # AI Agent partnership management
│   │   │   ├── disputes/           # Dispute filing and voting
│   │   │   ├── feedback/           # Beta feedback/feature requests
│   │   │   ├── jury/               # Jury assignments and acceptance
│   │   │   ├── kv/                 # Key-value store bridge (legacy sync)
│   │   │   ├── orgs/               # Assembly CRUD, membership, applications
│   │   │   ├── submissions/        # Submission CRUD, voting, resolution
│   │   │   ├── users/              # User profiles, notifications, history
│   │   │   └── vault/              # Vault entries (corrections, arguments, beliefs, translations)
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Landing page
│   ├── lib/
│   │   ├── api-client.js           # Client-side API helper (for extension/SPA)
│   │   ├── api-utils.ts            # Response helpers: ok(), err(), unauthorized()
│   │   ├── auth.ts                 # JWT creation/verification, password hashing, session cookies
│   │   ├── db.ts                   # Re-exports @vercel/postgres sql
│   │   ├── jury-rules.ts           # Jury size scaling, Wild West mode, constants
│   │   └── vote-resolution.ts      # Server-side vote counting, reputation, cross-group promotion
│   ├── middleware.ts               # CORS middleware for browser extension requests
│   └── main.jsx                    # Legacy entry point
├── db/
│   └── schema.sql                  # Full PostgreSQL schema (592 lines)
├── extensions/
│   ├── chrome/                     # Chrome extension (MV3)
│   ├── firefox/                    # Firefox extension
│   └── safari/                     # Safari extension
├── apps/
│   ├── browser-extension/          # Legacy webpack-based extension build
│   └── webapp/                     # Legacy Deno-based webapp (pre-Next.js)
├── headline_transform/             # Python package for headline transformation
├── public/                         # Extension zip downloads
├── trust-assembly-v5.jsx           # Original single-file SPA (~4,600 lines)
├── trust-assembly-crest.png        # Heraldic shield logo
├── future-vision.md                # Public roadmap
├── CONTRIBUTING.md
├── CHANGELOG.md
└── Dockerfile                      # Deno-based container (legacy)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 16+ (or a Vercel Postgres instance)
- A Vercel account (for deployment) or local Postgres for development

### Environment Variables

Create a `.env.local` file:

```env
POSTGRES_URL=postgres://user:password@host:5432/trust_assembly
JWT_SECRET=your-secure-random-secret
```

### Database Setup

Run the schema against your PostgreSQL instance:

```bash
psql $POSTGRES_URL < db/schema.sql
```

### Local Development

```bash
npm install
npm run dev
```

The application will be available at `http://localhost:3000`.

### Deployment

The project is configured for Vercel deployment. Push to `main` and Vercel will build and deploy automatically via the `vercel.json` framework detection.

### Running as a Claude Artifact

The legacy SPA can still be used in Claude.ai:

1. Open Claude.ai and create a new artifact
2. Paste the contents of `trust-assembly-v5.jsx`
3. The app renders with the interactive onboarding tutorial

Note: The artifact version uses `window.storage` (Claude sandbox KV store) and is independent of the server-side system.

---

## API Overview

All API routes live under `src/app/api/` and follow Next.js App Router conventions. Authentication uses HTTP-only JWT cookies for the web app and `Authorization: Bearer <token>` headers for browser extension requests.

### Authentication

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Create account (auto-joins General Public assembly) |
| POST | `/api/auth/login` | Authenticate, returns JWT token |
| POST | `/api/auth/logout` | Clear session cookie |
| GET | `/api/auth/me` | Get current session user |

### Submissions

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/submissions` | List submissions (filterable by orgId, status, submittedBy) |
| POST | `/api/submissions` | File a correction or affirmation (supports multi-assembly) |
| GET | `/api/submissions/[id]` | Get submission detail |
| POST | `/api/submissions/[id]/vote` | Cast a jury vote |

### Assemblies (Organizations)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/orgs` | List all assemblies with member counts |
| POST | `/api/orgs` | Create an assembly (max 12 per user) |
| GET | `/api/orgs/[id]` | Get assembly detail |
| POST | `/api/orgs/[id]/join` | Join or apply to an assembly |
| POST | `/api/orgs/[id]/leave` | Leave an assembly |
| POST | `/api/orgs/[id]/follow` | Follow an assembly |
| GET | `/api/orgs/[id]/members` | List assembly members |
| GET | `/api/orgs/[id]/applications` | List membership applications (founder only) |
| PATCH | `/api/orgs/[id]/applications/[appId]` | Approve/reject application |

### Disputes and Concessions

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/disputes` | List disputes (filterable) |
| POST | `/api/disputes` | File a dispute against a submission |
| GET | `/api/disputes/[id]` | Get dispute detail |
| POST | `/api/disputes/[id]/vote` | Cast a dispute jury vote |
| GET | `/api/concessions` | List concessions |
| POST | `/api/concessions` | Propose a concession |
| POST | `/api/concessions/[id]/vote` | Vote on a concession |

### Vault

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/vault` | List vault entries (type: vault, argument, belief, translation) |
| POST | `/api/vault` | Create a vault entry (supports multi-assembly) |
| GET | `/api/vault/[id]` | Get vault entry detail |

### Users

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/users/[username]` | Get public profile |
| GET | `/api/users/[username]/history` | Review history |
| GET | `/api/users/[username]/ratings` | Ratings received |
| GET | `/api/users/me/notifications` | Pending jury, applications, and submission updates |
| GET | `/api/users/me/assemblies` | Current user's assemblies |

### AI Agent

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/di-requests` | List DI partnership requests |
| POST | `/api/di-requests` | Request DI partnership |
| PATCH | `/api/di-requests/[id]` | Approve/reject DI request |

### Extension and Utility

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/corrections?url=` | Get corrections/affirmations/translations for a URL (privacy-first, stateless) |
| GET | `/api/kv?key=` | Read from KV store (unauthenticated) |
| POST | `/api/kv` | Write to KV store (authenticated) |
| GET | `/api/audit` | Query audit log |
| POST | `/api/feedback` | Submit feedback/feature request |

### Admin

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/admin/approve-pending` | Approve all stuck pending submissions (SQL + KV) |
| POST | `/api/admin/wild-west-backfill` | Auto-approve pending submissions in Wild West mode |

---

## Database Schema Summary

The full schema is in `db/schema.sql` (592 lines, PostgreSQL 16+). All IDs are UUIDs. All timestamps are `timestamptz`.

**Core tables:** `users`, `organizations`, `organization_members`, `submissions`, `jury_assignments`, `jury_votes`, `disputes`, `concessions`

**Vault tables:** `vault_entries`, `arguments`, `beliefs`, `translations`

**Supporting tables:** `submission_evidence`, `submission_inline_edits`, `submission_linked_entries`, `dispute_evidence`, `membership_applications`, `application_sponsors`, `organization_member_history`, `cross_group_results`, `user_ratings`, `user_review_history`, `user_vindications`, `di_requests`, `audit_log`, `feedback`, `kv_store`

**Key enums:** `submission_type` (correction | affirmation), `submission_status` (10 states from pending_jury through dismissed), `dispute_status`, `concession_status`, `vault_status`, `enrollment_mode` (tribal | open | sponsor), `jury_role` (in_group | cross_group | dispute | concession), `translation_type` (clarity | propaganda | euphemism | satirical)

---

## Browser Extensions

Trust Assembly ships browser extensions for Chrome, Firefox, and Safari. They are located in `extensions/` and are also available as pre-built zips in `public/`.

**Features:**
- Overlay corrections and affirmations on any webpage
- Signal-based toolbar icon: red (corrected), green (affirmed), gold (default/mixed)
- Badge count showing number of active corrections on the current page
- Floating window for submission details
- Full submit experience from the extension popup
- State persistence across sessions via `chrome.storage.local`
- Push notifications for jury assignments, application approvals, and submission status updates via background polling
- Multi-vault and multi-assembly support

**Architecture:**
- `content.js` — Injected into every page; queries `/api/corrections?url=` and overlays results
- `popup.js` — Extension popup for login, submission, and settings
- `background.js` — Service worker handling badge updates, notification polling (60s interval), and CORS proxy for content scripts
- `api-client.js` — Shared API client using Bearer token auth

**Privacy:** The `/api/corrections` endpoint is stateless and blind. It does not log the queried URL, the requester's IP, or any browsing activity. URLs are used solely as in-memory filter keys and discarded.

---

## Wild West Mode

When the system has fewer than 100 total users, simplified rules apply:
- Only 1 reviewer per submission (instead of a full jury)
- Deliberate deception findings are disabled
- Self-review and DI-partner review restrictions remain in effect
- Admin can run `/api/admin/wild-west-backfill` to auto-approve stuck submissions

This allows the platform to function during early growth when there aren't enough users to populate full juries.

---

## Scoring Formula

```
Trust Score = √(Points) × Quality / Drag + Cassandra Bonus

Points   = (wins × w_win) + (disputeWins × w_disputeWin) + floor(streak / w_streakInterval)
Quality  = min((avgNews + avgFun) / w_qualityDivisor, w_qualityCap) ^ w_qualityExp
Drag     = 1 + √(reg_losses × w_lossDrag + failed_disputes × w_failedDisputeDrag) + (lies × w_lieDrag)
Cassandra = Σ w_vindicationBase × (news/10 × fun/10) × rejections ^ w_persistenceExp
```

All 11 weights are election-settable. Default values are documented in the legacy SPA and CHANGELOG.

---

## Key Concepts

**Trusted Contributor.** After 10 consecutive approved submissions within an Assembly, a user earns Trusted Contributor status. Their subsequent submissions skip jury review (but remain disputable).

**Jury Pool Multiplier.** Jury pools are 3× the required jury size. Jurors must explicitly accept before they can vote.

**Cross-Group Deception Multiplier.** A deception finding at the cross-group level incurs a 9× penalty on the originating Assembly's reputation.

**Enrollment Modes.** Assemblies can be `tribal` (founder approval required), `open` (anyone can join), or `sponsor` (existing members must vouch).

**KV Store Sync.** Every submission creation and vote resolution syncs a denormalized copy to the KV store so the browser extension can serve corrections without hitting the relational schema.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. Priority areas include security review, adversarial testing, extension development, accessibility, and documentation. Please open an issue before submitting PRs for major changes.

---

## Future Development

See [future-vision.md](future-vision.md) for the complete roadmap including the bounty system, subscriptions, appeal adjudication, AI agents, writer ratings, The Forum (an AI-compatible government), and delegated voting.

---

## Credits

Trust Assembly was designed and built through collaborative conversation between a human creator and Claude by Anthropic.

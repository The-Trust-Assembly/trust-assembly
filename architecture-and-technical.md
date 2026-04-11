# Architecture & Technical Overview

## System Components

Trust Assembly has three major components:

### 1. Web Application
A **Next.js 14** server-rendered app with API routes, deployed on **Vercel**.

- Handles all business logic, authentication, jury assignment, vote resolution, and reputation scoring server-side
- App Router conventions (`src/app/api/`)
- Authentication via HTTP-only JWT cookies (web) and Bearer tokens (extensions)

### 2. Browser Extensions
Chrome (MV3), Firefox (MV2-compatible), and Safari (MV3) extensions.

- Overlay corrections, affirmations, and translations on any webpage
- Signal-based toolbar icon (red/green/gold) with badge count
- Submit corrections from the extension popup
- Background polling for notifications (60s interval)
- Located in `extensions/` with pre-built zips in `public/`

### 3. Legacy SPA
The original `trust-assembly-v5.jsx` (~4,600 lines).

- Designed to run as a Claude.ai artifact using `window.storage`
- Independent of the server-side system
- Retained as reference and for artifact-based usage

---

## Tech Stack

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

**Production dependencies:** `react`, `react-dom`, `next`, `@vercel/postgres`, `bcryptjs`, `jose`

---

## Data Persistence

Two parallel layers:

### PostgreSQL (Source of Truth)
Full relational schema with 20+ tables. All IDs are UUIDs. All timestamps are `timestamptz`.

**Core tables:**
- `users` — accounts, credentials, trust scores
- `organizations` — assemblies with enrollment modes
- `organization_members` — membership with roles
- `submissions` — corrections and affirmations with full status lifecycle
- `jury_assignments` — who is assigned to review what
- `jury_votes` — individual votes with accuracy/news/fun ratings
- `disputes` — challenges to approved submissions
- `concessions` — formal admissions of error

**Vault tables:**
- `vault_entries` — standing corrections
- `arguments` — rhetorical tools
- `beliefs` — foundational axioms
- `translations` — language replacements with type

**Supporting tables:**
- `submission_evidence`, `submission_inline_edits`, `submission_linked_entries`
- `dispute_evidence`
- `membership_applications`, `application_sponsors`
- `organization_member_history`
- `cross_group_results`
- `user_ratings`, `user_review_history`, `user_vindications`
- `di_requests` — AI agent partnerships
- `audit_log`, `feedback`, `kv_store`

**Key enums:**
- `submission_type`: correction | affirmation
- `submission_status`: 10 states (pending_jury through dismissed)
- `enrollment_mode`: tribal | open | sponsor
- `jury_role`: in_group | cross_group | dispute | concession
- `translation_type`: clarity | propaganda | euphemism | satirical

Full schema: `db/schema.sql` (592 lines)

### KV Store (Read Cache)
A `kv_store` PostgreSQL table storing denormalized JSON blobs.

- Synced after every write operation (submission creation, vote resolution)
- Allows the browser extension to read corrections without expensive joins
- Queried via `/api/kv?key=` (unauthenticated)
- Written via `/api/kv` (authenticated)

---

## Project Structure

```
trust-assembly/
├── src/
│   ├── app/
│   │   ├── api/                    # All server-side logic
│   │   │   ├── admin/              # approve-pending, wild-west-backfill
│   │   │   ├── audit/              # Audit log queries
│   │   │   ├── auth/               # Register, login, logout, session
│   │   │   ├── concessions/        # Concession proposals and voting
│   │   │   ├── corrections/        # Extension endpoint: corrections by URL
│   │   │   ├── di-requests/        # AI Agent partnerships
│   │   │   ├── disputes/           # Dispute filing and voting
│   │   │   ├── feedback/           # Beta feedback
│   │   │   ├── jury/               # Jury assignments and acceptance
│   │   │   ├── kv/                 # KV store bridge
│   │   │   ├── orgs/               # Assembly CRUD, membership
│   │   │   ├── submissions/        # Submission CRUD, voting, resolution
│   │   │   ├── users/              # Profiles, notifications, history
│   │   │   └── vault/              # Vault entries
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Landing page
│   ├── lib/
│   │   ├── api-client.js           # Client-side API helper
│   │   ├── api-utils.ts            # Response helpers: ok(), err(), unauthorized()
│   │   ├── auth.ts                 # JWT, password hashing, session cookies
│   │   ├── db.ts                   # Re-exports @vercel/postgres sql
│   │   ├── jury-rules.ts           # Jury sizing, Wild West mode, constants
│   │   └── vote-resolution.ts      # Vote counting, reputation, cross-group promotion
│   ├── middleware.ts               # CORS for browser extension requests
│   └── main.jsx                    # Legacy entry point
├── db/
│   └── schema.sql                  # Full PostgreSQL schema (592 lines)
├── extensions/
│   ├── chrome/                     # Chrome extension (MV3)
│   ├── firefox/                    # Firefox extension
│   └── safari/                     # Safari extension
├── wiki/                           # This wiki
├── trust-assembly-v5.jsx           # Original single-file SPA
├── future-vision.md                # Public roadmap
├── CONTRIBUTING.md
├── CHANGELOG.md
└── Dockerfile                      # Legacy Deno container
```

---

## Key Server-Side Files

| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | JWT creation/verification, password hashing, session cookie management |
| `src/lib/jury-rules.ts` | Jury size scaling logic, Wild West mode detection, system constants |
| `src/lib/vote-resolution.ts` | Vote counting, Trust Score calculation, cross-group promotion logic |
| `src/lib/api-utils.ts` | Standardized response helpers |
| `src/middleware.ts` | CORS headers for browser extension cross-origin requests |

---

## API Authentication

Two authentication modes:

1. **Web app:** HTTP-only JWT cookies set on login, cleared on logout. Session checked via `/api/auth/me`.
2. **Browser extensions:** `Authorization: Bearer <token>` header. Token obtained via `/api/auth/login`.

---

## Extension Architecture

| File | Role |
|------|------|
| `content.js` | Injected into every page. Queries `/api/corrections?url=` and overlays results. |
| `popup.js` | Extension popup for login, submission, and settings. |
| `background.js` | Service worker. Badge updates, notification polling (60s), CORS proxy. |
| `api-client.js` | Shared API client using Bearer token auth. |

State persisted via `chrome.storage.local` across sessions.

---

## Environment Variables

```env
POSTGRES_URL=postgres://user:password@host:5432/trust_assembly
JWT_SECRET=your-secure-random-secret
```

---

## Development

```bash
npm install
npm run dev        # http://localhost:3000
```

Database setup:
```bash
psql $POSTGRES_URL < db/schema.sql
```

Deployment: Push to `main` for automatic Vercel deployment.

# Trust Assembly — Architecture Document

**Version:** Main branch as of March 2026
**Status:** Production (Early Beta, Wild West Mode active)

---

## 1. System Overview

Trust Assembly is a distributed civic deliberation platform that enables community-driven fact-checking of media through structured jury review, cross-group consensus verification, and asymmetric reputation scoring. The system is designed so that honesty is structurally rewarded and deception is structurally devastating.

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER EXTENSIONS                           │
│    Chrome (MV3) · Firefox (MV2) · Safari (MV3)                     │
│    ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌──────────────┐   │
│    │ content  │  │  popup   │  │ background │  │  api-client  │   │
│    │   .js    │  │   .js    │  │    .js     │  │     .js      │   │
│    └────┬─────┘  └────┬─────┘  └─────┬──────┘  └──────────────┘   │
│         │             │              │                              │
└─────────┼─────────────┼──────────────┼──────────────────────────────┘
          │             │              │
          │  Bearer Token Auth         │ Polling (60s)
          │             │              │
┌─────────▼─────────────▼──────────────▼──────────────────────────────┐
│                     NEXT.JS 14 (APP ROUTER)                         │
│                     Deployed on Vercel                               │
│                                                                     │
│  ┌──────────────┐  ┌────────────────────────┐  ┌────────────────┐  │
│  │  middleware   │  │      API Routes        │  │    lib/        │  │
│  │  (CORS)      │  │  /api/auth/*           │  │  auth.ts       │  │
│  │              │  │  /api/submissions/*     │  │  db.ts         │  │
│  │              │  │  /api/orgs/*            │  │  jury-rules.ts │  │
│  │              │  │  /api/disputes/*        │  │  vote-         │  │
│  │              │  │  /api/vault/*           │  │  resolution.ts │  │
│  │              │  │  /api/corrections       │  │  api-utils.ts  │  │
│  │              │  │  /api/users/*           │  │  api-client.js │  │
│  │              │  │  /api/admin/*           │  │                │  │
│  │              │  │  /api/kv               │  │                │  │
│  └──────────────┘  └───────────┬────────────┘  └────────────────┘  │
│                                │                                    │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   VERCEL POSTGRES       │
                    │   (PostgreSQL 16+)      │
                    │                         │
                    │  ┌───────────────────┐  │
                    │  │ Relational Tables │  │
                    │  │ (20+ tables)      │  │
                    │  └───────────────────┘  │
                    │  ┌───────────────────┐  │
                    │  │ kv_store table    │  │
                    │  │ (JSON blobs for   │  │
                    │  │  extension cache) │  │
                    │  └───────────────────┘  │
                    └─────────────────────────┘
```

### 1.2 Data Flow: Submission Lifecycle

```
Citizen submits correction/affirmation
        │
        ▼
  ┌─────────────┐    membership check
  │ POST /api/  │◄── org limit check (12 max)
  │ submissions │    Wild West mode check
  └──────┬──────┘
         │
         ├── INSERT into submissions table
         ├── INSERT evidence rows
         ├── INSERT inline edit rows
         ├── INSERT audit_log entry
         │
         ├── [If trusted contributor: auto-approve, skip jury]
         │
         ├── [If normal mode + enough members]:
         │     ├── Calculate jury size (3-13 based on member count)
         │     ├── Random jury pool selection (3× jury size)
         │     ├── INSERT jury_assignments (pool)
         │     └── Status → pending_review
         │
         ├── [If too few members]: Status → pending_jury
         │
         └── Sync denormalized copy to kv_store
                    │
                    ▼
         Jurors accept assignment
         POST /api/jury/[id]/accept
                    │
                    ▼
         Jurors cast votes
         POST /api/submissions/[id]/vote
                    │
                    ▼
         ┌──────────────────┐
         │ tryResolveSubmission()   │
         │  (vote-resolution.ts)    │
         ├──────────────────────────┤
         │ Check majority reached?  │
         │ ├─ Approved → reputation+│
         │ │  ├─ Graduate vault     │
         │ │  ├─ Resolve inline edits│
         │ │  └─ Promote to cross-  │
         │ │     group review       │
         │ ├─ Rejected → reputation-│
         │ │  └─ Reset streaks      │
         │ ├─ Deception finding?    │
         │ │  └─ Devastating penalty│
         │ └─ Sync KV store        │
         └──────────────────────────┘
                    │
          [If approved + cross-group eligible]
                    │
                    ▼
         Cross-group jury drawn from
         other qualifying assemblies
                    │
                    ▼
         Cross-group votes → Consensus or Consensus Rejected
                    │
                    ▼
         Correction appears in browser extension overlay
```

---

## 2. Authentication and Session Management

### 2.1 Mechanism

Authentication uses **JWT tokens** signed with HS256 via the `jose` library. Passwords are hashed with `bcryptjs` using a cost factor of 12.

Two auth paths exist:
- **Web app:** HTTP-only session cookie (`ta-session`, SameSite=lax, Secure in production, 7-day expiry)
- **Browser extension:** `Authorization: Bearer <token>` header (token returned at login)

The `getCurrentUserFromRequest()` function checks the Bearer header first, then falls back to cookie-based auth.

### 2.2 JWT Payload

```typescript
interface JWTPayload {
  sub: string;      // user UUID
  username: string;  // lowercase username
}
```

Token expiry: 7 days. No refresh token mechanism.

### 2.3 Admin Role

Admin privileges are granted via the `is_admin` column on the `users` table. The `requireAdmin()` helper in `auth.ts` verifies both authentication and admin status. Admin-only endpoints:
- `POST /api/admin/approve-pending` — Bulk-approve pending submissions
- `POST /api/admin/wild-west-backfill` — Backfill pre-existing submissions
- `POST /api/kv` (protected keys only) — Write to `ta-s-v5` (submissions cache)

### 2.4 Audit Log Access Control

The `GET /api/audit` endpoint requires authentication. Non-admin users can only view their own audit entries. Admin users have full access to all entries.

---

## 3. Data Schema

### 3.1 Entity-Relationship Overview

```
users ──────────┬──── organization_members ──── organizations
    │           │           │
    │           │    membership_applications
    │           │    application_sponsors
    │           │    organization_member_history
    │           │
    ├── submissions ─┬── submission_evidence
    │       │        ├── submission_inline_edits
    │       │        ├── submission_linked_entries
    │       │        ├── jury_assignments
    │       │        ├── jury_votes
    │       │        ├── disputes ──── dispute_evidence
    │       │        ├── concessions
    │       │        └── cross_group_results
    │       │
    │       ├── vault_entries
    │       ├── arguments
    │       ├── beliefs
    │       └── translations
    │
    ├── di_requests
    ├── user_ratings
    ├── user_review_history
    ├── user_vindications
    └── feedback

audit_log (cross-cutting)
kv_store  (extension cache)
```

### 3.2 Table Definitions

#### users

The central identity table. Stores authentication credentials, demographics, DI partnership, and denormalized reputation counters.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Auto-generated |
| username | VARCHAR(30) UNIQUE | Lowercase, 3-30 chars |
| display_name | VARCHAR(100) | Public display name |
| real_name | VARCHAR(200) | Optional real name |
| email | VARCHAR(320) | Not unique (DIs may share partner's email) |
| password_hash | TEXT | bcrypt hash |
| salt | TEXT | bcrypt salt |
| gender | VARCHAR(50) | Default 'Undisclosed' |
| age | VARCHAR(20) | Default 'Undisclosed' |
| country | VARCHAR(100) | Optional |
| state | VARCHAR(100) | Optional |
| political_affiliation | VARCHAR(100) | Optional |
| bio | VARCHAR(500) | Optional |
| is_admin | BOOLEAN | Admin role flag (default FALSE) |
| is_di | BOOLEAN | Digital Intelligence flag |
| di_partner_id | UUID FK→users | Human partner for DI accounts |
| di_approved | BOOLEAN | Whether DI partnership is approved |
| total_wins | INTEGER | Denormalized win count |
| total_losses | INTEGER | Denormalized loss count |
| current_streak | INTEGER | Consecutive wins |
| dispute_wins | INTEGER | Successful disputes |
| dispute_losses | INTEGER | Failed disputes |
| deliberate_lies | INTEGER | Deception findings against user |
| last_deception_finding | TIMESTAMPTZ | Most recent lie finding |
| primary_org_id | UUID FK→organizations | Primary assembly |
| created_at | TIMESTAMPTZ | Registration timestamp |
| ip_hash | TEXT | Hashed IP for anti-abuse |

**Indexes:** email, username, di_partner_id (conditional)

#### organizations

Assemblies — the groups through which submissions are reviewed.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Auto-generated |
| name | VARCHAR(200) UNIQUE | Assembly name |
| description | TEXT | Public description |
| charter | TEXT | Assembly charter/rules |
| is_general_public | BOOLEAN | Whether this is the auto-join assembly |
| enrollment_mode | ENUM | tribal, open, or sponsor |
| sponsors_required | INTEGER | Sponsors needed for sponsor mode |
| cross_group_deception_findings | INTEGER | Denormalized cross-group lie count |
| cassandra_wins | INTEGER | Denormalized Cassandra vindication count |
| created_by | UUID FK→users | Founder |
| created_at | TIMESTAMPTZ | Creation timestamp |

#### organization_members

Many-to-many join with per-assembly streak tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Auto-generated |
| org_id | UUID FK→organizations | Assembly |
| user_id | UUID FK→users | Member |
| is_founder | BOOLEAN | Founder flag |
| is_active | BOOLEAN | Active membership |
| joined_at | TIMESTAMPTZ | Join date |
| left_at | TIMESTAMPTZ | Leave date (null if active) |
| assembly_streak | INTEGER | Consecutive wins in this assembly |

**Unique constraint:** (org_id, user_id)

#### submissions

The core content table. Every correction or affirmation is a submission.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Auto-generated |
| submission_type | ENUM | correction or affirmation |
| status | ENUM | 10-state lifecycle (see below) |
| url | TEXT | Article URL being corrected/affirmed |
| original_headline | VARCHAR(500) | The original headline text |
| replacement | VARCHAR(500) | Proposed replacement (null for affirmations) |
| reasoning | TEXT | Submitter's reasoning |
| author | VARCHAR(200) | Article author (optional) |
| submitted_by | UUID FK→users | Submitter |
| org_id | UUID FK→organizations | Target assembly |
| trusted_skip | BOOLEAN | Trusted contributor auto-approve |
| is_di | BOOLEAN | DI submission flag |
| di_partner_id | UUID FK→users | DI partner reference |
| jury_seed | INTEGER | Randomization seed |
| jury_seats | INTEGER | Expected in-group jury size |
| internal_jury_size | INTEGER | Actual in-group jurors |
| cross_group_jury_size | INTEGER | Cross-group jury size |
| cross_group_seed | INTEGER | Cross-group randomization seed |
| deliberate_lie_finding | BOOLEAN | Deception finding |
| survival_count | INTEGER | Vault survival counter |
| created_at | TIMESTAMPTZ | Submission timestamp |
| resolved_at | TIMESTAMPTZ | Resolution timestamp |

**Submission Status Lifecycle:**

```
pending_jury ──► pending_review ──► approved ──► cross_review ──► consensus
     │                │                                              │
     │                └──► rejected                    consensus_rejected
     │
     └──► di_pending (DI pre-approval)

Any approved/consensus submission can be:
  ──► disputed ──► upheld (submission invalidated)
                └─► dismissed (submission stands)
```

#### submission_evidence

Evidence links attached to submissions.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Auto-generated |
| submission_id | UUID FK→submissions | Parent submission |
| url | TEXT | Evidence URL |
| explanation | TEXT | Why this evidence matters |
| sort_order | INTEGER | Display order |

#### submission_inline_edits

Body-level text corrections within a submission.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Auto-generated |
| submission_id | UUID FK→submissions | Parent submission |
| original_text | TEXT | Original article text |
| replacement_text | TEXT | Proposed replacement |
| reasoning | TEXT | Justification |
| approved | BOOLEAN | Jury verdict on this edit |
| sort_order | INTEGER | Display order |

#### jury_assignments

Tracks which users are assigned to review which submissions, disputes, or concessions.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Auto-generated |
| submission_id | UUID FK→submissions | Target submission (nullable) |
| dispute_id | UUID FK→disputes | Target dispute (nullable) |
| concession_id | UUID FK→concessions | Target concession (nullable) |
| user_id | UUID FK→users | Assigned juror |
| role | ENUM | in_group, cross_group, dispute, concession |
| in_pool | BOOLEAN | Whether in candidate pool |
| accepted | BOOLEAN | Whether juror accepted |
| accepted_at | TIMESTAMPTZ | Acceptance timestamp |
| assigned_at | TIMESTAMPTZ | Assignment timestamp |

**Unique constraint:** (submission_id, dispute_id, concession_id, user_id, role)

#### jury_votes

Individual votes cast by jurors.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Auto-generated |
| submission_id | UUID FK→submissions | (nullable) |
| dispute_id | UUID FK→disputes | (nullable) |
| concession_id | UUID FK→concessions | (nullable) |
| user_id | UUID FK→users | Voter |
| role | ENUM | in_group, cross_group, dispute, concession |
| approve | BOOLEAN | Approve or reject |
| note | TEXT | Optional voter note |
| deliberate_lie | BOOLEAN | Flag for deception finding |
| newsworthy | SMALLINT (1-10) | Newsworthiness rating |
| interesting | SMALLINT (1-10) | Interestingness rating |
| voted_at | TIMESTAMPTZ | Vote timestamp |

#### disputes

Challenges against approved submissions.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Auto-generated |
| submission_id | UUID FK→submissions | Disputed submission |
| org_id | UUID FK→organizations | Assembly context |
| disputed_by | UUID FK→users | Challenger |
| original_submitter | UUID FK→users | Original author |
| reasoning | TEXT | Dispute reasoning |
| status | ENUM | pending_review, upheld, dismissed |
| deliberate_lie_finding | BOOLEAN | Deception finding |
| created_at | TIMESTAMPTZ | Filing timestamp |
| resolved_at | TIMESTAMPTZ | Resolution timestamp |

#### concessions

Proposals to concede on a rejected submission for partial reputation recovery.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Auto-generated |
| org_id | UUID FK→organizations | Assembly context |
| submission_id | UUID FK→submissions | Target submission |
| proposed_by | UUID FK→users | Proposer |
| reasoning | TEXT | Concession reasoning |
| status | ENUM | pending_review, approved, rejected |
| recovery | NUMERIC(3,2) | Recovery fraction (0.00–1.00) |
| recovery_at_resolution | NUMERIC(3,2) | Recovery at time of resolution |
| created_at | TIMESTAMPTZ | Proposal timestamp |
| rejected_at | TIMESTAMPTZ | Rejection timestamp |

#### Vault Tables

Four parallel vault tables share a similar structure:

**vault_entries** — Standing Corrections (reusable verified facts)
**arguments** — Fundamental arguments for reuse
**beliefs** — Core axioms / starting premises
**translations** — Plain-language replacements with `translation_type` ENUM (clarity, propaganda, euphemism, satirical) and `original_text`/`translated_text` fields

Common columns: id, org_id, submission_id, submitted_by, content/assertion+evidence, status (pending/approved/rejected), survival_count, approved_at, created_at.

#### Supporting Tables

| Table | Purpose |
|-------|---------|
| submission_linked_entries | Links vault entries to submissions for survival voting |
| dispute_evidence | Evidence attached to disputes |
| membership_applications | Pending assembly membership requests |
| application_sponsors | Sponsor endorsements for applications |
| organization_member_history | Join/leave/removal audit trail |
| cross_group_results | Per-org outcomes of cross-group review |
| user_ratings | Newsworthy/interesting ratings received |
| user_review_history | Submission outcome history per user |
| user_vindications | Cassandra mechanic tracking |
| di_requests | DI partnership request management |
| audit_log | System-wide audit trail (action, entity, metadata JSONB) |
| feedback | Beta feature requests |
| kv_store | Key-value cache for browser extension |

---

## 4. API Route Architecture

### 4.1 Request/Response Patterns

All routes use consistent response helpers from `api-utils.ts`:
- `ok(data, status?)` — Success response
- `err(message, status?)` — Error response
- `unauthorized(message?)` — 401
- `forbidden(message?)` — 403
- `notFound(message?)` — 404

### 4.2 CORS Middleware

The middleware (`src/middleware.ts`) applies to all `/api/*` routes and handles browser extension cross-origin requests:

- **Extension origins** (chrome-extension://, moz-extension://, safari-web-extension://): Allowed for all methods
- **GET/OPTIONS from any origin**: Allowed (read-only public data)
- **POST/PUT/DELETE from non-extension origins**: Blocked at the CORS level (still require valid JWT)

### 4.3 Query Building Pattern

Most list endpoints use dynamic SQL query construction with parameterized values:

```typescript
let query = `SELECT ... FROM table WHERE 1=1`;
const params: unknown[] = [];
let paramIndex = 1;

if (filter) {
  query += ` AND column = $${paramIndex++}`;
  params.push(filter);
}

query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
params.push(limit, offset);

const result = await sql.query(query, params);
```

### 4.4 Vote Resolution Pipeline

`vote-resolution.ts` is the most complex module. The entire resolution pipeline runs inside a `BEGIN/COMMIT/ROLLBACK` transaction to prevent partial state corruption. KV cache sync runs outside the transaction (it's a denormalized cache, not authoritative). After each vote:

1. **Count votes** by role (in_group or cross_group)
2. **Check majority** — `floor(jurySize/2) + 1`
3. **Determine outcome** — approved/rejected/consensus/consensus_rejected
4. **Deception finding** — Secret majority of jurors flagged deliberate lie (disabled in Wild West mode)
5. **Update submission status**
6. **Resolve inline edits** — Currently based on overall vote (TODO: per-edit votes)
7. **Resolve vault survival** — Linked entries survive if submission approved
8. **Graduate vault entries** — Pending entries linked to approved submissions become approved
9. **Update submitter reputation** — Wins increment streak; losses reset streak; lies add linear drag
10. **Cross-group promotion** — Approved submissions promote to cross-group jury from other qualifying assemblies (5+ members)
11. **Record cross-group results** — Track outcomes and deception penalties on the originating assembly
12. **Audit log** — Record full resolution metadata
13. **KV sync** — Update denormalized cache for browser extension

### 4.5 KV Store Architecture

The KV store bridges the legacy SPA's `window.storage` pattern to the relational database. It stores large JSON blobs under versioned keys (currently `v5`):

| Key | Contents |
|-----|----------|
| `ta-s-v5` | All submissions (denormalized with jury, votes, audit trails) |
| `ta-u-v5` | User accounts (profiles, scores, notifications) |
| `ta-o-v5` | Assemblies (members, reputation) |
| `ta-trans-v5` | Translations |

The browser extension's `/api/corrections?url=` endpoint reads from these KV blobs rather than performing relational joins, providing fast read access for the content script overlay. All user-generated text fields are HTML-entity-encoded on output via `escapeHtml()` from `lib/sanitize.ts` to prevent stored XSS in the extension's content scripts.

**Write Protection:** The `POST /api/kv` endpoint requires authentication for all writes. Protected keys (currently `ta-s-v5` — the submissions cache) require admin privileges. Other keys remain writable by authenticated users for legacy frontend compatibility. Protected key writes are audit-logged.

---

## 5. Extension Architecture

### 5.1 Components

| File | Context | Role |
|------|---------|------|
| content.js | Injected into every page | Queries corrections API, overlays results, modifies headlines |
| popup.js | Extension popup | Login, submission, settings, notifications |
| background.js | Service worker | Badge updates, notification polling, CORS proxy, settings relay |
| api-client.js | Shared | API communication with Bearer token auth |

### 5.2 Content Script Flow

1. Page loads → content script reads current URL
2. Queries `GET /api/corrections?url=<normalized_url>`
3. If corrections/affirmations found: modifies headline elements, shows floating badge
4. Sends `TA_COUNT` message to background for badge update
5. Icon changes: red (corrected), green (affirmed), gold (mixed/neutral)

### 5.3 Notification System

Background service worker polls `GET /api/users/me/notifications` every 60 seconds when authenticated. Notifications cover jury assignments, membership applications, and submission status updates. Seen notifications are tracked in `chrome.storage.local` to avoid duplicates.

---

## 6. Constants and Configuration

### 6.1 Jury Rules (jury-rules.ts)

| Constant | Value | Purpose |
|----------|-------|---------|
| TRUSTED_STREAK | 10 | Consecutive wins for trusted contributor status |
| CROSS_GROUP_DECEPTION_MULT | 9 | Penalty multiplier for cross-group deception |
| JURY_POOL_MULTIPLIER | 3 | Pool size = jury size × 3 |
| WILD_WEST_THRESHOLD | 100 | User count below which Wild West mode activates |

### 6.2 Jury Size Scaling

| Member Count | Jury Size | Super Jury Size |
|-------------|-----------|-----------------|
| < 21 | 3 | 7 |
| 21–50 | 5 | 9 |
| 51–100 | 7 | 11 |
| 101–999 | 9 | 13 |
| 1,000–9,999 | 11 | 15 |
| 10,000+ | 13 | 17 |

### 6.3 Auth Configuration

| Setting | Value |
|---------|-------|
| Cookie name | ta-session |
| Token expiry | 7 days |
| Cookie maxAge | 7 days |
| bcrypt cost factor | 12 |
| JWT algorithm | HS256 |
| Max assemblies per user | 12 |
| Max submissions per query | 100 |

---

## 7. Deployment Configuration

**Vercel:** `vercel.json` specifies `nextjs` framework. Environment variables `POSTGRES_URL` and `JWT_SECRET` must be set in Vercel project settings.

**Docker (legacy):** The Dockerfile builds a Deno-based setup with the `headline_transform` Python package. This predates the Next.js migration and is not currently used for the main deployment.

**Domain:** trustassembly.org (SSL configured via Vercel)

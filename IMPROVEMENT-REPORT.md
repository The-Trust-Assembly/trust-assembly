# Trust Assembly — Architectural Improvement Report

## Reliability and Security Assessment

**Date:** March 2026
**Scope:** Main branch codebase — Next.js API routes, database schema, browser extensions, authentication, and data integrity
**Classification:** Internal — Maximum Security and Integrity Posture

---

## Executive Summary

Trust Assembly has made a successful transition from a single-file SPA to a server-side Next.js application with PostgreSQL backing. The core deliberation logic — jury assignment, vote resolution, reputation scoring, and cross-group promotion — is implemented server-side, which is the right architectural choice for a trust-critical system. However, several areas require attention before the system can responsibly scale beyond its current Wild West mode. The most pressing concerns are: unprotected admin endpoints, the KV store as a single point of data consistency failure, the absence of rate limiting, and the need for database-level transaction safety around multi-step vote resolution.

This report organizes findings by severity: Critical, High, Medium, and Improvement opportunities.

---

## CRITICAL — Must Fix Before Scaling

### C1. Admin Endpoints Have No Authentication or Authorization

**Location:** `src/app/api/admin/approve-pending/route.ts`, `src/app/api/admin/wild-west-backfill/route.ts`

**Finding:** Both admin endpoints (`POST /api/admin/approve-pending` and `POST /api/admin/wild-west-backfill`) have no authentication check whatsoever. Any unauthenticated HTTP client can call these endpoints and bulk-approve every pending submission in both the SQL database and the KV store.

**Impact:** An attacker can approve arbitrary submissions — including deliberately false corrections — giving them consensus status and causing them to appear in the browser extension overlay for every user visiting the affected URLs. This completely undermines the integrity of the jury system.

**Recommendation:**
1. Add `getCurrentUser()` or `getCurrentUserFromRequest()` authentication to both routes
2. Implement an admin role in the database (e.g., `is_admin BOOLEAN` on `users` or a separate `admin_users` table)
3. Check admin authorization after authentication
4. Add audit logging that records which admin triggered the action
5. Consider requiring two-factor confirmation for bulk operations

### C2. KV Store Write Endpoint Lacks Authorization Scoping

**Location:** `src/app/api/kv/route.ts`

**Finding:** The `POST /api/kv` endpoint requires authentication (good) but allows any authenticated user to write to any KV key, including `ta-s-v5` (all submissions), `ta-u-v5` (all users), and `ta-o-v5` (all organizations). A single compromised or malicious account can overwrite the entire submissions cache, forging verdicts, deception findings, and audit trails that the browser extension serves to every user.

**Impact:** Complete compromise of the browser extension's data layer. An attacker could make the extension display fabricated corrections on any news site.

**Recommendation:**
1. Remove the generic `POST /api/kv` endpoint entirely, or restrict it to specific keys that require write access
2. All KV writes should happen exclusively through the server-side vote resolution pipeline and submission creation logic — never through a user-facing endpoint
3. If a generic KV endpoint must exist for development, gate it behind admin auth and disable it in production
4. Add integrity checks: the KV store should be a derived view that can be reconstructed from the relational tables, never the source of truth for anything the extension displays

### C3. No Database Transactions Around Vote Resolution

**Location:** `src/lib/vote-resolution.ts`

**Finding:** The `tryResolveSubmission()` function performs 10+ sequential SQL operations (update submission status, update user reputation, update assembly streaks, graduate vault entries, insert audit logs, sync KV store) as independent queries. If any query fails mid-sequence — due to a timeout, connection drop, or constraint violation — the system enters an inconsistent state where some effects have been applied and others have not. For example, a submission could be marked "approved" but the submitter's reputation never incremented, or vault entries graduated but the KV store not synced.

**Impact:** Data inconsistency that silently corrupts reputation scores and submission states. Difficult to detect and harder to repair.

**Recommendation:**
1. Wrap the entire resolution pipeline in a database transaction using `sql.query('BEGIN')` / `sql.query('COMMIT')` / `sql.query('ROLLBACK')`
2. Move the KV sync outside the transaction (it's already marked "non-critical" in the catch block) but add a reconciliation mechanism
3. Implement an idempotent reconciliation job that can re-derive KV state from relational tables
4. Similarly wrap the submission creation flow in `POST /api/submissions`, which also performs 5+ sequential inserts

---

## HIGH — Significant Risk

### H1. No Rate Limiting on Any Endpoint

**Finding:** No rate limiting exists anywhere in the application — not on authentication, not on submission creation, not on voting, not on the public corrections endpoint.

**Impact:**
- Credential stuffing attacks against `/api/auth/login`
- Spam submission attacks to overwhelm jury queues
- Vote flooding (though duplicate vote checks exist)
- Denial of service against the corrections endpoint, which performs multiple KV reads per request

**Recommendation:**
1. Add rate limiting via Vercel Edge Middleware or a library like `@upstash/ratelimit`
2. Priority tiers: aggressive limiting on auth endpoints (5 attempts/minute), moderate on submission creation (10/hour), generous on reads
3. Consider IP-based and user-based rate limiting in combination

### H2. JWT Tokens Never Expire in Practice

**Location:** `src/lib/auth.ts`

**Finding:** JWT tokens are issued with a 365-day expiry and there is no revocation mechanism. The session cookie also has a 365-day `maxAge`. There is no token rotation, no refresh token pattern, and no way to invalidate a stolen token.

**Impact:** A stolen JWT (via XSS, network interception, or device theft) provides persistent access for up to a year. There is no way to force logout a compromised account.

**Recommendation:**
1. Reduce token lifetime to 24 hours or 7 days
2. Implement refresh tokens stored server-side with revocation capability
3. Add a `token_version` column to the `users` table; increment it on password change or forced logout; reject tokens with stale versions
4. On login, return the short-lived token; the extension can use the refresh flow to maintain sessions

### H3. Password Reset and Account Recovery Missing

**Finding:** There is no password reset flow, no email verification, and no account recovery mechanism.

**Impact:** Locked-out users have no recourse. The `email` field is not verified, so anyone can register with someone else's email address. This also means a DI could register with a fabricated partner email.

**Recommendation:**
1. Add email verification on registration (even a basic confirmation link)
2. Implement password reset via email token
3. Add email uniqueness enforcement for non-DI accounts (currently the UNIQUE constraint is explicitly dropped in the registration route)

### H4. CORS Policy Allows Any Origin for GET Requests

**Location:** `src/middleware.ts`

**Finding:** The CORS middleware allows any origin for GET and OPTIONS requests. While this is intentional for the browser extension (content scripts need to fetch from arbitrary news sites), it means any website can issue authenticated GET requests to all API endpoints if the user has a session cookie.

**Impact:** A malicious website visited by a logged-in user could silently read their notifications, assembly memberships, submission history, and profile data.

**Recommendation:**
1. For cookie-authenticated requests, restrict CORS to the application's own origin and extension origins
2. Bearer token requests (from extensions) can remain unrestricted since tokens aren't sent automatically
3. Consider adding `SameSite=strict` on the session cookie (currently `lax`), or switching entirely to Bearer auth for the web app

### H5. Dynamic SQL Query Construction

**Location:** `src/app/api/submissions/route.ts`, `src/app/api/vault/route.ts`, `src/app/api/disputes/route.ts`, `src/app/api/concessions/route.ts`

**Finding:** Multiple endpoints build SQL queries by string concatenation with parameterized values. While the parameters themselves are safely parameterized (using `$1`, `$2`, etc.), the query structure is assembled dynamically. More concerning, `vote-resolution.ts` uses `sql.query()` with template-literal table names:

```typescript
await sql.query(
  `UPDATE ${table} SET survival_count = survival_count + 1 WHERE id = $1`,
  [entry.entry_id],
);
```

The `table` variable comes from `getVaultTable()` which maps from a controlled enum, so this is currently safe. But the pattern is fragile — a future code change adding a user-influenced path to `getVaultTable()` would create a SQL injection.

**Recommendation:**
1. Add an explicit allowlist check at the `sql.query()` call site, not just in the helper function
2. Consider using a query builder (Drizzle, Kysely, or Prisma) to eliminate dynamic SQL entirely
3. Add a code review rule: all dynamic table references must be validated against a hardcoded set immediately before use

---

## MEDIUM — Should Address

### M1. KV Store Is a Scalability and Consistency Bottleneck

**Finding:** The entire submissions dataset is stored as a single JSON blob under `ta-s-v5`. Every submission creation reads the full blob, parses it, adds one entry, serializes the whole thing back, and writes it. As submission volume grows, this single row will become increasingly large and every write will require reading and rewriting the entire dataset.

**Impact:**
- Performance degradation: O(n) reads and writes for every submission
- Write contention: concurrent submissions will race on the same row (last write wins)
- Extension latency: the corrections endpoint parses the entire blob to filter by URL

**Recommendation:**
1. Replace the monolithic KV blob with per-URL entries (e.g., key = normalized URL, value = array of corrections for that URL)
2. Or better: have the corrections endpoint query the relational `submissions` table directly with appropriate indexes, eliminating the KV cache entirely
3. If the KV pattern must be retained for legacy compatibility, add a background reconciliation job that rebuilds it from the relational tables on a schedule

### M2. No Input Sanitization on User-Generated Content

**Finding:** User-submitted content (headlines, reasoning, evidence URLs, display names, etc.) passes through to the database and back to the API without sanitization. While SQL injection is prevented by parameterized queries, there is no protection against stored XSS — malicious JavaScript in a headline or reasoning field will be served to the browser extension and rendered in the content script overlay.

**Impact:** Stored XSS via the browser extension. An attacker submits a correction with a headline containing `<script>` tags or event handlers; once approved, the extension injects this into every page the URL matches.

**Recommendation:**
1. Sanitize all user-generated text on output (HTML-encode before serving to the extension)
2. Add Content Security Policy headers
3. The extension's content script should use `textContent` rather than `innerHTML` when rendering corrections
4. Server-side: validate that URLs are well-formed, headlines don't contain HTML tags, etc.

### M3. Submitter Anonymity Leak in KV Store

**Finding:** The `/api/submissions` endpoint correctly anonymizes submitter identity for non-resolved submissions. However, the KV store blob (`ta-s-v5`) contains the raw `submittedBy` user ID and an `anonMap` that maps real user IDs to anonymous labels. This blob is readable via `GET /api/kv?key=ta-s-v5` without authentication, exposing the identity of every submitter — including those under active review.

**Impact:** Violates the design principle that submitter identity should be hidden during review to prevent bias.

**Recommendation:**
1. Remove `submittedBy` from the KV blob for non-resolved submissions
2. Or require authentication to read KV keys that contain submission data
3. The `anonMap` should not be stored in the KV blob at all — it's a server-side concern

### M4. Registration Drops Email Uniqueness Constraint at Runtime

**Location:** `src/app/api/auth/register/route.ts`

**Finding:** The registration handler runs `ensureEmailNotUnique()` on first call, which drops the UNIQUE constraint on the email column. This is a runtime schema migration that happens on every cold start. While the intent (allowing DIs to share emails) is documented, dropping constraints at runtime is fragile and hides the actual schema state from anyone reading `schema.sql`.

**Recommendation:**
1. Remove the email UNIQUE constraint from `schema.sql` directly (it already isn't there — the constraint was legacy)
2. Remove the runtime `ensureEmailNotUnique()` function
3. If email uniqueness is desired for non-DI accounts, enforce it in application logic (which the registration route already does)

### M5. No Pagination Safety on Audit Log

**Location:** `src/app/api/audit/route.ts`

**Finding:** The audit log endpoint should be restricted. Currently it exposes the full system audit trail. In a trust-critical system, the audit log often contains information about who submitted what, who voted how, and admin actions — all of which could be exploited for gaming.

**Recommendation:**
1. Require authentication for audit log access
2. Consider role-based access: regular users see their own actions; admins see everything
3. Filter out sensitive metadata (voter identities on active submissions)

### M6. No CSRF Protection

**Finding:** The application uses SameSite=lax cookies but has no CSRF token mechanism. Combined with the permissive CORS policy for GET requests, this creates a risk surface for state-changing requests if any endpoint accepts GET for writes (currently they don't, but the pattern should be guarded against).

**Recommendation:**
1. Add CSRF tokens for all state-changing operations from the web app
2. Or switch entirely to Bearer token auth (no cookies), which is inherently CSRF-immune

---

## IMPROVEMENT OPPORTUNITIES

### I1. Add Database Indexes for Common Query Patterns

The schema has good basic indexes but is missing some for common API query patterns:

- `submissions(org_id, status)` — composite for the common "list pending submissions in my assembly" query
- `jury_assignments(user_id, accepted)` — for the notifications endpoint's "pending jury for me" query
- `jury_votes(submission_id, role)` — for vote counting in resolution
- `vault_entries(submission_id)` — for vault graduation queries

### I2. Implement Structured Logging

**Finding:** Error handling uses `console.error` throughout. There is no structured logging, no request tracing, and no way to correlate a failed KV sync with the submission that triggered it.

**Recommendation:** Add a structured logger (Pino or similar) with request IDs, and pipe to a log aggregation service.

### I3. Add Health Check and Monitoring

**Finding:** No health check endpoint exists. If the database connection fails or the KV store becomes corrupted, there is no automated detection.

**Recommendation:** Add `GET /api/health` that checks database connectivity and KV store integrity. Wire it to an uptime monitor.

### I4. Implement Database Migrations

**Finding:** Schema changes are managed by editing `schema.sql` directly. There is no migration framework, no version tracking, and no rollback capability. The registration route's runtime constraint drop is a symptom of this gap.

**Recommendation:** Adopt a migration framework (Prisma Migrate, Drizzle Kit, or raw SQL migrations with a tracking table). Every schema change should be a versioned, reversible migration.

### I5. Add Automated Testing

**Finding:** No test files exist in the repository. The vote resolution logic, jury assignment, reputation scoring, and cross-group promotion are complex enough to warrant comprehensive test coverage.

**Recommendation:**
1. Unit tests for `vote-resolution.ts`, `jury-rules.ts`, and auth logic
2. Integration tests for the submission lifecycle (create → jury assign → vote → resolve → cross-group)
3. Adversarial tests: can a user vote on their own submission? Can a DI partner vote? Can a non-member vote?

### I6. Separate Read and Write Paths for the Extension

**Finding:** The extension currently reads from the KV store (fast but eventually consistent) while the web app writes to PostgreSQL (authoritative but requires joins for reads). This dual-write pattern is error-prone.

**Recommendation:** Long-term, replace the KV blob with a dedicated read-optimized view or materialized query against the relational tables. This eliminates the sync problem entirely and makes PostgreSQL the single source of truth for all consumers.

### I7. Add Request Validation Middleware

**Finding:** Each route handler manually validates request body fields with inline checks. There is no shared validation layer.

**Recommendation:** Adopt Zod or a similar schema validation library. Define request schemas per route and validate in middleware, providing consistent error messages and reducing per-route boilerplate.

### I8. Harden the Browser Extension Against Prompt Injection

**Finding:** The extension renders corrections and translations from the server into arbitrary web pages. If a malicious correction passes the jury (or is injected via the KV store vulnerability in C2), its content is rendered in the DOM of every matching page.

**Recommendation:**
1. Extension content script must treat all API data as untrusted
2. Never use `innerHTML` — always `textContent` or DOM API methods
3. Implement a Content Security Policy for the extension
4. Consider signing correction data server-side so the extension can verify integrity

### I9. Formalize the Notification Query

**Location:** `src/app/api/users/me/notifications/route.ts`

**Finding:** The notifications endpoint references `jv.assignment_id` in a join condition, but `jury_votes` has no `assignment_id` column in the schema. This query will fail silently or return incorrect results.

**Recommendation:** Fix the join to use the correct column relationship between `jury_votes` and `jury_assignments` (likely matching on `submission_id + user_id + role`).

### I10. Document and Enforce the "No Deletion" Policy

**Finding:** The system's preferences specify that files should never be deleted without authorization — this aligns with the trust model where citizens must be confident that records are immutable. However, the database schema uses `ON DELETE CASCADE` on several foreign keys, meaning deleting an organization cascades to members, submissions, disputes, and all their children.

**Recommendation:**
1. Remove `ON DELETE CASCADE` and replace with `ON DELETE RESTRICT` on all foreign keys
2. Implement soft deletion (an `is_deleted` flag) rather than hard deletion
3. Add database triggers or application-level guards that prevent deletion of any entity with downstream references
4. This is especially critical for submissions, votes, and audit log entries — these are the evidentiary record of the system

---

## Summary of Priorities

| ID | Finding | Severity | Effort |
|----|---------|----------|--------|
| C1 | Admin endpoints unauthenticated | Critical | Low |
| C2 | KV store write endpoint unscoped | Critical | Low |
| C3 | No transactions in vote resolution | Critical | Medium |
| H1 | No rate limiting | High | Medium |
| H2 | JWT never expires / no revocation | High | Medium |
| H3 | No password reset or email verification | High | Medium |
| H4 | CORS allows any origin for GET | High | Low |
| H5 | Dynamic SQL patterns | High | Medium |
| M1 | KV blob scalability bottleneck | Medium | High |
| M2 | No XSS sanitization | Medium | Medium |
| M3 | Submitter anonymity leak in KV | Medium | Low |
| M4 | Runtime schema migration | Medium | Low |
| M5 | Audit log unrestricted | Medium | Low |
| M6 | No CSRF protection | Medium | Low |

**Recommended immediate action:** Fix C1 (admin auth) and C2 (KV write scoping). These are low-effort, critical-severity fixes that close the most dangerous attack vectors. Then address C3 (transactions) and H1 (rate limiting) in the next development cycle.

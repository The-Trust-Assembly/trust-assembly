# Trust Assembly

**A civic deliberation platform where truth is the only thing that survives adversarial review.**

Trust Assembly is a structured reputation system for media correction, fact verification, and collective truth-seeking. Citizens submit corrections or affirmations to content anywhere on the internet — news articles, YouTube videos, tweets, podcasts, product listings, Reddit posts, and more. Juries of fellow citizens review them. Cross-group verification prevents filter bubbles. The scoring formula rewards honesty and makes deception structurally irrational.

> *Truth Will Out.*

---

## What It Does

- **Adaptive Submit Form** — Paste any URL and the form detects the platform (article, video, social post, podcast, product listing) and morphs to show the right fields. 13 platform types across 5 templates.
- **URL Import Service** — Server-side extraction of article metadata (headline, author, description, thumbnail) via Open Graph tags, JSON-LD structured data, and platform APIs. Powers auto-fill and content preview cards.
- **Content Embeds** — YouTube, Spotify, Vimeo, and TikTok content embeds directly in submission preview, feed cards, record pages, and review interface. Non-embeddable content shows OG preview cards (thumbnail + title + domain, like Slack/Discord).
- **Corrections & Affirmations** — Citizens identify misleading headlines and propose factual replacements (corrections), or affirm accurate headlines with supporting evidence (affirmations). Both go through the same jury review process.
- **Jury Review** — Randomly selected jurors evaluate submissions on accuracy, provide reasoning for their vote, and rate newsworthiness. Jury size scales from 3 to 13 based on Assembly membership.
- **Cross-Group Consensus** — Corrections that pass in-group review advance to cross-group juries drawn from *other* Assemblies. What survives both achieves Consensus — the highest trust signal.
- **Asymmetric Scoring** — `Trust Score = 100 + √(Points) × Quality / Drag + Cassandra Bonus + Badge Bonus`. Volume has diminishing returns. Quality multiplies everything. Lies bypass the diminishing curve and devastate scores.
- **The Cassandra Rule** — If you're rejected repeatedly but refuse to concede because you're right, and are eventually vindicated, you earn a massive additive bonus that scales with impact and persistence.
- **Assembly Vaults** — Shared knowledge bases per Assembly: Standing Corrections (reusable facts), Arguments (rhetorical tools), Foundational Beliefs (axioms), and Translations (language replacements). Each vault artifact gains reputation every time it survives review.
- **Translations** — Strip propaganda, jargon, and euphemisms. "Enhanced interrogation techniques" → "Torture". Approved translations are applied automatically by the browser extension across all articles.
- **Disputes & Concessions** — Challenge jury verdicts with additional evidence (disputes) or accept rejection and recover reputation (concessions). Time-decay recovery: one free per week at 100%.
- **AI Agents** — AI systems (Claude, ChatGPT, Gemini, etc.) can register with an accountable human partner who receives all scoring consequences. AI Agents submit, humans review. All AI submissions are permanently flagged.
- **Claude Code Skill** — Pre-built skill file for Claude Code that enables AI-assisted correction submission with evidence gathering. See `CLAUDE-SKILL-trust-assembly.md`.
- **Email Integration** — Welcome emails, password reset with 1-hour token expiry, and notification emails via Resend.
- **Browser Extensions** — Chrome (MV3), Firefox (MV2), Safari (MV3). See corrections on every site you visit.

## Architecture

Trust Assembly is a **Next.js 14 App Router** application deployed on Vercel with a Neon PostgreSQL database. The frontend is a modular React SPA organized under `spa/` with 25+ screen components, 8+ shared components, and 15+ utility files. Server-side API routes handle authentication, data persistence, vote resolution, content import, email, and the browser extension API.

### Key Files

| File / Directory | Purpose |
|------------------|---------|
| `spa/App.jsx` | Main SPA shell — routing, auth state, navigation, theme |
| `spa/pages/` | 25+ screen components (Feed, Submit, Review, Vault, Assemblies, Profile, Landing, AI Agents, etc.) |
| `spa/components/` | 8+ shared components (UI primitives, ContentEmbed, RecordDetailView, RegistrationModal, etc.) |
| `spa/lib/` | Client utilities (platforms, embedResolver, queries, scoring, validation, jury logic, storage) |
| `spa/lib/platforms.js` | Platform detection: 13 platform types across 5 templates (article, shortform, video, audio, product) |
| `spa/lib/embedResolver.js` | URL → iframe embed (YouTube, Spotify, Vimeo, TikTok) or OG preview card |
| `src/app/api/` | Server-side API routes (30+ endpoint families) |
| `src/app/api/import/` | URL import service: metadata extraction via regex (OG tags, JSON-LD, HTML fallbacks) |
| `src/lib/auth.ts` | JWT authentication, bcrypt hashing, session management |
| `src/lib/db.ts` | Database connection, `withTransaction()` helper for real transactions |
| `src/lib/email.ts` | Email sending via Resend (welcome, password reset) |
| `src/lib/vote-resolution.ts` | Vote counting, reputation updates, cross-group promotion, dispute resolution |
| `src/lib/jury-assignment.ts` | Dispute jury pool drawing with conflict-of-interest exclusions |
| `src/lib/submission-states.ts` | Centralized state machine for submission status transitions |
| `src/lib/validation.ts` | Input validation (`MAX_LENGTHS`, `validateFields()`, `isValidUUID()`) |
| `src/lib/sanitize.ts` | XSS output sanitization for browser extension content |
| `site-registry.json` | Curated extraction configs for 100+ domains with URL normalization and meta tag hints |
| `db/schema.sql` | PostgreSQL schema (25+ tables) |
| `db/migrations/` | 14 versioned SQL migration files |
| `tests/uat/` | 8 UAT test scripts |
| `CLAUDE-SKILL-trust-assembly.md` | Claude Code skill for AI-assisted submissions |
| `DESIGN-SPEC-*.md` | Design specifications for adaptive submit, import architecture, onboarding flow |
| `public/robots.txt` | SEO: allows all crawlers including GPTBot, ClaudeBot, PerplexityBot |
| `src/app/feed.xml/` | RSS feed of approved corrections |
| `extensions/chrome/` | Chrome extension (MV3) — popup, content script, background worker |
| `extensions/firefox/` | Firefox extension (MV2) |
| `extensions/safari/` | Safari extension (MV3) |

### Technology

- **Next.js 14** (App Router) on **Vercel**
- **Neon PostgreSQL** (PostgreSQL 16+) via `@vercel/postgres`
- **React 18** (functional components with hooks)
- **TanStack Query** (v5) for server state management and cache invalidation
- **Resend** for transactional email (welcome, password reset)
- **Cheerio** for lightweight HTML parsing (import service)
- **JWT** (HS256 via `jose`, 7-day expiry, HTTP-only cookies + Bearer tokens)
- **bcryptjs** (cost factor 12 for password hashing)
- **Design system**: Georgia/Newsreader (serif), IBM Plex Mono (mono), warm off-white (#FAF8F0), gold (#B8963E)
- **Browser extensions**: Chrome (MV3), Firefox (MV2), Safari (MV3)

### API Endpoints

```
Authentication
POST   /api/auth/register             Create citizen account
POST   /api/auth/login                Authenticate (sets cookie, returns token)
POST   /api/auth/logout               Clear session
GET    /api/auth/me                   Current user from session
POST   /api/auth/forgot-password      Request password reset email
POST   /api/auth/reset-password       Reset password with token

Submissions
POST   /api/submissions               Create correction or affirmation (multi-assembly)
GET    /api/submissions/:id           Get submission with votes and audit trail
POST   /api/submissions/:id/vote      Cast jury vote
POST   /api/submissions/:id/di-review AI Agent partner pre-approval
POST   /api/submissions/:id/recuse    Jury member recusal
GET    /api/submissions/di-queue      AI Agent partner review queue

Import
POST   /api/import                    Extract metadata from URL (OG, JSON-LD, platform APIs)
GET    /api/import?url=               Debug/test import endpoint

Stories
GET    /api/stories                   List story proposals
POST   /api/stories                   Create story proposal
POST   /api/stories/:id/vote          Vote on story

Disputes & Concessions
POST   /api/disputes                  File dispute (with jury assignment + grace period)
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

SEO
GET    /feed.xml                      RSS feed of approved corrections
GET    /sitemap.xml                   Dynamic sitemap

Transparency & Admin
GET    /api/audit                     Audit log
GET    /api/health                    System health check
POST   /api/feedback                  Submit beta feedback
POST   /api/admin/process-records     Advance stuck records + backfill dispute juries
POST   /api/admin/repair-data         Repair historical data inconsistencies
POST   /api/admin/recompute-stats     Recalculate all reputation stats from source
POST   /api/admin/test-import         Run import service UAT tests (platform detection + extraction)
GET    /api/admin/diag-transactions   Transaction integrity diagnostic
GET    /api/admin/reconciliation-report  System health snapshot
```

### Privacy

The `GET /api/corrections?url=` endpoint is **stateless and blind by design**. It does not log, store, or record the queried URL, the requester's IP, or any request metadata. The URL is used solely as an in-memory filter key, then discarded. No analytics. No telemetry.

### Security

- Admin endpoints require `is_admin` role check via `requireAdmin()`
- All multi-step write operations use `sql.connect()` or `withTransaction()` for real database transactions
- State machine validation prevents invalid submission status transitions
- Rate limiting on auth endpoints via in-memory sliding-window
- All user-generated text served to browser extensions is HTML-entity-encoded on output
- Input validation via centralized `MAX_LENGTHS` and `validateFields()` across 50+ route handlers
- CORS policy restricts credentialed requests to same-origin and extension origins
- Content Security Policy with frame-src allowlist for embed domains (YouTube, Vimeo, Spotify, TikTok)
- JWT expiry set to 7 days with HTTP-only cookies
- Password reset tokens: 1-hour expiry, single-use, cryptographically random
- Structured error logging to `client_errors` table with deduplication
- Audit logging on admin actions with user attribution
- Comprehensive diagnostic suite audits transaction integrity, vote forensics, reputation consistency, and data health

### Navigation

Simplified navigation focused on workflow:

**Primary:** Home · Submit · Review (count badge) · Assemblies

**More:** Consensus · Stories · Ledger · Vaults

**Account:** Citizen Profile · Extension · Learn · AI Agents · Rules · About

### Onboarding Flow

1. **Landing page** — Hero with before/after correction slides showing what the platform does. "How it works" education. URL input challenge: "Your turn — paste a URL."
2. **Adaptive submit form** — URL-driven form morphing. Platform detection. Anonymous users can fill the entire form; authentication only required to submit.
3. **Registration gate** — Modal overlays the form (preserving work). Minimal fields. "Create Account and Submit" does both in one action.
4. **Post-submission confirmation** — What happens next (jury assignment, deliberation, verdict). Trust progress bar. Next action buttons.
5. **Contextual education** — Collapsible "What is this?" helpers in each form section, shown on first visit, dismissed permanently.

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 16+ (or Neon/Vercel Postgres)
- Environment variables: `POSTGRES_URL`, `JWT_SECRET`, `RESEND_API_KEY` (optional, for email)

### Local Development

```bash
npm install
npm run dev
```

### Database Setup

```bash
psql $POSTGRES_URL < db/schema.sql
# Then run migrations in order:
psql $POSTGRES_URL < db/migrations/001_kv_elimination.sql
# ... through 014_thumbnail_url.sql
```

### Browser Extension

1. Download the extension for your browser from the Extensions page
2. Load as unpacked (Chrome/Edge/Brave) or temporary add-on (Firefox)
3. The extension overlays corrections on articles as you browse

### Claude Code Skill

To use Claude Code for AI-assisted submissions:

1. Copy `CLAUDE-SKILL-trust-assembly.md` to `~/.claude/skills/`
2. Tell Claude: "I want to submit corrections to Trust Assembly"
3. Claude will guide you through registration, content analysis, evidence gathering, and submission

## Contributing

Trust Assembly is in early beta. We welcome contributions in security review, adversarial testing, extension development, API integration, documentation, and accessibility. Please open an issue before submitting PRs for major changes.

## Credits

Trust Assembly was designed and built through collaborative conversation between a human creator and Claude by Anthropic.

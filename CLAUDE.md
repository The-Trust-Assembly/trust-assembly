# Trust Assembly — Claude Code Instructions

This is the Trust Assembly codebase (trustassembly.org), a civic deliberation platform where citizens submit corrections to misleading content and fellow citizens verify them through jury review.

## Key Reference Documents

- **CLAUDE-SKILL-trust-assembly.md** — Complete API contracts, submission guidelines, vault artifact types, scoring rules, and account setup instructions. Read this before making API calls or submitting corrections.
- **README.md** — Architecture overview, technology stack, all API endpoints, security model.
- **DESIGN-SPEC-adaptive-submit.md** — Adaptive submit form specification (5 templates, 12+ platform types).
- **DESIGN-SPEC-import-architecture.md** — URL import service architecture.
- **DESIGN-SPEC-onboarding-flow.md** — Onboarding flow design.

## Codebase Structure

- `spa/` — React SPA (pages, components, lib utilities)
- `src/app/api/` — Next.js API routes (30+ endpoint families)
- `src/lib/` — Server utilities (auth, db, email, validation, vote resolution)
- `extensions/` — Browser extensions (Chrome MV3, Firefox MV2, Safari MV3)
- `db/schema.sql` — PostgreSQL schema
- `db/migrations/` — 15 versioned migration files
- `site-registry.json` — 100+ domain extraction recipes for the import service

## Important Rules

- Do NOT delete existing files without explicit authorization
- Wrap all email sends in try/catch — email failures must never block primary operations
- All multi-step database writes must use `withTransaction()` or `sql.connect()` for real transactions
- The submit form must work for anonymous users — authentication only gates the final submit action
- Browser extensions must be synced across Chrome, Firefox, and Safari after changes
- After changing extension code, rebuild the zip files in `public/`
- Terminology: use "AI Agent" not "Digital Intelligence" or "DI" in user-facing text (internal code names like `isDI`, `di_partner_id` are fine)

## Database

- PostgreSQL on Neon (via `@vercel/postgres`)
- New columns require a migration file in `db/migrations/` AND the user must run it in Neon
- Never add a column to a SELECT before confirming the migration has been run

## Design Language

- Warm off-white background (#FAF8F0 / var(--bg))
- Gold accents (#B8963E / var(--gold))
- Georgia/Newsreader for headings, IBM Plex Mono for labels
- No emojis in UI unless the user explicitly requests them

# Changelog

## v5.0.0 (March 2026)

### New Features
- **Affirmations** — New submission type for confirming accurate headlines with evidence. Toggle between Correction (red) and Affirmation (green) on the submit form
- **Author Capture** — Author name field on submissions for future writer accountability ratings
- **Translations Vault** — New vault type for stripping propaganda, jargon, and euphemisms. Categories: Clarity, Anti-Propaganda, Euphemism, Satirical. Auto-graduates to approved when linked submission passes. Displayed in review screen alongside other vault entries
- **Visual Score Breakdown** — Interactive formula visualization on Citizen profile with friendly header ("It's just math for try your best to do the right thing") and color-coded variable legend
- **Vision Tab** — Public-facing roadmap rendered in-app with revenue model, AI agents, The Forum, and larger political vision
- **Tutorial Overhaul** — Correction/Affirmation toggle demo, translation flow walkthrough with "Take Back Your Language" messaging, vault entries labeled as New or Preexisting
- **SubHeadline Component** — Unified headline display handles corrections (strikethrough + replacement), affirmations (green checkmark), and author attribution
- **Browser Extensions** — Chrome (MV3), Firefox (MV2), and Safari (MV3) extensions with inline translation annotations, floating badge, and side panel

### Scoring Overhaul
- **New formula**: `Trust Score = √(Points) × Quality / Drag + Cassandra Bonus`
- Replaced 0-100 Assembly Index with unbounded Trust Score
- Volume under √ prevents safe farming
- Quality capped at 1.6 and raised to ^1.5 prevents rating inflation
- Losses under √ provide diminishing drag; lies bypass √ (linear, devastating)
- Cassandra bonus is additive — a single historic vindication can top the leaderboard
- All 11 weights stored in election-settable `W` object
- Dispute wins earn +2 points (not old 3× multiplier)

### Concession Fix
- Rate-limited: 1 free concession per week, additional at 90%
- Prevents concession loop exploit (was 100% recovery breaking asymmetry)
- `getWeeklyConcessionCount()` tracks rolling 7-day window

### Visual Updates
- **Lighthouse logo** — replaced heraldic sword crest with lighthouse shield (three beacons, gold on navy)
- Extension icons updated to match

### Bug Fixes
- DI checkbox now properly clears gender and partner fields when unchecked
- Gender dropdown properly clears DI state when changed away from "Digital Intelligence"

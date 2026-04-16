# Trust Assembly Agent

An AI-powered fact-checking pipeline that discovers articles on topics you care about, analyzes them for factual accuracy, and files corrections or affirmations through the Trust Assembly civic deliberation platform.

> *Truth Will Out.*

---

## Overview

The Trust Assembly Agent automates the most labor-intensive part of civic fact-checking: finding articles that warrant scrutiny, reading them carefully, cross-referencing claims, and drafting well-sourced corrections or affirmations. The human stays in control — the agent discovers and drafts, the human reviews and approves.

Each user can create up to 12 agent instances across three types:

| Type | Purpose | Discovery Method |
|------|---------|-----------------|
| **Sentinel** | Broad internet scanning on a thesis | Google Custom Search (or Claude web_search fallback) |
| **Phantom** | Substack feed monitoring | RSS feed polling |
| **Ward** | Reputation defense for people/orgs | Entity mention monitoring (coming soon) |

All agents share the same analysis and synthesis pipeline — they differ only in how they discover articles.

---

## Architecture

```
User enters thesis / feed URL / entity list
          |
          v
  +------------------+
  | Keyword Generation|  (Sonnet — generates 7-15 search phrases)
  +------------------+
          |
          v
  +------------------+
  |    Discovery     |  Google CSE / Claude web_search / RSS feed / entity scan
  +------------------+
          |
          v
  +------------------+
  | Relevance Filter |  (Haiku — scores 0-10, keeps >= 5)
  +------------------+   Only on Google path; Claude web_search self-filters
          |
          v
  +------------------+
  |   Fetch & Parse  |  (cheerio — extracts headline + body text)
  +------------------+
          |
          v
  +------------------+
  |    Analyze       |  (Sonnet — per-article fact-check, no web_search)
  +------------------+
          |
          v
  +------------------+
  |   Synthesize     |  (Sonnet — cross-article reasoning, vault entries)
  +------------------+
          |
          v
  +------------------+
  |  Human Review    |  (approve/reject each submission + vault entry)
  +------------------+
          |
          v
  +------------------+
  | Submit to TA     |  (files via existing /api/submissions flow)
  +------------------+
```

### Cost per run (approximate)

| Stage | Model | Typical cost |
|-------|-------|-------------|
| Keyword generation | Sonnet | ~$0.001 |
| Google search | n/a | Free (100 queries/day) |
| Relevance filter | Haiku | ~$0.001-0.003 |
| Article analysis (x5) | Sonnet | ~$0.02-0.05 |
| Synthesis | Sonnet | ~$0.005-0.01 |
| **Total (5 articles)** | | **~$0.03-0.07** |

When using the Claude web_search fallback (no Google credentials), search costs are higher (~$0.05-0.15) because Claude's web_search tool incurs token costs for each search round.

---

## Agent Types

### Sentinel

The general-purpose fact-checker. Enter a thesis (what you believe is important to correct or affirm), edit the generated keywords, choose a search scope, and let the agent find and analyze articles.

**Flow:**
1. Enter thesis in the dashboard
2. Click "Generate Keywords" — Sonnet produces 7-15 search phrases
3. Edit keyword chips (add, remove, reorder)
4. Choose scope (Top article, Top 3, Top 10, First 5 pages, As many as possible, Last 30 days)
5. Click "Search with N Keywords" — pipeline runs end-to-end
6. Review results when status reaches "ready"

**Config fields:** Name, Domain Focus, Reasoning Instructions, Monthly Spend Limit

### Phantom

Monitors a specific Substack feed. Automatically discovers new posts and analyzes them for factual accuracy. Named after the author it watches (e.g., "greenwald.substack.com" becomes "Greenwald Phantom").

**Flow:**
1. Create a Phantom agent with a Substack URL
2. Name auto-derives from the URL hostname
3. Dashboard shows recent posts from the feed
4. Select posts to analyze (or enable auto-scan for all new posts)
5. Pipeline runs fetch + analyze + synthesize on selected posts
6. Review results

**Config fields:** Substack Feed URL, Scan Frequency (manual/daily), Auto-Scan toggle

### Ward

Monitors the web for mentions of specific entities (people, organizations, brands) and flags both errors (for correction) and accurate positive coverage (for affirmation). Best for defending a reputation.

**Config fields:** Monitored Entities list, Name, Domain Focus

*Ward discovery is planned for Stage E.*

---

## API Endpoints

### Agent Instances (CRUD)

```
GET    /api/agent/instances          List user's agent instances
POST   /api/agent/instances          Create new instance
GET    /api/agent/instances/[id]     Fetch one instance
PATCH  /api/agent/instances/[id]     Update instance settings
DELETE /api/agent/instances/[id]     Delete (requires { confirm: true })
```

**POST body (create):**
```json
{
  "name": "Alpha Sentinel",
  "type": "sentinel",
  "domain": "Legal & Policy",
  "color": "#B8963E",
  "reasoningInstructions": "Focus on court rulings and legal precedent...",
  "monthlySpendLimit": 10.00,
  "config": {}
}
```

For Phantom agents, include `config.substackUrl`:
```json
{
  "type": "phantom",
  "config": { "substackUrl": "https://greenwald.substack.com" }
}
```
Name auto-derives from the URL if not provided.

**Constraints:**
- Max 12 instances per user
- Name: 1-120 characters
- Type: `sentinel` | `phantom` | `ward` (immutable after creation)
- Reasoning instructions: max 4000 characters
- Status lifecycle: `setup` → `idle` → `active` → `paused`

### Keywords

```
POST   /api/agent/keywords           Generate search keywords from thesis
```

**Request:**
```json
{
  "thesis": "Many articles conflate the court's ruling with a factual finding...",
  "context": { "who": "...", "what": "...", "when": "..." }
}
```

**Response:**
```json
{
  "keywords": ["court ruling First Amendment", "factual finding vs legal ruling", ...],
  "usage": { "inputTokens": 450, "outputTokens": 180 },
  "estimatedCost": 0.004
}
```

### Runs

```
POST   /api/agent/run                Create a new run (queued)
GET    /api/agent/runs               List recent runs
GET    /api/agent/run/[id]           Fetch run with batch data
POST   /api/agent/process/[id]       Execute pipeline (fire-and-forget)
POST   /api/agent/run/[id]/submit    Submit approved items to Trust Assembly
```

**POST /api/agent/run body:**
```json
{
  "thesis": "...",
  "scope": "top10",
  "keywords": ["keyword one", "keyword two"]
}
```

Keywords are stored in the `context` JSONB column. If not provided, the pipeline generates them automatically from the thesis.

**Run status lifecycle:**
```
queued → searching → filtering → fetching → analyzing → synthesizing → ready
                                                                        ↓
                                                              submitting → completed
```

Failed runs land in `failed` status with `error_message` set.

### Phantom Feed

```
POST   /api/agent/feed/[id]         Fetch and parse Substack RSS feed
POST   /api/agent/feed/[id]/scan    Analyze selected posts from the feed
```

---

## Pipeline Modules

All pipeline code lives in `src/lib/agent/`:

| Module | Purpose | Model |
|--------|---------|-------|
| `search.ts` | Article discovery (Google CSE or Claude web_search fallback) + keyword generation | Sonnet |
| `google-search.ts` | Google Custom Search JSON API wrapper | n/a |
| `relevance-filter.ts` | Haiku relevance scoring (Google path only) | Haiku |
| `fetch.ts` | HTML fetch + cheerio extraction (headline + body text) | n/a |
| `analyze.ts` | Per-article fact-check analysis | Sonnet |
| `synthesize.ts` | Cross-article reasoning, vault entry consolidation | Sonnet |
| `substack-feed.ts` | RSS feed parsing for Phantom agents | n/a |
| `claude-client.ts` | Lazy-initialized Anthropic SDK, model pricing, cost estimation | — |
| `json-extract.ts` | Robust JSON extraction from LLM responses | — |
| `types.ts` | Shared TypeScript interfaces | — |

### Output format (AgentBatch)

The pipeline produces an `AgentBatch` stored as JSONB in `agent_runs.batch`:

```typescript
interface AgentBatch {
  topic: string;
  submissions: SubmissionForReview[];  // Per-article verdicts
  vaultEntries: VaultEntryForReview[]; // Reusable knowledge
  narrative: string;                   // 2-3 sentence summary
  candidates?: ArticleCandidate[];     // Raw search results
  errors?: Array<{ url, error }>;      // Fetch/analyze errors
  skipped?: number;                    // Count of 'skip' verdicts
}
```

Each submission contains an `ArticleAnalysis`:
```typescript
interface ArticleAnalysis {
  verdict: "correction" | "affirmation" | "skip";
  originalHeadline: string;
  replacement?: string;          // Only for corrections
  reasoning: string;
  evidence: Array<{ description, url? }>;
  confidence: "high" | "medium" | "low";
  bodyAnalysis?: string;
  inlineEdits?: InlineEdit[];
  vaultEntries?: VaultSuggestion[];
}
```

---

## Database Schema

### agent_instances

Stores agent configurations. One row per agent. Type-specific config in JSONB.

```sql
CREATE TABLE agent_instances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id),
  name                  TEXT NOT NULL,
  type                  VARCHAR(16) NOT NULL,  -- sentinel | phantom | ward
  domain                TEXT,
  color                 VARCHAR(16),
  reputation            INTEGER DEFAULT 0,
  runs_completed        INTEGER DEFAULT 0,
  status                VARCHAR(16) DEFAULT 'setup',
  reasoning_instructions TEXT,
  monthly_spend_limit   NUMERIC(10, 2),
  config                JSONB,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### agent_runs

Stores pipeline executions. Links to agent_instances via nullable FK.

```sql
CREATE TABLE agent_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),
  agent_instance_id   UUID REFERENCES agent_instances(id) ON DELETE SET NULL,
  thesis              TEXT NOT NULL,
  scope               VARCHAR(32) NOT NULL,
  context             JSONB,        -- { who, what, when, where, why, keywords }
  status              VARCHAR(32) DEFAULT 'queued',
  stage_message       TEXT,
  progress_pct        INTEGER DEFAULT 0,
  articles_found      INTEGER DEFAULT 0,
  articles_fetched    INTEGER DEFAULT 0,
  articles_analyzed   INTEGER DEFAULT 0,
  batch               JSONB,        -- Full AgentBatch output
  input_tokens        INTEGER DEFAULT 0,
  output_tokens       INTEGER DEFAULT 0,
  estimated_cost_usd  NUMERIC(10, 4) DEFAULT 0,
  error_message       TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  completed_at        TIMESTAMPTZ
);
```

---

## UI Components

All agent UI lives in `spa/components/agent/` and `spa/pages/AgentPage.jsx`:

| Component | Purpose |
|-----------|---------|
| `AgentPage.jsx` | Top-level container: tab management, routing between dashboard/settings/review |
| `AgentTabBar.jsx` | Navy tab bar: One-Time + instance tabs + "+" button |
| `AgentIcon.jsx` | Circular icon with type-based image, border color, status dot |
| `AgentNewForm.jsx` | Type picker (Sentinel/Phantom/Ward) + creation form |
| `SentinelDashboard.jsx` | Thesis → keywords → search → live progress → recent runs |
| `PhantomDashboard.jsx` | Feed posts list → select → analyze → recent runs |
| `AgentSettings.jsx` | Per-agent settings editor with danger-zone delete |
| `AgentReviewPanel.jsx` | Review and approve/reject submissions + vault entries |

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude API access for all LLM calls |
| `GOOGLE_SEARCH_API_KEY` | No | Google Custom Search API key. Without it, Sentinel falls back to Claude web_search. |
| `GOOGLE_CX` | No | Google Programmable Search Engine ID. Required alongside the API key. |

### Setting up Google Custom Search (optional)

1. Go to https://programmablesearchengine.google.com — create a search engine, set "Search the entire web" to ON, copy the **Search Engine ID** (this is `GOOGLE_CX`)
2. Go to https://console.cloud.google.com — create a project, enable "Custom Search API", create an API key (this is `GOOGLE_SEARCH_API_KEY`)
3. Set both in Vercel environment variables
4. Free tier: 100 queries/day. Paid: $5 per 1,000 queries.

---

## Design Language

The agent UI follows the Trust Assembly design system:

- **Background:** Warm off-white `#FAF8F0` (`var(--bg)`)
- **Cards:** White `#FFFFFF` (`var(--card-bg)`)
- **Text:** Dark navy `#1a1a2e` (`var(--text)`)
- **Gold accent:** `#B8963E` (`var(--gold)`)
- **Tab bar:** Dark navy background with gold accent stripe on active tab
- **Headings:** Georgia / Newsreader (`var(--serif)`)
- **Labels & code:** IBM Plex Mono (`var(--mono)`)

**Agent type colors:**
- Sentinel: Gold `#B8963E` (`var(--gold)`)
- Phantom: Brown `#8B5E3C`
- Ward: Purple `#6B4C9A` (`var(--ward)`)

**Icons:** `/public/icons/agent-sentinel.png`, `agent-phantom.png`, `agent-ward.png`

---

## Development Stages

| Stage | Status | Description |
|-------|--------|-------------|
| A | Shipped | Foundation: icons, design tokens, migrations, stub routes |
| B | Shipped | AgentPage redesign: tab bar, Sentinel dashboard, settings, CRUD |
| C | Shipped | Pipeline refactor: Google CSE, Haiku filter, Sonnet keywords |
| D | In progress | Phantom agent: Substack RSS feed monitoring |
| E | Planned | Ward agent: entity mention monitoring |
| F | Planned | One-time flow: unauthenticated single fact-check by email |
| G | Planned | Lift admin gate: open to any registered AI Agent account |

---

## Security

- All agent endpoints require admin authentication via `requireAdmin()`
- Agent instances are owner-scoped (user can only see/edit their own)
- Deletion requires explicit `{ confirm: true }` in the request body
- API keys are read at runtime, not import time (build never crashes on missing env vars)
- No user PII is sent to external APIs (Google receives only search keywords, not user identity)
- All LLM calls use the Anthropic SDK — no data is sent to third parties beyond Anthropic and Google
- Monthly spend limits are enforced per-agent to prevent runaway costs

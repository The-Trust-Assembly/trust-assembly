# Trust Assembly Agent — UX & Requirements Specification

**Version:** 0.3  
**Date:** April 12, 2026  
**Status:** Working Draft

---

## 1. System Overview

The Trust Assembly Agent is a desktop/web application that enables users to submit factual corrections and affirmations to the Trust Assembly — a distributed editor for the entire internet. Users can operate at three levels of commitment: one-time usage (no full account), dedicated AI agents (registered accounts), and automated monitoring.

### Core Principles
- **High trust, maximum security and integrity** — never cut corners on data integrity
- **No file deletion without explicit user authorization** — citizen trust is paramount
- **Balance security with the need to ship** — get the system live so it can be tested

---

## 2. Agent Types

### 2.1 Sentinel 🗡️
**Icon:** Golden centurion with sword raised (Golden_centurion_with_sword_raised.png)  
**Purpose:** Broad internet scanning for fact-checking  
**Workflow:** User enters a thesis → AI generates editable search keywords → Google Search → Haiku filters for relevance → Sonnet analyzes matches → User reviews and submits  
**One-Time Mode:** Single fact-check run on any topic. No ongoing monitoring, no reputation building. Must re-run manually if new articles appear.  
**Full Mode:** Continuous operation, builds domain reputation, tracks topics over time.

### 2.2 Phantom 👻
**Icon:** Hooded figure with scroll (Phantom.png)  
**Purpose:** Automated Substack feed monitoring  
**Naming Convention:** Must be "[Author/Publication] Phantom" — auto-derived from the Substack URL (e.g., `greenwald.substack.com` → "Greenwald Phantom"). Name field is read-only.  
**Workflow:** Monitors feed → auto-scans new posts → flags eligible submissions → user reviews  
**One-Time Mode:** User pastes specific article URLs for batch analysis. No feed subscription. Only processes provided links.  
**Full Mode:** Real-time feed monitoring, automatic scanning on publish, configurable frequency (real-time, hourly, daily digest).

### 2.3 Ward 🛡️
**Icon:** Knight with shield and cross (Ward.png)  
**Purpose:** Reputation defense — monitors mentions of protected entities  
**Workflow:** Monitors web for entity mentions → sorts findings into two queues (Corrections and Affirmations) → user reviews and decides whether to create submissions  
**One-Time Mode:** Temporary monitoring for a configurable window (24 hours, 3 days, or 7 days). Monitoring stops after the window. Limited scan depth vs. full Ward.  
**Full Mode:** 24/7 monitoring, builds coverage history, catches inaccuracies as they appear.

### 2.4 One-Time Agent ⚖️
**Icon:** Scales of Justice with laurel wreath (Scales_of_Justice.png)  
**Purpose:** Entry point for users without full accounts  
**Not a separate agent type** — it's a lightweight wrapper around Sentinel, Phantom, or Ward that requires only email registration.

---

## 3. User States & Conditional UX

### 3.1 State: No Account, No Agents (New User)
**Tab bar:** One-Time Agent tab (scales icon) + "+" tab only  
**Subtitle text:** "No account yet? Register at [trustassembly.org](https://trustassembly.org) for a full account, or try a one-time fact-check below."  
**Page content:**
- Welcome screen with three one-time agent mode cards (One-Time Sentinel, One-Time Ward, One-Time Phantom)
- Each card shows: what it does, what you get (benefits), limitations, and upgrade path to a full agent
- "Get Started" button → email registration → email confirmation → mode-specific configuration → workspace
- Link to trustassembly.org for full account registration (must be a live, clickable link)

### 3.2 State: Has Account, No AI Agents
**Tab bar:** One-Time Agent tab (scales icon) + "+" tab  
**Subtitle text:** "You're logged in but have no AI agents configured. You can still fact-check, correct, and affirm — no AI agent required. Or set up your first agent with the + tab."  
**Page content:**
- Same one-time mode selection, but email registration step is skipped (already authenticated)
- Emphasis on the fact that the work can be done without a dedicated agent
- Prominent path to set up a full agent via the "+" tab

### 3.3 State: Has Account, Has Agents
**Tab bar:** One-Time Agent tab + agent tabs + "+" tab (if under 12 agents)  
**Subtitle text:** "Quick fact-check — no agent needed. Or switch to one of your agents above."  
**Page content:** Full one-time agent experience, plus agent tabs for switching to dedicated agents

### 3.4 Maximum Agents
Users can have a maximum of **12 assemblies** they belong to and multiple agents. The "+" tab disappears when the agent limit is reached.

---

## 4. Icon System

### Agent Icons (Circular)
- **Sentinel:** Golden centurion with raised sword — circular crop, colored border matching agent's domain color
- **Phantom:** Hooded figure with scroll — circular crop, brown border (#8B5E3C)
- **Ward:** Knight with shield — circular crop, purple border (#6B4C9A)
- **One-Time:** Scales of justice — circular crop, gold border (#B8963E)
- **New Agent (+):** Dashed circle with "+" symbol, muted color
- Active agents show a green status dot (bottom-right)

### Assembly Icons (Square)
- 4px border-radius square with 2-letter initials
- Color-coded by category:
  - **Open:** Indigo background (#E8EAF6), indigo text (#3949AB)
  - **Regional:** Warm orange background (#FFF3E0), orange text (#E65100)
  - **Professional:** Teal background (#E0F2F1), teal text (#00695C)

### Application Icon
- Scales of Justice image used in the header (48×48, 8px border-radius)

---

## 5. Agent Tab Bar

### Layout
- Navy background (#1B2A4A), rounded top corners
- Gold divider lines (35% opacity) between each tab
- No horizontal scrollbar — design must accommodate up to 12+ tabs without overflow

### Active Tab
- **Lifts out** of the bar with linen (#F0EDE6) background
- `marginTop: 4px` to create visual lift effect
- Gold accent stripe (3px) along the top edge
- Subtle box shadow underneath
- Dark text (navy for name, muted for subtitle)
- Shows: agent icon, name, type + domain, reputation score

### Inactive Tabs
- Icon only (collapsed), reduced opacity (0.5)
- On hover: opacity increases to 0.9, subtle background brightens
- Hover tooltip shows: agent name, type, domain, reputation
- Click switches to that agent's workspace

### "+" Tab (New Agent)
- Dashed circle icon with "+"
- Clicking routes to Settings screen (setup mode)

### One-Time Tab
- Always first tab
- Scales of justice icon with gold border
- Subtitle: "Quick fact-check"

---

## 6. Pipeline Architecture & Cost Model

### Model Tiering Strategy
| Stage | Model | Approximate Cost | Purpose |
|-------|-------|-----------------|---------|
| 1. Keyword Generation | Sonnet 4.6 | ~$0.001 | Generate search keywords from thesis |
| 2. Google Search | Google Custom Search API | ~$0.005/query | Fetch search result snippets |
| 3. Relevance Filtering | Haiku 4.5 | ~$0.01 | YES/NO relevance check per result |
| 4. Full Article Analysis | Sonnet 4.6 | ~$0.07 | Build case, identify errors, evidence |
| 5. Synthesis | Sonnet 4.6 | ~$0.02 | Cross-article narrative, vault entries |

**Estimated total per Sentinel run: ~$0.10–0.15**

### Keyword Preview/Edit Step
After the user enters their thesis, Sonnet generates 7–15 keyword phrases. These render as editable chips:
- User can remove keywords (click ✕)
- User can add keywords (text input + Enter)
- Cost estimate updates dynamically based on keyword count
- "Search with N Keywords" button initiates the pipeline

### Pipeline Progress
Each stage shows:
- Stage name and description
- Which model is processing (Haiku/Sonnet/Network)
- Approximate cost for that stage
- Running count of results (e.g., "7 keywords · 28 results · 5 relevant")

### Prompt Caching Strategy
- System prompt + agent reasoning instructions are cached (prefix-based)
- 5-minute cache for burst operations (multiple calls in a pipeline run)
- 1-hour cache for Ward/Phantom periodic scans
- Cache lives on Anthropic's GPU infrastructure
- Content must be at the start of the prompt and match exactly

### Batch API Usage
- Wards and Phantoms use Batch API for non-urgent scans (50% discount)
- Overnight batch processing for Ward monitoring cycles
- Hourly/daily Phantom scans are batch-eligible

---

## 7. Assembly Multi-Select

### Trigger Field
- Clickable field that opens a dropdown panel
- Selected assemblies shown as removable chips with square assembly icons
- Caret rotates on open/close
- Gold border + glow when open

### Dropdown Panel
- Search filter (appears when >4 assemblies)
- Grouped by category (Open, Regional, Professional) with uppercase mono labels
- Each row: custom checkbox + square assembly icon + name + member count
- Checked rows have subtle gold highlight
- Footer: "Select all / Deselect all" + "Done" button

### Summary Line
- Below the trigger field when assemblies are selected
- Shows: "N assemblies selected" + "N,NNN total jurors"

---

## 8. Settings Screen

### Trust Assembly Account
- Agent username + password (registered through the Assembly)
- Authentication status indicator (green dot + "Authenticated as [username]")
- "Disconnect" option

### Agent Type Selection
- Three clickable cards in a row: Sentinel, Phantom, Ward
- Each shows: icon, title, tagline, description
- Gold border + checkmark when selected
- Domain Focus text field below

### Type-Specific Configuration

**Phantom:**
- Substack Feed URL input
- Auto-derived Phantom Name (read-only)
- Scan frequency (real-time, hourly, daily)
- Auto-scan toggle

**Ward:**
- Monitored Entities textarea (comma/newline separated)

### Reasoning Instructions
- Large textarea for persistent prompt
- Prepended to every fact-check run
- Placeholder text adapts based on agent type
- Character count (max 4,000)
- Status indicator: "✓ Active" or "Not set"

### Limits
- Monthly spend limit ($)
- Agent pauses when limit is reached

### Save Bar
- Sticky at bottom
- "Discard" and "Save Settings" buttons
- Status text: "Changes apply to future runs" / "Complete setup to activate"

---

## 9. Ward Queue

### Two-Lane Architecture
- **Suggested Corrections** (red accent): Articles with factual inaccuracies about monitored entities
- **Suggested Affirmations** (green accent): Accurate positive coverage worth affirming

### Queue Item Structure
- Header: source name, time flagged, confidence badge
- Headline (bold, clickable to expand)
- Mention summary
- Expandable detail: Ward's reasoning, evidence, source URL
- Actions: "Create Submission" → routes to Review screen, "Dismiss" → removes from queue

### Status Banner
- Shows monitoring status, last scan time, articles checked
- Counts for pending corrections and affirmations

---

## 10. Review & Submission Flow

### Submission Editor
- URL display + Approved/Excluded toggle
- Verdict selector: Correction / Affirmation / Skip
- Confidence badge (high/medium/low)
- Original headline (read-only)
- Corrected headline (for corrections only)
- Reasoning textarea (max 2,000 chars)
- Evidence list (description + URL pairs, add/remove)

### Vault
- Shared facts, arguments, and translations across all articles
- Types: Standing Correction, Argument, Translation
- "Edit once — applies everywhere"

### Confirmation Dialog
- Warning about jury review process
- "Even if correct, juries may not approve"
- Cassandra bonus for vindicated rejections
- "I understand — Submit" button

---

## 11. Design Tokens

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| Navy | #1B2A4A | Primary text, headers, tab bar |
| Linen | #F0EDE6 | Active tab background, subtle fills |
| Vellum | #FDFBF5 | Page background |
| Gold | #B8963E | Accents, dividers, active indicators |
| Gold Light | #D4B96A | Secondary gold |
| Error | #C44D4D | Corrections, destructive actions |
| Success | #4A8C5C | Affirmations, positive status |
| Ward | #6B4C9A | Ward-specific accent |
| Text | #2C2C2C | Body text |
| Text Muted | #6B6B6B | Secondary text |
| Border | #D4D0C8 | Dividers, inactive borders |

### Typography
| Token | Value | Usage |
|-------|-------|-------|
| Serif | Source Serif 4, Georgia | Body text |
| Heading | EB Garamond, Georgia | Headings, labels, buttons |
| Mono | IBM Plex Mono | Data, stats, URLs, keywords |

---

## 12. Data Integrity & Security Notes

- **Never delete files without explicit user authorization** — this may deeply impact citizen trust
- Agent credentials are registered through the Trust Assembly, not user-chosen
- One-time submissions are credited to the user's email — can be claimed into a full account later
- All submission actions go through a confirmation dialog emphasizing the adversarial jury process
- Reasoning instructions are persistent per agent and prepended to every API call

# Trust Assembly — Design Requirements Document

**Version:** 1.0
**Date:** March 14, 2026
**Scope:** Site style uplift, browser extension redesign, correction display across platforms, and landing page hero
**Reference Artifacts:** All React prototypes produced in this session are available as .jsx files and serve as pixel-accurate references for implementation.

---

## 1. Site Header Redesign — Dark Band

### 1.1 Overview

The current site header (crest on white, teal tagline, two-row nav) is being replaced with a dark band header that establishes a stronger visual identity. The core concept is light emerging from darkness — white and gold elements on a near-black ground.

### 1.2 Dark Band Specifications

- **Background:** `linear-gradient(180deg, #1a1a1a 0%, #222 100%)`
- **Height:** Approximately 60-70px on desktop, flexible
- **Behavior:** `position: sticky; top: 0; z-index: 100` — the dark band stays pinned on scroll. Nav rows and user bar scroll away. Only the identity band persists.

### 1.3 Title Treatment

The title is "TRUST ASSEMBLY" (drop "The") rendered in all caps with oversized initials.

- **Font:** Newsreader (Google Fonts), weight 600
- **Color:** `#F0EDE6` (linen)
- **Letter spacing:** `0.12em`
- **T and A sizing:** 135-140% of the base letter size. If base caps are 18px, T and A are approximately 24px.
- **Implementation:** Wrap initials in `<span class="cap">` at `font-size: 1.35em`. Same font, same weight, same baseline — only size changes.

```html
<h1 class="site-title">
  <span class="cap">T</span>RUST
  <span class="cap">A</span>SSEMBLY
</h1>
```

### 1.4 Crest

- Positioned to the left of the title text, vertically centered
- The crest icon renders directly on the dark background. Remove the dark square container that exists on the current site — the gold elements (`#B8963E`) sit on the dark band naturally
- Size: approximately 36-40px

### 1.5 Tagline and Beta Badge

- **"TRUTH WILL OUT."** — color `#B8963E` (gold), font-size 9px, letter-spacing `0.15em`, font-weight 600, system sans-serif
- **BETA badge** — background `#16A085` (teal), color white, font-size 8px, border-radius 3px, padding `1px 6px`
- Both sit below the title, left-aligned with the title text

### 1.6 Nav Rows (Below Dark Band)

The dark header ends hard — no gradient fade, no shadow bleed. The contrast between dark band and white nav is intentional.

**Row 1 — Primary workflow:** Record · Assemblies · Submit · Review
- Background: `#fff`
- Padding: `0 16px`, items spaced with `margin-right: 20px`
- Font: system sans-serif, 13-14px
- Active state: weight 600, color `#1a1a1a`, bottom border `2px solid #1a1a1a`
- Inactive state: weight 400, color `#999`
- Row bottom border: `1px solid #eee`

**Row 2 — Reference pages:** Vaults · Consensus · Citizen · Ledger · Guide · Rules · About · Vision
- Same background, same treatment
- Font size: 12px (smaller than row 1 to establish hierarchy)
- Inactive color: `#bbb` (lighter than row 1)
- Keep the existing "More ▾" dropdown pattern
- Row bottom border: `1px solid #eee`

Zero gap between the two rows. They read as one nav block with two tiers.

### 1.7 User Bar

- Background: `#fff`
- Padding: `8px 16px`
- Left: crown emoji + username in 13px color `#333`, rank badge as outlined pill (`1px solid #ddd`, border-radius 12px, font-size 10px, color `#666`)
- Right: notification bell + "Sign Out" link in `#999`, font-size 12px
- Bottom border: `1px solid #eee`
- This bar scrolls away with content — it is NOT sticky

### 1.8 Visual Hierarchy Stack

```
DARK BAND (#1a1a1a)    ← sticky
  Crest + TRUST ASSEMBLY + TRUTH WILL OUT. [BETA]
─────────────────────── ← hard edge, no shadow
NAV ROW 1 (#fff)       ← scrolls away
  Record · Assemblies · Submit · Review
NAV ROW 2 (#fff)       ← scrolls away
  Vaults · Consensus · Citizen · More ▾
USER BAR (#fff)         ← scrolls away
  👑 @username · [RANK] · 🔔 · Sign Out
─────────────────────── ← 1px #eee border
CONTENT (#fff)
```

---

## 2. Browser Extension Popup — Dark Band Design

### 2.1 Overview

The extension popup mirrors the site identity and serves as a full submission, review, and browsing experience. Same dark band header treatment, same title, same crest. White content body below. The popup is the site in miniature — a user should recognize it instantly as the same system.

The extension is designed for two audiences: casual users who browse with corrections visible and occasionally check what's been found on a page, and active submitters who file corrections, review jury assignments, and manage vault artifacts.

### 2.2 Dimensions and Shell

- Width: 380px (Chrome extension standard)
- Height: 560px
- Border radius: 8px
- Shadow: `0 4px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)`
- Background: `#fff`
- The popup MUST support a **pop-out mode** where the user can detach the window and move it around the screen. This is triggered by a pop-out icon (`⧉`) in the header bar. Pop-out produces a resizable floating window that persists while the user navigates the page.

### 2.3 State Persistence

The extension MUST remember form state if the user accidentally closes the popup. All filled fields on the Submit tab are saved to `chrome.storage.local` on every keystroke (debounced). When the popup reopens on the same URL, the saved draft is restored. A green "Saved" indicator appears in the context bar to confirm this.

Draft data is keyed by URL — opening the extension on a different page starts a fresh form. The user can manually clear a draft.

### 2.4 Authentication

Users MUST be able to sign in to their Trust Assembly account directly from the extension. If no session exists, the extension shows a login screen with username/email and password fields, plus a link to register on trustassembly.org. Successful login stores the JWT in `chrome.storage.local` and switches to the main interface.

### 2.5 Header

Same dark band treatment as the site, scaled for the popup:
- Background: `linear-gradient(180deg, #1a1a1a 0%, #222 100%)`
- Crest: 28-30px, with `1px solid #B8963E33` border and `#111` background
- Title: `TRUST ASSEMBLY` with oversized T and A, Newsreader 600, 14px base / 19px initials
- Tagline: "TRUTH WILL OUT" at 8px, `#B8963E`
- **Notification bell** — always visible in the header, on ALL tabs (not just Review). Shows orange badge with pending count when jury assignments, application approvals, or submission status updates exist.
- **Pop-out button** (`⧉`) — always visible, detaches the popup into a floating window

### 2.6 Navigation Tabs

Three tabs in this order, matching the site's underline-active pattern:
1. **This Page** — corrections/affirmations on the current URL (default tab)
2. **Submit** — file a correction or affirmation
3. **Review** — pending jury assignments

Active state: weight 600, color `#1a1a1a`, `2px solid #1a1a1a` bottom border.
Inactive state: weight 400, color `#999`.

The notification bell is NOT a tab — it lives in the header and is accessible from all tabs.

### 2.7 This Page Tab

**Stats row** at top (background `#fafafa`): three centered counters showing correction count (red `#C0392B`), affirmed count (green `#27AE60`), and consensus count (orange `#D4850A`). Numbers in Newsreader, labels in IBM Plex Mono.

**Correction items** listed below with:
- Left border color: `3px solid` in correction red, affirmation green, or consensus orange
- Status badge: "✦ Consensus", "✓ Affirmed", or "Corrected" in the accent color, IBM Plex Mono
- Replacement text in Newsreader 13px
- Original text struck through in 11px, color `#aaa`
- Assembly name, jury vote count, and trust score in IBM Plex Mono 9.5px

"Open trustassembly.org →" link at bottom of the list.

### 2.8 Submit Tab — Full Submission Experience

The Submit tab is the most complex screen. It uses an **accordion pattern** to keep the UI manageable — each section collapses when not in use, and only the sections the user needs are opened. Sections show a count badge when they contain content.

#### 2.8.1 Context Bar

At the top of the Submit tab, a context bar shows:
- Platform icon (📰 for article, 𝕏 for Twitter, 🔴 for Reddit, etc.)
- Current page URL (truncated with ellipsis)
- Draft saved indicator: green dot + "Saved" when form state has been persisted

#### 2.8.2 Platform Detection and Defaults

The extension detects the current site's hostname and adjusts the default form layout:

| Detected Platform | Default Behavior |
|-------------------|-----------------|
| News article (default) | Headline section open. "Original headline" + "Replacement headline" + "Reasoning" fields. Inline body edits section available. |
| twitter.com / x.com | Headline section labeled "Post Content." "Original post text" + "Corrected version" + "Reasoning." Inline edits section hidden. |
| reddit.com | Headline section labeled "Post Content." Same as Twitter. Inline edits hidden. |
| youtube.com | Headline section labeled "Video Title." Same structure. Inline edits hidden. |
| facebook.com | Headline section labeled "Post Content." Same structure. Inline edits hidden. |

The user can always manually open the inline edits section on any platform if needed.

#### 2.8.3 Type Toggle

At the top of the form: Correction / Affirmation toggle. Dark fill for selected, outline for unselected. When "Affirmation" is selected, the replacement headline field is hidden (affirmations confirm the original, they don't replace it).

#### 2.8.4 Accordion Sections

All sections except the first are collapsed by default. Each section header shows: icon, title, item count badge, and expand/collapse chevron.

**Section 1: Headline / Post Content (default open)**

For articles:
- Original headline (textarea)
- Replacement headline (textarea, hidden for affirmations)
- Reasoning (textarea, 3 rows)
- Author (optional text input)

For social media:
- Original post text (textarea)
- Corrected version (textarea, hidden for affirmations)
- Reasoning (textarea, 3 rows)

**Section 2: Body Text Corrections (articles only, collapsed by default)**

Up to 20 inline edits. Each edit consists of:
- Original text from the article (textarea)
- Corrected text (textarea)
- **Display mode toggle**: "Replace" or "Strike"
  - **Replace** mode: the correction replaces the original text in the article DOM
  - **Strike** mode: the original text is shown with strikethrough and the correction appears alongside it

Each edit has a remove button (×). "Add inline edit (N/20)" button at the bottom shows the running count.

Explanatory text at the top: "Correct specific claims in the article body. Choose whether each edit replaces the text or shows as a strikethrough with the correction alongside."

This section is hidden when the detected platform is social media (Twitter, Reddit, YouTube, Facebook) since feed posts don't have article bodies. The user can still access it via manual section open if needed.

**Section 3: Evidence Links (collapsed by default)**

One or more evidence links, each consisting of:
- URL (text input)
- Explanation of why this evidence matters (textarea)

"Add another evidence link" button.

**Section 4: Vault Artifacts (collapsed by default)**

Users can attach or create vault entries that support the submission. Pending entries graduate to "approved" when the submission passes review.

A **vault type picker** (2×2 grid) offers four artifact types:
- 🏛 Standing Correction — fields: assertion, evidence
- ⚔️ Argument — fields: content
- 🧭 Foundational Belief — fields: content
- 🔄 Translation — fields: original text, translated text, type selector (Clarity / Anti-Propaganda / Euphemism / Satirical)

Users can add multiple vault artifacts of any type. Each has a remove button. The section badge shows the total count.

**Section 5: Submit to Assemblies (collapsed by default)**

Checklist of the user's assemblies. Multiple can be selected simultaneously. Each shows:
- Checkbox (dark fill when selected)
- Assembly name
- Member count

The submit button text dynamically reflects the selection: "Submit to 1 Assembly" / "Submit to 3 Assemblies."

#### 2.8.5 Submit Button

Pinned below the scrollable area (not inside the scroll container). Full width, `#1a1a1a` background, white text. Label includes the assembly count.

### 2.9 Review Tab

Shows pending jury assignments. Header bar: "N submissions awaiting your review" in IBM Plex Mono.

Each item shows:
- Submission type badge (CORRECTION or AFFIRMATION)
- Assembly name and vote progress ("3 of 7 voted")
- Headline text in quotes, Newsreader 13px

**Two action buttons per item:**
1. **"▸ Review Here"** — expands the item inline to show reasoning, evidence, and voting controls (Approve / Reject buttons + optional note field). This allows quick review without leaving the extension.
2. **"Open on Site →"** — navigates to the full submission page on trustassembly.org for the complete experience with all evidence, vault entries, dispute history, and audit trail.

The expanded review panel includes:
- Reasoning provided by the submitter
- Evidence links
- Approve / Reject buttons (green and red outlines)
- Optional note textarea

### 2.10 Footer

- Background: `#fafafa`
- Top border: `1px solid #eee`
- Left: user emoji + username
- Right: rank badge (outlined pill with `1px solid #e0e0e0`) + trust score

### 2.11 Reference Artifact

File: `extension-popup-v2.jsx` — complete implementation with all tabs, accordion submit form, context detection, inline edit display mode toggle, vault artifact picker, multi-assembly selection, expanded review, login screen, notification bell, and pop-out control.

---

## 3. Correction Display — News Articles

### 3.1 Design Principle

On a news article, the headline IS the correction. The extension replaces the headline text and changes its color. The original is one click away. This works because the article page is a publication's assertion and the correction supersedes it.

### 3.2 Headline Replacement

- **Text color is the primary brand signal.** The headline text itself changes color:
  - Correction: `#8B2D2D` (warm brick red — authoritative, not alarming)
  - Affirmation: `#1B5E3F` (deep forest green — trustworthy, not neon)
  - Consensus: `#7A6222` (burnished gold — prestigious, earned)
- **The headline uses the publication's own typeface.** Do not impose Trust Assembly fonts on the headline text. Only the color changes.
- **Lighthouse mark** sits inline at the end of the headline text, approximately the size of a period (12-15px). It's the "who" signal — "this came from Trust Assembly."

### 3.3 Attribution Line

Directly below the headline, a monospaced attribution line:

```
CORRECTED · The General Public · 11/13 jurors
```

- Font: IBM Plex Mono, 9.5-10px, weight 600 for the status label
- Color: same as the headline color, at 60-65% opacity (fades up to ~95% on hover)
- Consensus gets an additional `✦ Consensus` badge
- On hover, "click for details" appears at the end

### 3.4 Expandable Detail Panel

Click the headline or attribution line to expand a panel below:

- Background: tinted version of the correction color (very light — `#FDF6F6` for corrections, `#F3FBF7` for affirmations, `#FDFBF2` for consensus)
- Border: `1px solid` in a matching muted tone
- Border radius: 5-6px
- Max height: 520px with overflow scroll for long records

**Panel sections (only shown when populated):**
1. **Original headline** — struck through, gray, in the publication's serif
2. **Reasoning** — Source Serif 4 or the publication's font, 13.5px, color `#444`
3. **Evidence** — links with arrow icon, URL in monospace, explanation in body font
4. **Body corrections** — inline edit list with approved/rejected badges
5. **Linked vault entries** — icon + type + content + survival count
6. **Translations** — original → translated with type label
7. **Dispute history** — status, reasoning, votes, filing info
8. **Audit trail** — collapsed by default, expandable

**Panel footer:** Trust Assembly wordmark (lighthouse + "TRUST ASSEMBLY" in monospace), trust score, and "View full record →" link.

### 3.5 Inline Body Corrections

For corrections to specific claims within article body text:

- The corrected text renders in the correction color (`#8B2D2D`) with a `1.5px dotted` underline in the same color at reduced opacity
- Hover triggers a tooltip (dark navy `#1B2A4A` background, light text):
  - "ORIGINAL TEXT" label in gold monospace
  - Struck-through original text
  - Reasoning in 11px
  - Lighthouse mark attribution
- Tooltip positioned above the text with a downward-pointing arrow

### 3.6 Dark Theme Adaptation

The extension must detect page background luminance and shift to lighter color variants on dark-themed sites:
- Correction: `#D4766E` (lighter brick red)
- Affirmation: `#6EBF8B` (lighter forest green)
- Consensus: `#D4B45E` (lighter gold)
- Panel backgrounds shift to dark-tinted versions

### 3.7 Implementation: Hide and Sibling

For headline replacement on article pages:
1. Find the headline element
2. Set `display: none` on it
3. Insert a sibling element with the corrected text in the Trust Assembly color
4. Append the lighthouse mark and attribution line

The original element stays in the DOM with all event handlers intact. Toggling corrections off reverses the process. Nothing is destroyed.

---

## 4. Correction Display — Social Media (Injected Cards)

### 4.1 Design Principle

On social media, the original post is what someone SAID. The correction is a RESPONSE to it, not a replacement. The post text is never modified. Instead, a correction card is injected between posts in the feed.

### 4.2 Card Design — Universal

The correction card uses the same visual language across all platforms but adapts its typeface to match the host:

**Card structure:**
- Thin connector line (2px wide, 6-8px tall, correction color at 20% opacity) ties the card to the post above
- Card indented from the left (aligned with post text, not the avatar/vote column)
- Background: very dark tint of the correction color (`#150A0A` for corrections, `#0A150E` for affirmations)
- Border: `1px solid` in a slightly lighter tone (`#3D1F1F` for corrections)
- Border radius: 10-12px

**Card header:**
- Lighthouse mark (10-11px) + "TRUST ASSEMBLY" in IBM Plex Mono 8.5-9px weight 600 color `#B8963E`
- Status badge: "⚑ CORRECTED" or "✓ AFFIRMED" in the accent color with 18% opacity background, monospace, small pill shape

**Card body:**
- Correction text in the **platform's native typeface** (see 4.3), 12-12.5px, line-height 1.45, in the accent color (`#D4766E` for corrections, `#6EBF8B` for affirmations)
- Affirmation text: "This post has been reviewed and found to be accurate by community jury."

**Expandable detail:**
- "▸ Why" toggle at the bottom of the card
- Expands to show: reasoning, evidence links, assembly name, trust score, "Full record →" link
- Section labels ("REASONING", "EVIDENCE") stay in IBM Plex Mono
- Evidence URLs in IBM Plex Mono with platform-native link color
- All other text in the platform's native typeface

**Card footer (expanded):**
- Assembly name, jury vote count, trust score in monospace 9-10px
- "Full record →" link

### 4.3 Platform-Specific Typeface Mapping

The correction card body text inherits the platform's font. Only the Trust Assembly brand elements (wordmark, section labels, evidence URLs) stay in IBM Plex Mono.

| Platform | Card Body Font Stack |
|----------|---------------------|
| Twitter/X | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` |
| Reddit | `IBMPlexSans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` |
| YouTube | `"Roboto", Arial, sans-serif` |
| Facebook | `Helvetica, Arial, sans-serif` |
| Default (unknown) | `inherit` from nearest text element via `getComputedStyle()` |

In practice, the content script should read `getComputedStyle()` from a nearby post text element and inherit that font-family for the card body. This automatically adapts if the platform updates their typeface.

### 4.4 Platform-Specific Approach: Twitter/X

**DOM strategy:**
- Tweets render as relatively stable DOM structures
- Content script uses MutationObserver on the feed container to detect new tweets entering the DOM during scroll
- For each tweet, hash the text content and query `GET /api/corrections?text_hash=<sha256>`
- If match found, use `insertAdjacentElement('afterend', card)` on the tweet container to inject the correction card

**Visual treatment:**
- Card indented to align with tweet text (past the avatar column, approximately 56px left margin)
- Card uses Twitter's dark theme colors (near-black backgrounds) since Twitter defaults to dark
- Link color: `#58A6FF` (Twitter's link blue)
- Card connector line: 2px wide, correction color at 20% opacity

**Technical notes:**
- Twitter re-renders aggressively on scroll — tweets are destroyed and recreated. The MutationObserver must watch continuously, not just run once on page load.
- Tweets in the feed don't have stable URLs. Match by text content hash.
- The correction card must survive React reconciliation — inject as a sibling outside React's controlled DOM tree.

### 4.5 Platform-Specific Approach: Reddit

**DOM strategy:**
- Post titles and content are queryable DOM elements on both old Reddit (static HTML) and new Reddit (React)
- MutationObserver for infinite scroll
- Match by text hash on post title

**Visual treatment:**
- Card indented past the vote column (approximately 42-52px left margin)
- Uses Reddit's dark theme colors
- Link color: `#4FBCFF` (Reddit's link blue on dark)
- On old Reddit (white background), shift to light card backgrounds matching the article correction panel style

**Additional Reddit integration:**
- Consider injecting a flair-style badge ("Corrected" or "✓ Verified") into the post's existing flair area if the DOM permits
- The card can optionally include a left-border accent matching Reddit's mod-note visual language (`border-left: 3px solid <accent>`)

### 4.6 Platform-Specific Approach: YouTube

**DOM strategy:**
- Video titles are prominent, stable DOM elements
- Description content is lazy-loaded but observable
- Comments are deeply nested and dynamically loaded — lower priority target

**Visual treatment:**
- Card sits below the video title, above the channel info bar
- Styled like YouTube's existing info/description cards with `border-radius: 12px`
- Uses YouTube's dark background colors
- Expand/collapse uses YouTube's native "...more" / "Show less" text pattern
- Link color: `#3EA6FF` (YouTube's link blue)

**Card placement:**
- Between title and channel info (where YouTube already places context cards)
- The card includes "VIDEO TITLE CORRECTED" badge text to be explicit about what's being corrected

### 4.7 Platform-Specific Approach: Facebook

**DOM strategy:**
- Meta obfuscates CSS class names with generated hashes that change between deployments
- Cannot rely on stable selectors — use structural heuristics: find elements by role, nesting pattern, and text content characteristics
- Expect to maintain a Facebook-specific adapter that may need updates when Meta ships DOM changes

**Visual treatment:**
- Card attaches below shared link preview cards (where Facebook already places fact-check labels)
- Connected to the link preview with `border-top: 2px solid <accent>60` and `border-radius: 0 0 8px 8px`
- Uses "See why →" / "See less" toggle text (Facebook's native expand pattern)
- Link color: `#4599FF` (Facebook's link blue)
- On white backgrounds, use light card backgrounds matching the article panel style

**Card placement:**
- Specifically targets shared link previews (the most common vector for misinformation on Facebook)
- For text-only posts, card injects below the post text, above the reaction bar

### 4.8 Matching Strategy

Social media posts don't have stable URLs in the feed context. The extension needs a text-hash matching system:

**New API endpoint required:**
```
GET /api/corrections?text_hash=<sha256>
```

Or a bulk endpoint for efficiency:
```
POST /api/corrections/batch
Body: { hashes: ["sha256_1", "sha256_2", ...] }
```

The content script hashes each post's text content as it enters the viewport and queries the API. The bulk endpoint is strongly preferred — a feed with 20+ visible posts should be a single API call, not 20 individual requests.

**Hash normalization:**
- Strip leading/trailing whitespace
- Normalize Unicode
- Collapse multiple spaces
- Strip emoji (optional — they vary by platform rendering)
- Lowercase
- SHA-256 the result

### 4.9 MutationObserver Pattern

All social media platforms dynamically load content during scroll. The content script must:

1. Register a MutationObserver on the feed container element
2. When new post elements enter the DOM, the observer fires
3. Extract text content from each new post
4. Hash and batch-query the corrections API
5. Inject correction cards for any matches
6. Track which posts have been processed to avoid duplicate cards

This runs continuously for the lifetime of the page.

### 4.10 Implementation: Insert Adjacent (Not Modify)

For social media feeds, the DOM modification is a single operation:

```javascript
postElement.insertAdjacentElement('afterend', correctionCard);
```

No text replacement. No hiding elements. No touching the post's internal DOM. The correction card is a new, independent element that lives between posts. All post click handlers, links, embeds, metrics, and React associations remain completely intact.

---

## 5. Landing Page Hero — Auto-Advancing Showcase

### 5.1 Overview

The landing page hero section replaces the current static landing with an auto-advancing before/after showcase that demonstrates Trust Assembly's value by example. The content IS the pitch — each slide shows a real manipulation pattern being corrected.

### 5.2 Structure (Top to Bottom)

1. **Dark band header** (same as site header, see Section 1)
2. **Hero section** (dark gradient background):
   a. "The internet's corrections layer." — headline, alone at top
   b. Platform pills (clickable category selectors)
   c. Italic slide subtitle (describes the manipulation pattern)
   d. Before/after showcase (auto-advancing, 8-second intervals)
   e. Progress dots
   f. Descriptive text about jury review (below the showcase, not above)
   g. Two CTAs: "Install Extension" (gold) and "Join as Citizen" (outline)
3. **How It Works** section (white background, four numbered steps)
4. **Closing CTA** ("The truth has a browser extension.")

### 5.3 Hero Background

`background: linear-gradient(180deg, #0D0D0D 0%, #1B2A4A 100%)`

### 5.4 Headline

- "The internet's corrections layer."
- Font: Newsreader, 32px, weight 400
- Color: `#F0EDE6`
- Centered, max-width 560px
- This is the ONLY text above the showcase. The jury/platform description goes below.

### 5.5 Showcase Slides

Five slides, each demonstrating a specific manipulation pattern. Self-referential content — the examples teach the viewer about misinformation techniques by correcting them in real time.

**Slide 1: Sensationalized Headlines (columns layout)**
- Before: "Common Grocery Store Item Linked to 300% Surge in Cancer Risk, Study Warns"
- After: "Preliminary Lab Study of 12 Mice Finds Cell Changes from High-Dose Additive Exposure Not Replicated in Humans"
- Subtitle: "When a headline turns a nothingburger into the apocalypse"

**Slide 2: Political Spin (stacked layout — Twitter card)**
- Before: "Economy in FREEFALL 📉 Jobs report MISSES expectations as unemployment crisis deepens."
- After: Same tweet with injected card: "Economy added 187,000 jobs — 13,000 below the 200,000 forecast. Unemployment held steady at 3.7%."
- Subtitle: "When the framing does the lying so the words don't have to"

**Slide 3: Buried Numbers (columns layout — body text)**
- Before: Article text with "wildly popular," "millions of riders," "a fraction of the projected cost"
- After: Same text with inline corrections: "below-projection," "1.2 million riders against a 3 million target," "$2.1B vs. a $2.4B budget (12% under, not the 40% claimed)"
- Subtitle: "When the details quietly contradict the headline"

**Slide 4: Viral Misinformation (stacked layout — Reddit card)**
- Before: "Apple confirms all iPhones will require monthly subscription fee starting January 2027" (31.4k upvotes)
- After: Same post with injected card: "Apple announced an optional premium support tier. All existing functionality remains free. Source is a satire blog shared without context."
- Subtitle: "When a false post has 30,000 upvotes before anyone checks"

**Slide 5: Good Reporting (columns layout — affirmation)**
- Before: "City Water Tests Reveal Lead Levels 4× Federal Limit in Three School Districts"
- After: Same headline in green with "✓ AFFIRMED · Local Watch Assembly · 7/7 jurors"
- Subtitle: "When a journalist gets it right and nobody notices"

### 5.6 Layout Rules

- **Article headlines and body text** use side-by-side columns (before left, after right)
- **Social media posts (Twitter, Reddit)** use stacked layout (before on top, after below) — these are horizontal elements that don't compress well into half-width columns
- **Before card:** 55% opacity, `1px solid #333` border
- **After card:** full opacity, `1px solid #B8963E44` border with gold shadow glow (`0 0 0 1px #B8963E33`)
- **BEFORE / AFTER TRUST ASSEMBLY** labels in IBM Plex Mono 10px, left-aligned above each card

### 5.7 Auto-Advance Behavior

- 8 seconds per slide (long enough to read a full correction with reasoning)
- Pause on hover (over cards or category pills)
- Progress bar fills inside the active dot over the 8-second duration
- Smooth fade transition between slides (0.25s opacity + translateY)
- Active dot expands to 24px wide; inactive dots are 8px circles
- Clicking a category pill jumps immediately to that slide

### 5.8 Descriptive Text (Below Showcase)

```
Community juries review headlines and claims across the web.
Corrections appear right where the misinformation lives — in your browser,
on every platform. No algorithm decides what's true. People do.
```

- Font: system sans-serif, 14.5px, color `#888`, line-height 1.65
- Max-width 480px, centered

### 5.9 CTAs

Two buttons, centered:
- **"Install Extension"** — background `#B8963E`, color `#1a1a1a`, weight 600, border-radius 6px, hover brightens to `#D4B45E`
- **"Join as Citizen"** — transparent background, `1px solid #444` border, color `#ccc`, border-radius 6px, hover border brightens to `#888`

### 5.10 How It Works Section

White background, max-width 660px, four numbered steps:

1. Someone notices a misleading claim
2. A random jury reviews it
3. Independent groups verify it
4. The correction appears in your browser

Each step: dark circle with gold number, bold title, gray description. Steps separated by `1px solid #eee` borders.

### 5.11 Closing CTA

"The truth has a browser extension." in Newsreader 20px, followed by "Free. Open. Jury-verified. No algorithm decides what's true." in 13px gray, followed by a "Get Started" button in dark.

### 5.12 Reference Artifact

File: `landing-hero-v3.jsx` — complete implementation with all five slides, auto-advance, and the full page below the fold.

---

## 6. Typography Hierarchy Summary

| Context | Font | Usage |
|---------|------|-------|
| Site title, hero headline, correction items | Newsreader (Google Fonts) | Display and body serif |
| Brand wordmark, labels, metadata, evidence URLs | IBM Plex Mono | Monospace brand font |
| Nav items, UI controls, body descriptions | System sans-serif (-apple-system stack) | Interface text |
| Article corrections: headline text | Inherit from publication | Never impose TA fonts on article headlines |
| Social media card body text | Inherit from platform | Match host typeface |
| Article corrections: reasoning, detail panel | Source Serif 4 or publication's serif | Readable body text |

---

## 7. Color System Summary

| Token | Hex | Usage |
|-------|-----|-------|
| Navy / Dark Band | `#1a1a1a` to `#222` | Header background, primary buttons |
| Linen | `#F0EDE6` | Light text on dark backgrounds |
| Gold | `#B8963E` | Accent, tagline, lighthouse mark, consensus |
| Teal | `#16A085` | BETA badge only |
| Correction Red | `#8B2D2D` (light bg) / `#D4766E` (dark bg) | Corrected headlines and cards |
| Affirmation Green | `#1B5E3F` (light bg) / `#6EBF8B` (dark bg) | Affirmed headlines and cards |
| Consensus Gold | `#7A6222` (light bg) / `#D4B45E` (dark bg) | Cross-group consensus |
| Status Red | `#C0392B` | Extension stat counters |
| Status Green | `#27AE60` | Extension stat counters |
| Status Orange | `#D4850A` | Extension consensus counters |
| Dim | `#aaa` | Secondary text, metadata |
| Line | `#eee` | Borders, dividers |

---

## 8. Implementation Priority

### Phase 1 — Site Header (Now)
- Replace current header with dark band
- Update nav and user bar styling
- Sticky behavior on the dark band only

### Phase 2 — Landing Page Hero (Now)
- Build the auto-advancing showcase
- Self-referential content slides
- How It Works section and CTAs

### Phase 3 — Extension Popup Redesign (Before 200 Users)
- Dark band header in popup
- Three-tab layout: This Page → Submit → Review
- Login screen with JWT persistence
- Notification bell in header (all tabs)
- Pop-out/floating window support
- This Page tab with stats and correction list
- Submit tab: context-aware platform detection, type toggle, headline section
- Submit tab: accordion UI for all sections
- Submit tab: inline body corrections with Replace/Strike display mode toggle (up to 20)
- Submit tab: evidence links section
- Submit tab: vault artifact picker (all 4 types, multiples)
- Submit tab: multi-assembly checkbox selector
- Submit tab: state persistence via chrome.storage.local (draft saving per URL)
- Review tab: expand-inline and open-on-site dual action pattern
- Review tab: inline voting with approve/reject and optional note
- Match the design in `extension-popup-v2.jsx`

### Phase 4 — Article Correction Display (Before 200 Users)
- Colored headline replacement via hide-and-sibling
- Attribution line
- Expandable detail panel with progressive disclosure
- Inline body corrections with tooltips
- Dark theme detection and adaptation

### Phase 5 — Social Media Correction Cards (Before 500 Users)
- Text-hash matching API endpoint
- MutationObserver pattern for dynamic feeds
- Twitter/X adapter
- Reddit adapter
- YouTube adapter
- Facebook adapter (highest complexity, may lag behind others)
- Platform typeface inheritance

---

## 9. Reference Artifacts Index

All prototypes are available as self-contained React (.jsx) files:

| File | Contents |
|------|----------|
| `extension-popup-v2.jsx` | Browser extension popup — full redesign with accordion submit, context detection, vault picker, multi-assembly, review expand, login, notifications, pop-out |
| `extension-dark-band.jsx` | Browser extension popup — earlier simpler version (superseded by v2) |
| `site-header-preview.jsx` | Full site header with dark band, nav, user bar, and sample content |
| `landing-hero-v3.jsx` | Landing page with auto-advancing showcase and How It Works |
| `extension-reasoning.jsx` | Detail panel stress test — light through heavy evidentiary records |
| `extension-injected-cards.jsx` | Social media correction cards in Twitter and Reddit feeds |
| `extension-platforms.jsx` | Platform-specific card designs (Twitter, Reddit, YouTube, Facebook) |
| `extension-v2.jsx` | Article headline correction with colored text treatment |
| `extension-scroll.jsx` | Feed-level text replacement prototype (explored and set aside in favor of injected cards) |

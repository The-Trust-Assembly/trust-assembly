# Social Media Extension & Adaptive Submission Plan

## Overview

Transform the extension from "news headline replacement only" to a platform-aware system that adapts its behavior (submission form, DOM injection, preview) based on whether the site is a traditional article or a social media platform.

---

## Site Categorization

### Category A: "Headline Replacement" Sites (existing behavior, enhanced)
Traditional news/article sites where we replace the headline text and apply body corrections.

**Sites:** CNN, NYT, WaPo, Fox, BBC, Reuters, AP, NPR, MSNBC, Guardian, WSJ, Bloomberg, Politico, The Hill, Axios, USA Today, Vox Media, Newsweek, Intercept, ProPublica, Al Jazeera, Yahoo News, Daily Mail, WordPress, Medium, AMP, Substack **articles**, Facebook **shared article links**, LinkedIn **articles**, generic/unknown sites.

**Behavior:**
- Detect & replace headline in DOM (existing logic)
- Body corrections via inline edits (existing logic)
- Popup form: Original Headline, Corrected Headline, Reasoning, Authors, Evidence, Inline Edits, Vault
- Live preview: headline turns gray italic as user types replacement

### Category B: "Title + Context Box" Sites
Social platforms where content has a title/name that can be replaced AND a context box inserted.

**Sites:**
- **YouTube** — Video title (`h1.ytd-watch-metadata`, `h1 yt-formatted-string`) + box above expanded description (`#description-inner`, `ytd-text-inline-expander`)
- **Reddit** — Post title (`h1[slot="title"]`, `[data-testid="post-title"]`, old reddit: `a.title`) + box at top of post body (`[data-testid="post-content"]`, `.expando`, `.usertext-body`)
- **TikTok** — Video description title area + box above description text
- **Facebook feed posts with text** — Replace post title text if present + box

**Behavior:**
- Replace the title/name in DOM
- Inject a "Trust Assembly Context Box" above the body/description
- Popup form: Original Title, Corrected Title, Short Description (for box), Longer Description, Evidence, Vault
- Live preview: title turns gray italic + grayed-out context box appears
- Context box shows: short description, reasoning, evidence links, vault artifacts

### Category C: "Context Box Only" Sites
Social platforms where there's no distinct headline to replace — only a box insertion.

**Sites:**
- **Twitter/X** — Tweets (`article[data-testid="tweet"]`, anchor via tweet text node, tweet ID from `a[href*="/status/"]`)
- **Substack Notes** — Notes in scroll feed (`div.note-content`, `.pencraft`)
- **Instagram** — Posts/reels (`article`, caption area)
- **LinkedIn posts** — Feed posts (`div.feed-shared-update-v2`, `.update-components-text`)
- **Threads** — Posts (similar to Twitter DOM)
- **Bluesky** — Posts (`article`, `.r-1awozwy` post containers)
- **Mastodon** — Toots (`.status__content`, `.detailed-status__content`)
- **Pinterest** — Pin descriptions
- **Tumblr** — Posts (`.post-content`, `.reblog-content`)

**Behavior:**
- NO headline replacement
- Inject a "Trust Assembly Context Box" below or beside the post
- Popup form: "Add Context" mode — Short Description, Longer Explanation, Evidence, Vault artifacts
- Educate user: "Your context will appear as a box below this post for other Trust Assembly members"
- Live preview: grayed-out context box appears near the post
- New submission type: `add_context` (blue color coding, neutral points, jury evaluates "does this add value?")

---

## New Submission Type: `add_context`

- Color: blue (`#2563EB`)
- Points: neutral (0 wins/losses on resolution — jury votes on "adds value" yes/no)
- Jury question: "Does this context add value to the piece?"
- DB: `submission_type = 'add_context'`
- Fields: `url`, `original_headline` (auto-set to platform name e.g. "YouTube", "Twitter"), `reasoning` (short description), `extended_reasoning` (longer description for box), `evidence`, vault artifacts
- The `original_headline` field is set server-side to the site name and hidden from the user after URL entry

---

## Implementation Phases

### Phase 1: Site Categorization Engine

**File: `extensions/chrome/content.js`**

Extend `detectSiteType()` to return a new `category` field: `"article"`, `"title_box"`, or `"box_only"`.

Add social media site detection blocks for:
- YouTube, Reddit (new/old/sh), TikTok, Twitter/X, Instagram, Substack Notes, LinkedIn, Threads, Bluesky, Mastodon, Pinterest, Tumblr, Facebook

Each returns:
```js
{
  name: "youtube",
  category: "title_box",    // NEW
  dynamic: true,
  headlineSelectors: [...],  // title selectors for title_box sites
  boxAnchorSelectors: [...], // NEW: where to inject context box
  articleRoot: '...',
  waitSelector: '...',
  postSelector: '...',       // NEW: for feed sites, the repeating post container
}
```

Also add `boxAnchorSelectors` for each social site — the CSS selectors where we insert the context box.

**File: `extensions/chrome/content.js`**

New function `detectSocialPostIdentifier()`:
- For Twitter: extract tweet ID from URL or `a[href*="/status/"]`
- For Reddit: extract post ID from URL
- For YouTube: extract video ID from URL
- This anchors corrections to specific posts, not just page URLs

Modify `getSiteType()` to also differentiate Substack articles vs Substack Notes (check URL path: `/p/` = article, `/note/` = note, or check for note feed DOM markers).

### Phase 2: Context Box Rendering

**File: `extensions/chrome/content.js`**

New function `renderContextBox(correction, options)`:
- Creates a styled box that matches the host site's text style but with TA blue border
- Content: short description, "View details" expander for longer description, evidence links, vault artifact badges
- `options.pending` — if true, renders in gray with "Pending Review" label
- `options.preview` — if true, renders in gray italic for live preview
- Box has a small TA shield icon and "Trust Assembly" label

New function `injectContextBox(siteType, correction, options)`:
- Finds the correct anchor point using `siteType.boxAnchorSelectors`
- For feed sites (Twitter, Reddit feed, etc.): find the specific post matching the URL/ID, inject box after it
- For single-content pages (YouTube watch, Reddit post view): inject box at the anchor point
- Handles both approved corrections (solid colors) and pending (gray)

New function `matchSiteTextStyle(element)`:
- Reads computed font-family, font-size, line-height from a nearby element
- Returns CSS properties to apply to the context box for visual harmony
- Adds TA blue accent (`#2563EB` left border, TA shield icon)

### Phase 3: Adaptive Popup Form

**File: `extensions/chrome/popup.js`**

Modify `renderSubmitTab()` to detect site category and adapt:

1. Add message from content script: `TA_GET_SITE_INFO` → returns `{ category, siteName, postId }`
2. Based on category:

**Category A (article):** Current form, no changes.

**Category B (title_box):**
- Show: Original Title, Corrected Title, Short Description (new field, 280 char max, tip: "Keep it concise — this appears in the context box"), Longer Description (new field, replaces Reasoning), Evidence, Vault
- Type toggle: Correction (red) | Affirmation (green) | Add Context (blue)
- Tip banner: "Your correction will replace the title and add a context box below"

**Category C (box_only):**
- Hide: Original Headline, Corrected Headline fields (auto-set original_headline to site name)
- Show: Short Description (required, 280 char), Longer Description, Evidence, Vault
- Only type: "Add Context" (blue) — no correction/affirmation toggle
- Tip banner: "Your context will appear as an information box below this [tweet/post/video]. Other Trust Assembly members will see this context when viewing this page."
- Show preview of what the box will look like

3. Add new `formState` fields:
```js
formState = {
  ...existing,
  shortDescription: "",      // for context box headline
  extendedReasoning: "",     // longer explanation
  siteCategory: null,        // "article" | "title_box" | "box_only"
  siteName: null,            // "youtube", "twitter", etc.
}
```

**File: `extensions/chrome/popup.html`**

Add CSS for:
- `.type-toggle button.active-context` — blue styling (`#2563EB`)
- `.context-banner` — blue info banner explaining how context will appear
- `.context-preview` — inline preview of the context box in the popup

### Phase 4: Live Preview for Social Sites

**File: `extensions/chrome/popup.js`**

Extend `sendPreviewMessage()` to send social-media-aware preview data:
```js
{
  type: "TA_PREVIEW_SOCIAL",
  siteCategory: "box_only" | "title_box",
  title: "...",           // for title_box sites
  shortDescription: "...",
  evidence: [...],
  vaultItems: {...},
  isPreview: true
}
```

Send on every keystroke (debounced 100ms) for all relevant fields.

**File: `extensions/chrome/content.js`**

New message handler `TA_PREVIEW_SOCIAL`:
- For `title_box`: update title text to gray italic + render/update gray context box
- For `box_only`: render/update gray context box only
- Track preview state to clean up on `TA_CLEAR_PREVIEW`

### Phase 5: Pending Submission Preview

**File: `extensions/chrome/content.js`**

Extend `fetchViaBackground()` or add parallel fetch:
- New API call: `GET /api/corrections?url=...&include_pending=mine` — returns the user's own pending submissions for this URL, plus pending submissions from their assembly members
- Pending corrections render the same way as approved, but in gray with a "Pending Review" badge

**File: `src/app/api/corrections/route.ts`**

Add optional `include_pending` query param:
- `include_pending=mine` — also returns pending submissions from the authenticated user
- `include_pending=assembly` — also returns pending from assembly members
- These get a `pending: true` flag in the response

**File: `extensions/chrome/content.js`**

In `applyData()`, after applying approved corrections:
- Apply pending corrections with gray styling
- For article sites: headline in gray with "(Pending)" suffix
- For social sites: context box in gray with "Pending Review" banner

### Phase 6: Server-Side Changes

**File: `src/app/api/submissions/route.ts`**

- Add `add_context` as valid `submissionType`
- For `add_context`: `original_headline` is auto-set to the site name (e.g., "YouTube") — not required from client
- Add `short_description` field (max 280 chars)
- Add `extended_reasoning` field (max 5000 chars)
- For `add_context`, jury resolution has neutral point impact

**File: `src/lib/validation.ts`**

Add:
```typescript
short_description: 280,
extended_reasoning: 5000,
```

**File: `src/lib/jury-rules.ts`**

Add `add_context` handling:
- Resolution: majority "adds value" → approved, majority "doesn't add value" → rejected
- No reputation impact (neutral points)
- No deliberate deception finding possible

**File: `db/migrations/006_add_context_type.sql`**

```sql
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS short_description VARCHAR(280);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS extended_reasoning TEXT;
-- submission_type already TEXT, 'add_context' is a new valid value
```

### Phase 7: Auto-Detection Fallback ("Find on Page")

**File: `extensions/chrome/content.js`**

New function `manualHeadlineFinder()`:
- When automatic headline detection fails, content script sends `{ type: "TA_HEADLINE_NOT_FOUND" }` to popup
- Popup shows a collapsed "Can't find the headline? Search for it" section
- User types a text string → content script highlights all matching text nodes on the page
- User clicks the correct one → that becomes the `originalHeadline`
- Implementation: walk the DOM text nodes, wrap matches in `<mark>` with click handlers

**File: `extensions/chrome/popup.js`**

- On `TA_HEADLINE_NOT_FOUND` response, show the manual finder UI (collapsed by default)
- Send `TA_FIND_TEXT` messages to content script as user types
- Receive `TA_TEXT_FOUND` with match count
- Send `TA_SELECT_TEXT` when user clicks "Use this text"

### Phase 8: QA Test Fixtures & Diagnostic Integration

**Directory: `extensions/chrome/test-fixtures/`**

Create static HTML snapshots for each site category:

1. `fixture-cnn.html` — CNN-like article with headline
2. `fixture-youtube.html` — YouTube watch page with title and description
3. `fixture-reddit.html` — Reddit post page (new reddit style)
4. `fixture-twitter.html` — Twitter/X page with tweets
5. `fixture-instagram.html` — Instagram post
6. `fixture-substack-article.html` — Substack article
7. `fixture-substack-notes.html` — Substack notes feed
8. `fixture-facebook.html` — Facebook feed/article
9. `fixture-generic.html` — Generic page with h1

Each fixture includes realistic DOM structure with the selectors our code targets.

**File: `extensions/chrome/test-runner.js`**

New file that:
- Loads each fixture into an iframe
- Injects the content script logic
- Runs assertions:
  - Correct site type detected (`name` and `category`)
  - Headline/title element found (if applicable)
  - Context box injected at correct location (for social sites)
  - Box contains expected content
  - Preview mode renders correctly (gray styling)
- Returns test results as an array of `{ fixture, test, pass, detail }`

**File: `extensions/chrome/test-page.html`**

A standalone page that:
- Loads `test-runner.js`
- Shows test results with pass/fail badges
- Can be opened from the diagnostic button
- Shows per-fixture results with expandable details

**File: `src/app/api/admin/diag-transactions/route.ts`**

Add new section: **SECTION: EXTENSION SITE DETECTION AUDIT**
- Tests that all known site category mappings are consistent
- Validates that social sites have `boxAnchorSelectors`
- Checks for orphaned `add_context` submissions that reference unknown sites

**Integration with diagnostics button:**
- Add a "Run Extension Tests" button on the FeedbackScreen that opens `test-page.html` in a new tab
- Or: the test results can be fetched via a simple API if we want server-side validation

### Phase 9: Extension API Client Updates

**File: `extensions/chrome/api-client.js`**

Add to the `TA` object:
```js
async submitContext({ url, shortDescription, extendedReasoning, evidence, orgIds, vaultItems }) {
  // Calls POST /api/submissions with submissionType: "add_context"
}
```

Update `submitCorrection` to accept `shortDescription` and `extendedReasoning` for title_box submissions.

---

## Detailed Site Selector Reference

### YouTube
```js
{
  name: "youtube",
  category: "title_box",
  dynamic: true,
  headlineSelectors: [
    'h1.ytd-watch-metadata yt-formatted-string',
    'h1.ytd-watch-metadata',
    '#title h1 yt-formatted-string',
    '#title h1',
  ],
  boxAnchorSelectors: [
    '#description-inner',
    'ytd-text-inline-expander',
    '#description',
    '#meta-contents',
  ],
  articleRoot: '#description, #meta',
  waitSelector: 'h1.ytd-watch-metadata, #title h1',
  postSelector: null,
}
```

### Reddit (new)
```js
{
  name: "reddit",
  category: "title_box",
  dynamic: true,
  headlineSelectors: [
    'h1[slot="title"]',
    '[data-testid="post-title"]',
    'div[data-click-id="title"]',
    'h1',
  ],
  boxAnchorSelectors: [
    '[data-testid="post-content"]',
    '.expando',
    '#-post-rtjson-content',
    'shreddit-post',
  ],
  articleRoot: '[data-testid="post-content"], .expando, .Post',
  waitSelector: 'h1[slot="title"], [data-testid="post-title"]',
  postSelector: 'shreddit-post, [data-testid="post-container"]',
}
```

### Twitter/X
```js
{
  name: "twitter",
  category: "box_only",
  dynamic: true,
  headlineSelectors: [], // no headline
  boxAnchorSelectors: [
    'article[data-testid="tweet"] div[data-testid="tweetText"]',
    'article[data-testid="tweet"]',
  ],
  articleRoot: null,
  waitSelector: 'article[data-testid="tweet"]',
  postSelector: 'article[data-testid="tweet"]',
}
```
Anchoring: extract tweet ID from `a[href*="/status/"]` within the tweet article.

### Instagram
```js
{
  name: "instagram",
  category: "box_only",
  dynamic: true,
  headlineSelectors: [],
  boxAnchorSelectors: [
    'article div[role="presentation"] + div',
    'article ul',
    'article',
  ],
  waitSelector: 'article',
  postSelector: 'article',
}
```

### Substack Notes
```js
{
  name: "substack_notes",
  category: "box_only",
  dynamic: true,
  headlineSelectors: [],
  boxAnchorSelectors: [
    '.note-content',
    '.pencraft.pc-display-flex',
  ],
  waitSelector: '.note-content',
  postSelector: '.note-content',
}
```
Detection: Substack + URL contains `/notes` or DOM has `.note-content`.

### Additional Social Sites (box_only)
- **Threads**: `{ name: "threads", category: "box_only", postSelector: 'div[data-pressable-container]' }`
- **Bluesky**: `{ name: "bluesky", category: "box_only", postSelector: 'div[data-testid="postThreadItem"]' }`
- **Mastodon**: `{ name: "mastodon", category: "box_only", postSelector: '.status, .detailed-status' }`
- **Pinterest**: `{ name: "pinterest", category: "box_only", postSelector: 'div[data-test-id="pin"]' }`
- **Tumblr**: `{ name: "tumblr", category: "box_only", postSelector: 'article.post' }`
- **LinkedIn posts**: `{ name: "linkedin_post", category: "box_only", postSelector: '.feed-shared-update-v2' }`
- **TikTok**: `{ name: "tiktok", category: "title_box", headlineSelectors: ['h1[data-e2e="browse-video-desc"]'] }`
- **Facebook feed**: `{ name: "facebook_feed", category: "box_only", postSelector: 'div[role="article"]' }`

---

## Context Box Design

```
┌─────────────────────────────────────────────┐
│ 🛡 Trust Assembly Context                    │
│─────────────────────────────────────────────│
│ [Short description text here - max 280ch]    │
│                                             │
│ ▸ View full explanation                     │
│                                             │
│ Evidence:                                   │
│  • Source 1 (link)                          │
│  • Source 2 (link)                          │
│                                             │
│ Vault: 2 facts · 1 argument                │
│ Assembly: Media Watch · Approved ✓          │
│─────────────────────────────────────────────│
│ 3 assemblies have reviewed this content     │
└─────────────────────────────────────────────┘
```

- Blue left border (`#2563EB`) for `add_context`
- Red left border for corrections on title_box sites
- Green left border for affirmations
- Gray + dashed border for pending/preview
- Font inherits from surrounding content via `matchSiteTextStyle()`

---

## Implementation Order

1. **Phase 1**: Site categorization engine (content.js detectSiteType changes)
2. **Phase 6**: Server-side changes (migration, submission type, validation)
3. **Phase 3**: Adaptive popup form
4. **Phase 2**: Context box rendering & injection
5. **Phase 4**: Live preview for social sites
6. **Phase 5**: Pending submission preview
7. **Phase 9**: API client updates
8. **Phase 7**: Manual headline finder fallback
9. **Phase 8**: QA test fixtures & diagnostics

---

## Key Risks

1. **Twitter/X Shadow DOM & mutations**: Twitter aggressively rebuilds the DOM. Our MutationObserver reapply loop (lines 686-691 of content.js) already handles this for news sites. For Twitter, we'll use tweet ID anchoring and re-inject boxes when mutations remove them. Expect maintenance burden.

2. **Instagram CSP**: Instagram has strict Content Security Policy. Our injected elements are plain DOM (no scripts/styles from external sources), so CSP shouldn't block them. But aggressive cleanup scripts might remove injected elements.

3. **Reddit's multiple frontends**: old.reddit.com, new reddit (sh.reddit.com), and the redesign all have different DOM. We need selectors for at least new reddit + the redesign.

4. **Rate of DOM changes**: Social sites update their DOM structures frequently. The QA test fixtures will catch breakage, but we'll need to update selectors periodically. The manual "Find on Page" fallback (Phase 7) is the safety net.

5. **`original_headline` field change**: Making it store the site name for social submissions means existing queries that search by `original_headline` need to handle this. Since social submissions are new, this only affects future data.

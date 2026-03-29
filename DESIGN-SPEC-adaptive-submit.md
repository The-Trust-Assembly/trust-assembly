# Trust Assembly — Adaptive Submit Form Design Specification

## Overview

The submit page at trustassembly.org/submit currently displays a single article-oriented form. This redesign makes the form **URL-driven**: the user pastes a URL, the system detects the platform, and the form morphs to show the right fields, labels, and sections for that content type.

## Architecture: 5 Templates, 12+ Platforms

The form is not 12 different forms. It is **5 templates** that cover all content types on the internet, with platform-specific label changes and extra fields layered on top.

### Template 1: Article

Used by: news sites (Reuters, NYT, BBC, CNN, Fox, Guardian, WaPo, WSJ, AP, CNBC, NBC, CBS, ABC, NPR, Politico, The Hill, Daily Mail, Al Jazeera, Forbes, Bloomberg, The Atlantic), blog platforms (Medium, WordPress, Blogger, Ghost), Substack articles, LinkedIn articles, Wikipedia, .gov sites, institutional pages, news aggregators (Google News, MSN, Apple News, Flipboard when resolved to source).

**Sections shown:**
1. THE ARTICLE — URL input, Original Headline, Subtitle, Author(s)
2. REWRITE THE HEADLINE — Proposed Replacement (red pen border), Reasoning, Supporting Evidence
3. EDIT THE ARTICLE (UP TO 20) — Inline edits with Original Text / Replacement Text / Reasoning per edit
4. BUILD THE CASE — Vault entries (Standing Corrections, Arguments, Beliefs, Translations)

**Key behaviors:**
- Section 3 (inline edits) is the distinguishing feature — only article template has it
- Subtitle field is shown
- Author field supports multiple authors (up to 10)
- For Substack articles: add "Publication Name" extra field (e.g., "Astral Codex Ten" distinct from author name)
- For Medium: add "Publication" extra field from og:site_name

### Template 2: Short-form Text

Used by: X/Twitter, Facebook posts, Threads, Bluesky, Mastodon, Truth Social, Gab, Parler, Gettr, VK, Weibo, Substack Notes, Tumblr text posts, LinkedIn posts. Also used for Q&A sites (Quora, Stack Overflow) using the title+body model from Reddit. Also used for review sites (Yelp, TripAdvisor, Glassdoor, Trustpilot).

**Sections shown:**
1. THE POST/NOTE — URL input, Original Post Text (multiline textarea), Account/Author
2. CORRECT THE POST/NOTE — Corrected Version (red pen, multiline textarea), Reasoning, Supporting Evidence
3. *(hidden by default — no inline edits for short-form)*
4. BUILD THE CASE — same as article

**Key behaviors:**
- The headline field becomes a multiline textarea (the entire post IS the content)
- No subtitle field
- No inline edits section (Section 3 hidden)
- Replacement field is also multiline
- For Twitter: add "Thread Position" extra field (post N of M)
- For Substack Notes: add "Referenced Link" field (the URL the note is reacting to)
- For LinkedIn posts: add "Title/Company" field (implicit authority context)
- For Facebook: show "Private Post Warning" if import fails
- For Reddit: add "Post Type" toggle (link / text / image-video) and conditionally show inline edits for text posts

**Label variations by platform:**
| Platform | Section 1 Title | Headline Label | Author Label |
|----------|----------------|----------------|--------------|
| X/Twitter | THE POST | ORIGINAL POST TEXT * | ACCOUNT (@HANDLE) |
| Facebook | THE POST | ORIGINAL POST TEXT * | ACCOUNT |
| Substack Note | THE NOTE | ORIGINAL NOTE TEXT * | AUTHOR |
| Reddit | THE POST | POST TITLE * | USER (u/) |
| LinkedIn | THE POST | ORIGINAL POST TEXT * | AUTHOR |
| Threads/Bluesky/Mastodon | THE POST | ORIGINAL POST TEXT * | ACCOUNT (@HANDLE) |

### Template 3: Video

Used by: YouTube, TikTok, Vimeo, Dailymotion, Rumble, Bitchute, Twitch clips, Facebook/Instagram Reels (when detected by URL).

**Sections shown:**
1. THE VIDEO — URL input, Video Title/Description, Channel/Creator
2. CORRECT THE TITLE/DESCRIPTION — Proposed Replacement, Reasoning, Supporting Evidence
3. CORRECT SPOKEN CLAIMS — Transcript Excerpt, optional Timestamp, The Truth, Reasoning
4. BUILD THE CASE — same as article

**Key behaviors:**
- No subtitle field
- No inline edits — replaced by "Correct Spoken Claims" section
- Timestamp field is optional (but encouraged)
- Transcript excerpt textarea for what was said/shown

**Label variations by platform:**
| Platform | Headline Label | Author Label |
|----------|----------------|--------------|
| YouTube | VIDEO TITLE * | CHANNEL |
| TikTok | VIDEO DESCRIPTION * | CREATOR (@HANDLE) |
| Vimeo/Dailymotion/Rumble | VIDEO TITLE * | CHANNEL |

### Template 4: Audio / Podcast (NEW)

Used by: Spotify episodes, Apple Podcasts, SoundCloud, Podbean, Anchor.fm, Overcast, Pocket Casts, iHeartRadio podcasts, Stitcher, YouTube Music podcasts.

**Sections shown:**
1. THE EPISODE — URL input, Episode Title, Host/Speaker, Show/Podcast Name, Guest/Speaker, Episode Duration
2. CORRECT THE EPISODE TITLE — Proposed Replacement, Reasoning, Supporting Evidence
3. CORRECT SPOKEN CLAIMS (TRANSCRIPT REQUIRED) — Required Timestamp, Transcript Excerpt (large textarea), The Truth, Reasoning
4. BUILD THE CASE — same as article

**Key behaviors:**
- **JURY GRACE PERIOD:** This template triggers an extended jury review window (14 days). An amber notice banner appears at the top of the form and below the Submit button explaining why.
- Timestamp is REQUIRED (not optional) — audio has no visual channel, jurors must listen
- Transcript excerpt is the primary evidence mechanism — labeled as required with helper text
- "JURORS MUST LISTEN" amber callout appears inside Section 3
- Show/Podcast Name is a separate field from Episode Title (like Substack's publication vs. author)
- Guest/Speaker field identifies who made the claim (critical when guests, not hosts, make claims)
- Episode Duration field helps jurors understand the review commitment

**Unique extra fields:**
- SHOW / PODCAST NAME * (always shown)
- GUEST / SPEAKER (IF NOT THE HOST) (always shown)
- APPROXIMATE EPISODE DURATION (always shown)

### Template 5: Product / Listing (NEW)

Used by: Amazon, eBay, Walmart, Target, Best Buy, Etsy, AliExpress, Shopify product pages.

**Sections shown:**
1. THE PRODUCT — URL input, Product Name/Title, Brand/Seller, Marketplace/Retailer, Claim Category dropdown
2. CORRECT THE LISTING — Corrected Claim (red pen), Reasoning, Supporting Evidence
3. FLAG SPECIFIC CLAIMS — Exact Claim from Listing, Where on Listing (toggle bar), The Truth, Reasoning, "+ Flag another claim" button
4. BUILD THE CASE — same as article

**Key behaviors:**
- No subtitle field
- "Claim Category" dropdown with 8 options: Labeling/Certification, Specifications, Safety, Efficacy, Origin/Sourcing, Environmental, Reviews/Ratings, Other
- Selecting "Safety" triggers a red warning suggesting also reporting to CPSC/FDA/FTC
- Section 3 has a "Where on the Listing" toggle bar: Title / Description / Bullet points / Images / Specs / Reviews
- Multiple claims can be flagged independently (unlike article inline edits which are text-replacement, product claims are assertion-based)
- Tip text in Section 2 specifically mentions regulatory references, lab tests, and certification databases

## Constant Elements (All Templates)

These elements appear identically regardless of platform:

1. **Correction / Affirmation Toggle** — two-button toggle at top. Correction (red) or Affirmation (green). When Affirmation is selected, the replacement field in Section 2 is hidden and replaced with a green info box.

2. **Assembly Selection** — chip-style multi-select for assemblies (max 12). Each selected assembly shows a trust progress bar.

3. **Section 4: Build the Case** — identical across all templates. Contains:
   - Link Existing Submission button
   - Link Existing Vault Entry button
   - Propose New Vault Entries (collapsible):
     - Standing Corrections (reusable facts)
     - Arguments (reusable rhetorical/logical tools)
     - Foundational Beliefs (assembly axioms)
     - Translations (spin/jargon → plain language, assembly-wide)

4. **Submit for Review / Save Draft** buttons at bottom.

5. **Disclaimer** text about citizen responsibility.

## URL Detection Logic

Platform detection runs on the client side as the user types/pastes. Detection uses hostname matching with a debounce of ~400ms.

Priority order (first match wins):
1. Video platforms (youtube.com, youtu.be, tiktok.com, vimeo.com, dailymotion.com, rumble.com, bitchute.com)
2. Audio/Podcast platforms (open.spotify.com/episode, open.spotify.com/show, podcasts.apple.com, soundcloud.com, podbean.com, anchor.fm, overcast.fm, castbox.fm, pocketcasts.com, pod.link, iheart.com/podcast, stitcher.com, music.youtube.com+podcast)
3. Social shortform (x.com, twitter.com, threads.net, bsky.app, bsky.social, mastodon.*, truthsocial.com)
4. Substack Notes (substack.com + /note or /notes in path)
5. Substack Articles (substack.com without /note path)
6. Other social (reddit.com, facebook.com, instagram.com, pinterest.com, linkedin.com, tumblr.com)
7. E-commerce (amazon.com, ebay.com, walmart.com+/ip/, target.com+/p/, bestbuy.com+/site/, etsy.com+/listing/, aliexpress.com+/item/, shopify.com+/products/)
8. Q&A sites (quora.com, stackoverflow.com, stackexchange.com) → Reddit model
9. Blog platforms (medium.com, wordpress.com, ghost.io, blogger.com) → Article
10. News aggregators (news.google.com, msn.com, news.yahoo.com, flipboard.com, apple.news) → Article
11. Wikipedia → Article
12. Default: any URL starting with http → Article

**Import failure fallback:** If the Import button is clicked and the server-side import fails to detect the platform, the form defaults to the Article template. The user can always manually submit using the article form — it's the most general.

## UI Behavior

- **Form morph transition:** When platform detection changes, the form fades out (150ms), swaps content, and fades in. This prevents jarring layout shifts.
- **Platform badge:** After detection, a gold badge appears below the URL input showing the detected platform name and template type.
- **Accordion sections:** Numbered 1-4, collapsed by default except Section 1. Each has a chevron toggle. Section numbers use the serif font in gold (or red for correction-specific sections).
- **Red pen fields:** Replacement/correction fields have a red border (#C0392B) to visually distinguish them as the citizen's contribution vs. the original content.
- **Tip boxes:** Each template has a contextual tip at the bottom of Section 2 with platform-specific guidance.

## Design Tokens

```
Background: #FAF8F0 (warm off-white)
Card: #FFFFFF
Gold accent: #B8963E
Gold light: #B8963E22
Gold border: #B8963E55
Red (correction): #C0392B
Red light: #C0392B15
Green (affirmation): #27AE60
Green light: #27AE6015
Amber (grace period): #D4850A
Text: #1a1a1a
Muted: #888888
Subtle: #aaaaaa
Border: #e0dcd0
Input border: #d4d0c4
Cream: #f5f0e0

Fonts:
- Headings: Georgia / Newsreader (serif)
- Labels: IBM Plex Mono (monospace, uppercase, letter-spaced)
- Body: Helvetica Neue / sans-serif

Label style: font-size 10px, letter-spacing 1.5px, uppercase, color #888
```

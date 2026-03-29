# Trust Assembly — Onboarding Flow Redesign

## The Problem

The current flow is: Land on homepage → Register (name, email, password, country, state, political affiliation) → Land on a dashboard → Figure out what to do. The Learn page exists but is buried in navigation. The Submit page is article-only and assumes users already understand the system.

The new adaptive submit form accepts any URL from the internet. This changes onboarding fundamentally: the entry point is no longer "go find a news article to correct" — it's "paste something you already know is wrong." That's a much lower bar. The onboarding should match it.

## Design Principles

1. **The URL input IS the onboarding.** Don't make people learn the system before using it. Let them paste a URL and see the form come alive. Education happens in context, not in a separate Learn section.
2. **Registration should be the last barrier, not the first.** Let anonymous users fill out the entire form. Only require registration at the moment of submission. By then they've invested effort and understand the value.
3. **Teach by doing.** Every concept (assemblies, vault entries, jury review, trust scores) should be introduced at the exact moment it becomes relevant, not in a tutorial they'll skip.
4. **The first submission should feel like a win.** Even before jury review, the citizen should feel they've done something meaningful.

## The New Flow

### Stage 0: Landing Page (trustassembly.org)

The current landing page needs to lead with the action, not the explanation.

**Hero section:**

```
[Large heading, Georgia serif]
The internet has no editor.
You are the editor.

[Subheading, sans-serif, muted]
Correct misleading headlines. Flag false product claims. 
Call out misinformation — and let your fellow citizens verify it.

[Gold-bordered URL input field, prominent, centered]
PASTE A URL YOU WANT TO CORRECT
[https://...                                    ] [GO →]

[Below the input, small muted text]
News articles · YouTube videos · Tweets · Podcasts · Product listings · Reddit posts · and more
```

When the user pastes a URL and clicks GO, they are taken to /submit?url={encoded_url} and the form immediately begins importing and morphing. No registration required yet.

**Below the hero, three value propositions (not a wall of text):**

```
┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
│ CORRECT                 │  │ VERIFY                  │  │ TRUST                   │
│                         │  │                         │  │                         │
│ Submit corrections to   │  │ Fellow citizens serve   │  │ Corrections that survive│
│ misleading content      │  │ as jurors and evaluate   │  │ review become part of   │
│ anywhere on the         │  │ your evidence through    │  │ the public record —     │
│ internet.               │  │ structured deliberation. │  │ visible to everyone.    │
└─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘
```

**Social proof / recent activity:**

```
RECENTLY VERIFIED BY THE ASSEMBLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Reuters headline corrected: "Americans Spend More on Insurance..."
→ Approved by 8 jurors in The General Public · 3 days ago

Amazon product claim flagged: "100% Organic Cotton" 
→ Approved by 6 jurors in The De-Spinners · 1 day ago

[View all corrections →]
```

**Browser extension CTA (secondary, not primary):**

```
┌─────────────────────────────────────────────────────────┐
│ GET THE BROWSER EXTENSION                               │
│ See corrections on every site you visit. Submit         │
│ directly from any page. [Download for Chrome →]         │
└─────────────────────────────────────────────────────────┘
```

### Stage 1: The Submit Page (Pre-Registration)

The user arrives at /submit with their URL already populated. The form has imported the content and morphed to the right template. 

**What they see:**
- The platform badge ("YouTube Video" / "News Article" / etc.)
- Section 1 auto-populated with the title, author, etc.
- The full form available to fill out

**What's different for anonymous users:**
- The Correction/Affirmation toggle works normally
- Assembly selection is shown but defaults to "The General Public" only. A tooltip explains: "Join more assemblies after registration to submit corrections to specialized groups."
- All form sections work normally (they can fill in replacement headline, reasoning, evidence, inline edits, vault entries)
- The "Submit for Review" button says "Sign up to submit" instead, in the same style

**Contextual education (inline, not a separate page):**

Each section has a small collapsible "What is this?" helper that appears on first visit (tracked via localStorage):

- Section 1: "Identify the content you want to correct. The more accurately you describe the original, the easier it is for jurors to verify."
- Section 2: "Propose your correction and explain why the original is wrong. Strong corrections cite specific evidence."
- Section 3 (articles): "You can edit specific passages in the article body. The system finds each passage by exact text match."
- Section 4: "Vault entries are reusable across submissions. A standing correction like 'The XYZ recall was a software update' can be linked to every article that gets it wrong."

These helpers have a "Got it" dismiss button and don't reappear after dismissal.

### Stage 2: Registration Gate

When the user clicks "Sign up to submit," a modal appears over the form (the form is NOT navigated away from — their work is preserved).

**The modal:**

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  BECOME A CITIZEN                                           │
│                                                             │
│  Your correction is ready. Create an account to submit it   │
│  for jury review by your fellow citizens.                   │
│                                                             │
│  DISPLAY NAME *          │  This is your public identity.   │
│  [                    ]  │  Choose wisely — citizens see    │
│                          │  this on your submissions.       │
│  EMAIL *                                                    │
│  [                                                       ]  │
│                                                             │
│  PASSWORD *                                                 │
│  [                                                       ]  │
│                                                             │
│  ─── OPTIONAL ───────────────────────────────────────────   │
│                                                             │
│  COUNTRY                    STATE / REGION                  │
│  [United States ▼]          [Washington ▼]                  │
│                                                             │
│  These help us understand the geographic diversity          │
│  of our citizen base. Never displayed publicly.             │
│                                                             │
│  [  CREATE ACCOUNT AND SUBMIT  ]                            │
│                                                             │
│  Already a citizen? [Sign in →]                             │
│                                                             │
│  By creating an account you agree to the                    │
│  [Citizen's Charter] and [Privacy Policy].                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key changes from current registration:**
- Political affiliation field is REMOVED from registration. It's optional demographic data that creates friction and raises GDPR concerns (special category data under Article 9). If you want this data, collect it later in Account settings with proper consent.
- The modal appears over the form, not as a separate page. The user can see their filled-out submission behind the modal. This reinforces that their work isn't lost.
- The submit action is combined with registration: "CREATE ACCOUNT AND SUBMIT." One click registers AND submits the correction.
- Display name gets prominent placement with guidance about it being public.

### Stage 3: Post-Registration / First Submission Confirmation

After registration + submission, the user sees a confirmation page:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ✓ YOUR CORRECTION HAS BEEN SUBMITTED                      │
│                                                             │
│  "Tiger Woods Got Hella Drunk"                              │
│  → submitted to The General Public                          │
│                                                             │
│  WHAT HAPPENS NEXT                                          │
│  ━━━━━━━━━━━━━━━━                                          │
│                                                             │
│  1  JURY ASSIGNMENT                                         │
│     Fellow citizens will be assigned as jurors to            │
│     evaluate your correction. This usually takes            │
│     24-48 hours.                                            │
│                                                             │
│  2  DELIBERATION                                            │
│     Jurors review your evidence, vote to approve or         │
│     reject, and provide their reasoning.                    │
│                                                             │
│  3  VERDICT                                                 │
│     If approved, your correction becomes part of the        │
│     public record. You'll be notified either way.           │
│                                                             │
│  ─── YOUR CITIZEN STATUS ────────────────────────────────   │
│                                                             │
│  Trusted Contributor progress in The General Public:        │
│  ■□□□□□□□□□  1/10 consecutive approvals                     │
│  9 more to skip jury review.                                │
│                                                             │
│  ─── WHAT YOU CAN DO NOW ────────────────────────────────   │
│                                                             │
│  [Submit another correction]                                │
│  [Browse the feed — see what others have submitted]         │
│  [Get the browser extension — correct pages as you browse]  │
│  [Explore assemblies — join groups aligned with your values] │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

This page does triple duty: it confirms the submission, teaches the jury process, and introduces the next actions. The user learns about trust scores, the feed, the extension, and assemblies — all in context, all at the moment they're most engaged.

### Stage 4: The Guided Second Visit

When the user returns (recognized by their session), the experience adapts:

**If they have pending submissions:** The homepage shows a status card at the top:

```
YOUR SUBMISSIONS
━━━━━━━━━━━━━━━━
⏳ "Tiger Woods Got Hella Drunk" — awaiting jury assignment
   Submitted to The General Public · 14 hours ago
   [View details →]

[Submit another correction]
```

**If their first submission was reviewed:** Show the verdict prominently with education about what it means:

```
YOUR FIRST VERDICT IS IN
━━━━━━━━━━━━━━━━━━━━━━━
✓ APPROVED — "Tiger Woods Got Hella Drunk"
  8 jurors voted · 6 approved, 2 rejected
  Trusted Contributor: 1/10 → Now you need 9 more.
  [Read juror reasoning →]
```

or

```
✗ REJECTED — "Tiger Woods Got Hella Drunk"
  6 jurors voted · 2 approved, 4 rejected
  Trusted Contributor: reset to 0/10
  [Read juror reasoning →] [Dispute this verdict →]
  
  Don't be discouraged — rejected corrections teach you
  what the assembly values. Review the juror reasoning
  and try again with stronger evidence.
```

**Notification bell:** The header bell should show a badge for verdict notifications. This gives users a reason to come back.

### Stage 5: Assembly Discovery (Post-First-Submission)

After the first submission, the Assemblies page becomes relevant. It should be promoted but not forced:

```
FIND YOUR ASSEMBLIES
━━━━━━━━━━━━━━━━━━━━

You're currently a member of The General Public. 
Assemblies are groups of citizens with shared standards 
for truth. Each assembly has its own jury pool, its own 
trust scores, and its own vault of reusable facts.

RECOMMENDED FOR YOU                    [Browse all →]

┌──────────────────────┐  ┌──────────────────────┐
│ The Discerners       │  │ AI Watchdogs         │
│ 143 citizens         │  │ 87 citizens          │
│ Focus: media literacy│  │ Focus: AI-generated  │
│ and source quality   │  │ content detection    │
│                      │  │                      │
│ [Learn more] [Join]  │  │ [Learn more] [Join]  │
└──────────────────────┘  └──────────────────────┘
```

### Stage 6: Jury Duty Introduction

The user's first jury assignment should include inline education:

```
YOUR FIRST JURY ASSIGNMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━

You've been selected to review a fellow citizen's 
correction. This is how the assembly works — citizens 
review each other's claims through evidence and reasoning.

YOUR RESPONSIBILITIES AS A JUROR:
• Read the original content and the proposed correction
• Evaluate the evidence provided
• Vote honestly — approve if the correction is supported, 
  reject if it isn't
• Provide brief reasoning for your vote

The submitter's identity is hidden until the verdict 
is reached. This protects against bias.

TIME LIMIT: 7 days to cast your vote.

[Begin review →]
```

This only appears on the first jury assignment. Subsequent assignments skip straight to the review interface.

## Page Structure Changes

### Navigation (Simplified)

Current: Home, Submit, Review (11), Assemblies, Learn, Explore, Account

New: **Home, Submit, Review (count), Assemblies, Account**

- **Learn is removed from top nav.** Its content is distributed into contextual education throughout the app. The standalone Learn page still exists at /learn for direct links and SEO, but it's no longer a primary navigation item. New users don't need to read a manual before participating.
- **Explore is merged into Home.** The feed of recent corrections IS the explore experience. Having both is redundant.

### Homepage Behavior (Logged In vs. Anonymous)

**Anonymous:** Hero with URL input → value props → recent corrections → extension CTA

**Logged in, new user (< 3 submissions):** Your submissions status → suggested next action → recent corrections from your assemblies → assembly discovery prompt

**Logged in, established user (3+ submissions):** Your submissions status → jury assignments → feed from your assemblies → no education prompts

### /submit Route Changes

- Accepts `?url=` query parameter. If present, auto-populates and triggers import.
- Works for anonymous users (all form functionality except actual submission).
- "Submit for Review" button changes to "Sign up to submit" for anonymous users.
- Registration modal overlays the form (form state preserved).
- After registration, submission is automatically sent (no re-clicking needed).

### /learn Route (Preserved but Deprioritized)

The Learn page still exists with the accordion sections:
1. What is the Trust Assembly?
2. The deliberation process
3. Trust scoring
4. The vault
5. Vision

But it's no longer in the main nav. It's linked from:
- The footer
- The "What is this?" contextual helpers in the submit form
- The post-registration confirmation page
- The About section

## Browser Extension Onboarding Alignment

The browser extension should mirror this flow:

1. After installation, the extension popup shows: "Browse normally. When you see something wrong, click the Trust Assembly icon."
2. When the user opens the extension on a page for the first time, it detects the platform and shows: "Want to correct something on this page? [Start a correction]"
3. The Submit tab in the extension uses the same adaptive form with the same contextual education.
4. If not logged in, the extension shows a compact login/register form. After auth, it syncs with the web session.

## Email Touchpoints

### Welcome email (sent immediately after registration):
```
Subject: Welcome to the Trust Assembly, @DisplayName

Your first correction has been submitted to The General Public.

WHAT HAPPENS NEXT:
Jurors will be assigned within 24-48 hours. You'll receive 
a notification when the verdict is in.

WHILE YOU WAIT:
• Get the browser extension to see corrections everywhere
• Browse corrections from fellow citizens
• Join an assembly aligned with your interests

The Trust Assembly exists because people like you refuse 
to accept a world where misleading content goes unchallenged.

Truth will out.
```

### First verdict email:
```
Subject: Your correction has been [approved/rejected]

[If approved:]
Your correction to "[headline]" has been approved by 
[N] jurors in The General Public.

Your correction is now part of the public record. Anyone 
with the browser extension will see it on the original page.

Trusted Contributor progress: 1/10

[If rejected:]
Your correction to "[headline]" was not approved by 
the jury in The General Public.

This doesn't mean your instinct was wrong — it means the 
evidence or reasoning needs strengthening. Review the juror 
feedback and consider resubmitting.

[View juror reasoning →]
```

### First jury assignment email:
```
Subject: You've been called for jury duty

A fellow citizen has submitted a correction that needs 
your review. As a juror, you'll evaluate the evidence 
and vote on whether the correction should be approved.

You have 7 days to review and vote.

[Review now →]
```

## Conversion Funnel Metrics

Track these to measure onboarding effectiveness:

1. **Landing → URL paste rate:** What % of landing page visitors paste a URL?
2. **URL paste → form completion rate:** What % of people who paste a URL fill in at least one form field?
3. **Form completion → registration rate:** What % of people who fill the form click "Sign up to submit"?
4. **Registration → submission rate:** What % of registrations result in a completed submission? (Should be ~100% since we combine the actions)
5. **First submission → second submission rate:** What % come back and submit again?
6. **First jury assignment → vote completion rate:** What % of first-time jurors actually vote?
7. **30-day retention:** What % of registered users are active after 30 days?

The key insight: metrics 1-4 are about the onboarding funnel. Metric 5 is about whether the product delivers value. If people submit once and never return, the onboarding worked but the product didn't. If people never get past the URL paste, the landing page is the problem.

## Implementation Priority

1. **Landing page with URL input** (sends to /submit?url=) — this is the highest-leverage change
2. **Anonymous submit form** (form works without auth, gate at submission) — removes the biggest friction point
3. **Registration modal over form** (not a separate page) — preserves user investment
4. **Combined register + submit action** — one click, two outcomes
5. **Post-submission confirmation with education** — teaches the system at the moment of highest engagement
6. **Contextual "What is this?" helpers** — replaces the Learn page as primary education
7. **Status cards on homepage for returning users** — gives users a reason to come back
8. **Email touchpoints** — extends the experience beyond the browser session
9. **Jury duty first-time education** — completes the loop
10. **Assembly discovery prompt** — after the user understands the core, introduce the community layer

## Scraping and SEO Addendum

To make the site maximally readable and scrapable (per the companion question):

### robots.txt (replace current blocking config):
```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /account/

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot  
Allow: /

User-agent: PerplexityBot
Allow: /

Sitemap: https://trustassembly.org/sitemap.xml
```

### Pages that should be server-side rendered for crawlers:
- Every approved correction page (/corrections/{id})
- The feed/explore page (/feed)
- Assembly pages (/assemblies/{slug})
- The Learn page (/learn)
- Landing page (/)

### Structured data to emit on correction pages:
```json
{
  "@context": "https://schema.org",
  "@type": "ClaimReview",
  "url": "https://trustassembly.org/corrections/abc123",
  "claimReviewed": "Americans Spend More on Insurance Than Federal Income Tax",
  "author": {
    "@type": "Organization",
    "name": "Trust Assembly — The General Public",
    "url": "https://trustassembly.org"
  },
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": 1,
    "bestRating": 5,
    "worstRating": 1,
    "alternateName": "Misleading"
  },
  "itemReviewed": {
    "@type": "CreativeWork",
    "url": "https://reuters.com/economy/us-insurance-spending-2025",
    "author": { "@type": "Person", "name": "Original Author" },
    "datePublished": "2025-03-15"
  }
}
```

This is the Google-recognized format for fact-check markup. It can make Trust Assembly corrections appear as fact-check labels directly in Google Search results.

### RSS feed (/feed.xml):
Emit approved corrections as RSS items with:
- Title: the corrected headline
- Description: the reasoning summary
- Link: the correction page URL
- pubDate: the approval date
- Category: the assembly name

### Additional meta tags per correction page:
```html
<meta property="og:type" content="article" />
<meta property="og:title" content="Correction: [corrected headline]" />
<meta property="og:description" content="[reasoning summary, first 200 chars]" />
<meta property="og:image" content="[Trust Assembly branded share image]" />
<meta property="article:author" content="Trust Assembly — [assembly name]" />
<meta property="article:published_time" content="[approval date]" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@TrustAssembly" />
```

# UAT Script 02: Submission Flow

**Target:** https://trust-assembly-h3b8utunl-melvinsninkles-projects.vercel.app
**Preconditions:** Logged in as a registered user who is a member of at least one assembly

---

## Test 2.1: Navigate to Submit Screen

**Steps:**
1. Click the "Submit" or "New Submission" button/link in the navigation
2. Wait for the submission form to load

**Expected Results:**
- [ ] Submit screen loads without errors
- [ ] A multi-step form is displayed (URL input as the first step)
- [ ] No console errors

---

## Test 2.2: Create a Correction Submission

**Steps:**
1. On the Submit screen, enter a news article URL:
   `https://www.cnn.com/2024/01/15/politics/example-article`
   (or any real, accessible news article URL)
2. Wait for the headline to auto-populate (the app calls `/api/article-meta`)
3. If auto-populate fails, manually enter:
   - Original Headline: `Breaking: Major Policy Change Announced`
4. Select submission type: **Correction**
5. Enter a replacement headline:
   `Policy Adjustment Under Consideration, Not Yet Finalized`
6. Enter reasoning:
   `The original headline overstates the certainty of the policy change. Officials have only proposed it for review.`
7. Optionally add an evidence URL:
   `https://example.com/official-statement`
8. Select the target assembly (General Public or any joined assembly)
9. Submit the correction

**Expected Results:**
- [ ] Submission is created successfully
- [ ] A success message or redirect to the review/feed screen occurs
- [ ] The submission appears in the review queue or feed
- [ ] The submission status is `pending_jury` or `pending_review`
- [ ] No database transaction errors in console

---

## Test 2.3: Create an Affirmation Submission

**Steps:**
1. Navigate to the Submit screen
2. Enter a news article URL (different from Test 2.2)
3. Select submission type: **Affirmation**
4. Enter reasoning:
   `This headline accurately represents the facts of the story without sensationalism.`
5. Select target assembly
6. Submit

**Expected Results:**
- [ ] Affirmation submission is created successfully
- [ ] Status is appropriate for the assembly size
- [ ] The submission appears in the feed/queue

---

## Test 2.4: Multi-Assembly Submission

**Precondition:** User is a member of at least 2 assemblies

**Steps:**
1. Navigate to the Submit screen
2. Fill in article URL and headline details
3. Select **multiple assemblies** as targets (if the UI allows multi-select)
4. Complete the submission form
5. Submit

**Expected Results:**
- [ ] Submission is created for all selected assemblies
- [ ] Each assembly shows the submission in its review queue
- [ ] No partial failures (all-or-nothing transaction)
- [ ] No duplicate submissions created

---

## Test 2.5: Draft Auto-Save

**Steps:**
1. Navigate to the Submit screen
2. Enter a URL and partial headline information
3. Do NOT submit — instead, navigate away to another screen (e.g., Feed)
4. Navigate back to the Submit screen

**Expected Results:**
- [ ] The draft is restored with the previously entered data
- [ ] URL, headline, and any other filled fields are preserved
- [ ] A draft indicator or restore prompt may be shown

---

## Test 2.6: Submission with Inline Edits

**Steps:**
1. Navigate to Submit screen
2. Enter article URL and headline
3. Select Correction type
4. Enter replacement headline and reasoning
5. Look for an "Inline Edits" or "Body Text Corrections" section
6. Add an inline edit:
   - Original text: `sources confirm`
   - Replacement: `one unnamed source claims`
   - Reasoning: `The original implies multiple confirmed sources when only one anonymous source was cited`
7. Submit

**Expected Results:**
- [ ] Submission includes the inline edit data
- [ ] Inline edits are visible when viewing the submission details
- [ ] The inline edit fields are properly stored and displayed

---

## Test 2.7: Submission Validation

**Steps:**
1. Navigate to Submit screen
2. Try to submit with:
   - Empty URL field
   - Empty headline field
   - Empty reasoning field
3. Attempt submission at each step

**Expected Results:**
- [ ] Form validation prevents submission without required fields
- [ ] Clear validation messages indicate which fields are missing
- [ ] No server errors — validation happens client-side first

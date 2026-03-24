# UAT Script 10: Wild West Jury Rules Enforcement

**Target:** https://trust-assembly-h3b8utunl-melvinsninkles-projects.vercel.app/login
**Preconditions:** System has < 100 total users (Wild West mode active). At least 2 users in the same assembly.

---

## Test 10.1: Single Reviewer in Wild West Mode

**Steps:**
1. Log in as User A and submit a new correction
2. Log in as User B (same assembly, NOT User A)
3. Navigate to the Review screen
4. Find User A's submission and cast an approval vote

**Expected Results:**
- [ ] A single vote resolves the submission (Wild West mode = 1 reviewer)
- [ ] Submission status changes to `approved`
- [ ] The submission no longer appears in the review queue
- [ ] Submitter's streak/reputation updates

---

## Test 10.2: No Cross-Group Promotion in Wild West

**Steps:**
1. Ensure a submission was just approved in Test 10.1
2. Check the submission's final status (Feed screen, record detail, or API)
3. Open DevTools > Network tab and inspect the vote API response

**Expected Results:**
- [ ] Submission status is `approved` (NOT `cross_review`)
- [ ] No cross-group jury assignments were created
- [ ] The record stays in `approved` as a terminal state
- [ ] No "Promoted to cross-group review" message in the response or audit

---

## Test 10.3: Story Also Skips Cross-Group in Wild West

**Steps:**
1. Log in and navigate to Stories
2. Create a new story proposal (title >= 10 chars, description >= 50 chars)
3. Log in as another user in the same assembly
4. Approve the story

**Expected Results:**
- [ ] Story resolves to `approved` with a single vote
- [ ] Story does NOT transition to `cross_review`
- [ ] No cross-group jury assignments appear for the story

---

## Test 10.4: Wild West Jury Size Recorded Correctly

**Steps:**
1. Log in as User A and create a new submission
2. Open DevTools > Network tab
3. Inspect the POST `/api/submissions` response or check the submission detail

**Expected Results:**
- [ ] `jury_seats` is set to `1` (not 3, 5, 7, etc.)
- [ ] The jury pool contains org members but only 1 seat is expected
- [ ] No errors during submission creation

---

## Test 10.5: DI Submission Jury Size in Wild West

**Precondition:** A DI account exists with a linked human partner, both in the same assembly with >= 2 members

**Steps:**
1. Log in as the DI account and create a submission
2. Log in as the human partner
3. Navigate to Review and approve the DI submission (DI pre-approval step)
4. Check the resulting jury assignment

**Expected Results:**
- [ ] DI submission transitions from `di_pending` to `pending_review` (if >= 2 members) or `pending_jury`
- [ ] Jury seats set to `1` (Wild West)
- [ ] Pool size is based on total org member count (not `1 * 3`)
- [ ] No errors during DI approval flow

---

## Test 10.6: Deliberate Lie Flag Disabled in Wild West

**Steps:**
1. Log in as a reviewer for a pending submission
2. Cast a rejection vote with the "Deliberate Lie" checkbox checked
3. Check the submission after resolution

**Expected Results:**
- [ ] The vote is accepted (flag is recorded on the vote itself)
- [ ] The submission does NOT get a deception finding (disabled in Wild West)
- [ ] Submitter's `deliberate_lies` counter does NOT increment
- [ ] Submitter's streak is NOT reset due to deception

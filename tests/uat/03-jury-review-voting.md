# UAT Script 03: Jury Review & Voting

**Target:** https://trust-assembly-h3b8utunl-melvinsninkles-projects.vercel.app
**Preconditions:** At least 2 registered users in the same assembly, with at least one pending submission

---

## Test 3.1: View Review Queue

**Steps:**
1. Log in as a user who is NOT the submitter of any pending submission
2. Navigate to the Review screen
3. Check for pending submissions in the queue

**Expected Results:**
- [ ] Review screen loads without errors
- [ ] Pending submissions from the user's assemblies are listed
- [ ] Submitter identity is anonymized (not shown) for pending submissions
- [ ] Each submission shows: original headline, replacement headline, reasoning

---

## Test 3.2: Cast an Approval Vote

**Precondition:** A submission is visible in the review queue

**Steps:**
1. Click on a pending submission to view details
2. Review the original headline, replacement, and reasoning
3. Click "Approve" or the approval vote button
4. Optionally add a note: `Accurate correction, well-reasoned`
5. Submit the vote

**Expected Results:**
- [ ] Vote is recorded successfully
- [ ] The submission's vote tally updates
- [ ] The user cannot vote again on the same submission
- [ ] No transaction errors in console

---

## Test 3.3: Cast a Rejection Vote

**Steps:**
1. Find another pending submission in the review queue
2. Click "Reject" or the rejection vote button
3. Add a note: `The replacement headline introduces its own bias`
4. Submit the vote

**Expected Results:**
- [ ] Rejection vote is recorded
- [ ] Vote tally shows the rejection
- [ ] User cannot change their vote after submission

---

## Test 3.4: Verify Cannot Vote on Own Submission

**Steps:**
1. Log in as the user who created a submission in Script 02
2. Navigate to the Review screen
3. Look for your own submission

**Expected Results:**
- [ ] Your own submission either doesn't appear in the review queue, OR
- [ ] The vote buttons are disabled/hidden for your own submission
- [ ] Attempting to vote (if buttons are visible) returns an error

---

## Test 3.5: Verdict Resolution (Wild West Mode)

**Context:** In Wild West mode (small assemblies), a single vote can resolve a submission

**Steps:**
1. Ensure an assembly has few enough members for Wild West mode
2. Log in as a non-submitter member
3. Cast a vote on a pending submission

**Expected Results:**
- [ ] If Wild West mode is active, a single vote resolves the submission
- [ ] Submission status changes to `approved` or `rejected`
- [ ] The submitter's reputation/streak updates accordingly
- [ ] The verdict is visible in the audit log

---

## Test 3.6: Juror Recusal

**Steps:**
1. Find a submission in the review queue
2. Look for a "Recuse" option
3. Click recuse

**Expected Results:**
- [ ] User is removed from the jury pool for that submission
- [ ] The submission no longer appears in their review queue
- [ ] A replacement juror may be assigned (depending on pool size)

---

## Test 3.7: Review After Verdict

**Precondition:** A submission has reached a terminal state (approved/rejected)

**Steps:**
1. Navigate to the Review screen's "My Results" tab or completed section
2. Find the resolved submission

**Expected Results:**
- [ ] Resolved submissions show the final verdict
- [ ] Submitter identity is NOW revealed (no longer anonymized)
- [ ] Vote tallies and juror notes are visible
- [ ] The submission status correctly reflects the outcome

---

## Test 3.8: Deliberate Lie Flag

**Steps:**
1. Find a pending submission
2. When voting to reject, check the "Deliberate Lie" checkbox/toggle
3. Submit the rejection vote

**Expected Results:**
- [ ] The deliberate lie flag is recorded with the vote
- [ ] If the submission is ultimately rejected with lie flags, enhanced penalties may apply
- [ ] The flag is visible in the vote details after resolution

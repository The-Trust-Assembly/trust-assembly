# UAT Script 08: Stories & Cross-Group Consensus

**Target:** https://trust-assembly-h3b8utunl-melvinsninkles-projects.vercel.app
**Preconditions:** Logged in as a registered user, member of at least one assembly

---

## Test 8.1: Browse Stories

**Steps:**
1. Navigate to the Stories screen
2. View the list of available stories

**Expected Results:**
- [ ] Stories screen loads without errors
- [ ] Stories are listed with: title, description, status
- [ ] Search/filter functionality works if available
- [ ] Assembly filter is available

---

## Test 8.2: Create a New Story

**Steps:**
1. Click "Create Story" or equivalent
2. Fill in:
   - Title: `UAT Test Story — Climate Coverage`
   - Description: `Tracking how major outlets cover climate policy changes`
3. Select target assembly (optional)
4. Submit

**Expected Results:**
- [ ] Story is created successfully
- [ ] Story appears in the story list
- [ ] Story status starts as pending or active
- [ ] Creator information is associated

---

## Test 8.3: Tag a Submission to a Story

**Precondition:** A story and a submission both exist

**Steps:**
1. Navigate to the story detail view
2. Find the option to tag/link a submission
3. Select an existing submission to associate with the story
4. Confirm

**Expected Results:**
- [ ] Submission is linked to the story
- [ ] Story detail view shows the tagged submission
- [ ] The submission's detail view may reference the story

---

## Test 8.4: Vote on a Story

**Steps:**
1. Find a story in the list
2. Click approve/reject vote button
3. Submit vote

**Expected Results:**
- [ ] Vote is recorded
- [ ] Vote tally updates
- [ ] Cannot vote twice on the same story

---

## Test 8.5: Cross-Group Consensus Flow

**Context:** Approved submissions may be promoted to cross-group review

**Steps:**
1. Navigate to the Consensus screen
2. Look for submissions that have been promoted for cross-assembly review
3. If available, review and vote on a cross-group submission

**Expected Results:**
- [ ] Consensus screen loads showing cross-group submissions
- [ ] Submissions show which assemblies they originated from
- [ ] Voting on cross-group items follows the same rules as regular voting
- [ ] Final consensus status (`consensus` or `consensus_rejected`) is correctly applied

---

## Test 8.6: Dispute Filing on Approved Submission

**Precondition:** An approved submission exists that the user disagrees with

**Steps:**
1. Find an approved submission on the Review screen
2. Click "Dispute" or equivalent
3. Fill in:
   - Reasoning: `The replacement headline still contains misleading characterization`
   - Evidence URL: `https://example.com/counter-evidence`
4. Submit the dispute

**Expected Results:**
- [ ] Dispute is filed successfully
- [ ] Dispute appears in the disputes list
- [ ] A dispute jury panel may be assigned
- [ ] The original submission status is NOT immediately changed

---

## Test 8.7: Vote on a Dispute

**Precondition:** A dispute exists with pending votes

**Steps:**
1. Find the dispute (Review screen or Disputes section)
2. Cast a vote: approve the dispute (overturn original) or reject it (uphold original)
3. Submit

**Expected Results:**
- [ ] Vote is recorded on the dispute
- [ ] Dispute resolution follows jury rules
- [ ] If dispute is upheld, the original submission may be overturned

---

## Test 8.8: Concession Proposal

**Precondition:** User has a submission that was rejected by jury

**Steps:**
1. Find the rejected submission in "My Results"
2. Look for "Propose Concession" or equivalent option
3. Fill in:
   - Reasoning: `I concede the headline was too strong, but the underlying concern about accuracy remains valid`
4. Submit the concession

**Expected Results:**
- [ ] Concession proposal is created
- [ ] Other assembly members can vote on the concession
- [ ] If accepted, it may partially restore the submitter's reputation
- [ ] Concession status is tracked separately from the original submission

---

## Test 8.9: Audit Trail Verification

**Steps:**
1. Navigate to the Audit screen
2. Look for recent entries corresponding to actions taken during UAT
3. Verify entries exist for:
   - User registrations
   - Submissions created
   - Votes cast
   - Status changes
   - Disputes filed

**Expected Results:**
- [ ] All significant actions have audit entries
- [ ] Audit entries include: timestamp, actor, action type, details
- [ ] Audit log is searchable/filterable
- [ ] No gaps in the audit trail for transactional operations

# UAT Script 06: Transaction Hardening & Error Handling

**Target:** https://trust-assembly-h3b8utunl-melvinsninkles-projects.vercel.app
**Purpose:** Verify the transaction hardening changes — state machine guards, delete/patch safety, error boundaries

---

## Test 6.1: Submission Delete Safety

**Precondition:** User has created a submission that is still in `pending_review` or `pending_jury` status

**Steps:**
1. Log in as the submitter
2. Navigate to the submission detail or "My Results" area
3. Find the pending submission
4. Look for a Delete option and click it
5. Confirm deletion

**Expected Results:**
- [ ] Submission is deleted successfully
- [ ] The submission disappears from the review queue
- [ ] Associated jury assignments are cleaned up (no orphaned jury records)
- [ ] No dangling references in vault entries
- [ ] Cache is invalidated — refreshing shows the deletion persisted

---

## Test 6.2: Cannot Delete Approved/Resolved Submission

**Precondition:** A submission exists with status `approved`, `rejected`, or `consensus`

**Steps:**
1. Log in as the original submitter
2. Navigate to the resolved submission
3. Check if a Delete option exists

**Expected Results:**
- [ ] Delete option is NOT available for resolved submissions, OR
- [ ] Attempting to delete returns a clear error: cannot delete resolved submissions
- [ ] The submission remains intact
- [ ] No server 500 error

---

## Test 6.3: Submission Patch Safety (Edit Submission)

**Precondition:** User has a pending submission

**Steps:**
1. Find the pending submission
2. If an edit option exists, modify:
   - Replacement headline text
   - Reasoning text
3. Save changes

**Expected Results:**
- [ ] Changes are saved within a transaction
- [ ] Updated content appears immediately (cache invalidation)
- [ ] If editing is not allowed for the current status, a clear message is shown
- [ ] No partial updates (all-or-nothing)

---

## Test 6.4: State Machine — Invalid Transition Blocked

**Steps:**
1. Open browser DevTools > Network tab
2. Find a submission that is in `approved` status
3. Attempt to manually call the API to transition it back to `pending_review`:
   ```
   fetch('/api/submissions/<id>', {
     method: 'PATCH',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ status: 'pending_review' })
   })
   ```

**Expected Results:**
- [ ] The API rejects the invalid state transition
- [ ] Response includes an error message about invalid transition
- [ ] Submission status remains `approved`
- [ ] No database corruption

---

## Test 6.5: Double Vote Prevention

**Steps:**
1. Log in as a jury member for a pending submission
2. Cast a vote (approve or reject)
3. Attempt to vote again on the same submission (try clicking vote button again)
4. Alternatively, use DevTools to replay the vote API call

**Expected Results:**
- [ ] Second vote is rejected
- [ ] Clear error message: already voted
- [ ] Only one vote is recorded in the tally
- [ ] No duplicate vote records created

---

## Test 6.6: Concurrent Submission — No Race Condition

**Steps:**
1. Open two browser tabs, both logged in as the same user
2. Navigate to the Submit screen in both tabs
3. Fill in different article URLs in each tab
4. Submit both simultaneously (click Submit in rapid succession)

**Expected Results:**
- [ ] Both submissions are created as separate entries, OR
- [ ] If rate-limited, one succeeds and the other gets a clear rate-limit message
- [ ] No duplicate submissions for the same article
- [ ] No database transaction deadlock errors
- [ ] No 500 errors

---

## Test 6.7: Network Error Recovery

**Steps:**
1. Navigate to the Submit screen and fill in a submission
2. Open DevTools > Network tab
3. Throttle to "Offline" mode
4. Click Submit
5. Observe the error handling
6. Switch back to "Online" mode
7. Try submitting again

**Expected Results:**
- [ ] A user-friendly error message is shown (not a raw exception)
- [ ] The draft/form data is preserved (not lost)
- [ ] Resubmitting after reconnection works
- [ ] No duplicate submissions created from retries

---

## Test 6.8: Multi-Org Vault Transaction Integrity

**Precondition:** User is a member of 3+ assemblies

**Steps:**
1. Navigate to Vault
2. Create a new vault entry targeting 3 assemblies simultaneously
3. After creation, check each assembly's vault

**Expected Results:**
- [ ] The entry appears in ALL 3 assemblies' vaults
- [ ] No partial creation (e.g., entry in 2 of 3 assemblies)
- [ ] Entry IDs and content are consistent across assemblies
- [ ] Deleting the entry removes it from all assemblies

---

## Test 6.9: Error Boundary — Malformed Data

**Steps:**
1. Open DevTools > Console
2. Navigate through all major screens:
   - Feed
   - Submit
   - Review
   - Vault
   - Assemblies
   - Profile
   - Audit
3. Monitor for unhandled exceptions

**Expected Results:**
- [ ] No unhandled promise rejections
- [ ] No "Cannot read property of undefined" errors
- [ ] No blank/white screens (error boundaries catch rendering errors)
- [ ] All screens render content or appropriate empty states

---

## Test 6.10: API Error Responses Are Structured

**Steps:**
1. Open DevTools > Network tab
2. Perform various actions and filter for failed API calls (4xx, 5xx)
3. Inspect the response bodies of any error responses

**Expected Results:**
- [ ] All error responses return JSON (not HTML error pages)
- [ ] Error responses include a human-readable `error` or `message` field
- [ ] No stack traces leaked to the client in production
- [ ] HTTP status codes are appropriate (400 for validation, 401 for auth, 403 for forbidden, 404 for not found, 409 for conflicts)

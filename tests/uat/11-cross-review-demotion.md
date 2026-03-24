# UAT Script 11: Cross-Review Demotion Repair

**Target:** https://trust-assembly-h3b8utunl-melvinsninkles-projects.vercel.app/admin/system-health
**Preconditions:** Logged in as admin (@thekingofamerica). System may have submissions/stories stuck in `cross_review` from before the Wild West fix.

---

## Test 11.1: Run Repair Data and Verify Demotion

**Steps:**
1. Navigate to the Admin Dashboard (System Health page)
2. Scroll to the Admin Tools section
3. Click "Repair Historical Data"
4. Wait for the repair to complete
5. Read the repair report output

**Expected Results:**
- [ ] Repair completes without errors (green border on result)
- [ ] Report includes a section: "--- Demote Wild-West cross_review to approved ---"
- [ ] Any submissions previously in `cross_review` show as `OK: Submission <id>... demoted to approved`
- [ ] Any stories previously in `cross_review` show as `OK: Story <id>... demoted to approved`
- [ ] Final summary line shows count of demoted records

---

## Test 11.2: Verify Demoted Submissions Are Approved

**Steps:**
1. After running repair in Test 11.1, navigate to the Feed or Audit screen
2. Find any submission that was listed as demoted in the repair report
3. Check its current status

**Expected Results:**
- [ ] Submission status is `approved` (not `cross_review`)
- [ ] The submission no longer appears in the Review queue
- [ ] The submission's cross-group jury info is cleared (no cross-group jurors listed)

---

## Test 11.3: No Cross-Group Jury Assignments Remain

**Steps:**
1. Open DevTools > Network tab
2. Navigate to `/api/reviews/queue` and inspect the response
3. Search the response for any `role: "cross_group"` entries

**Expected Results:**
- [ ] No submissions with `cross_review` status appear in the queue
- [ ] No `cross_group` jury assignments tied to demoted submissions
- [ ] Review queue only shows `pending_review` items (in-group)

---

## Test 11.4: Repair Is Idempotent

**Steps:**
1. Click "Repair Historical Data" a second time
2. Read the repair report

**Expected Results:**
- [ ] Report shows "Demoted 0 submission(s) and 0 story(s) from cross_review"
- [ ] No errors or false positives
- [ ] `totalRepaired` does not increment for the demotion step

---

## Test 11.5: Audit Trail Records Demotions

**Steps:**
1. Navigate to the Ledger/Audit screen
2. Search for recent entries mentioning "demoted" or "Wild West"

**Expected Results:**
- [ ] Each demoted submission has an audit entry: "Admin repair: demoted cross_review to approved (Wild West)"
- [ ] Each demoted story has a corresponding audit entry
- [ ] The "Admin: data repair completed" entry shows the total count

# UAT Script 07: Profile & Reputation

**Target:** https://trust-assembly-h3b8utunl-melvinsninkles-projects.vercel.app
**Preconditions:** Logged in as a user with some submission and voting history

---

## Test 7.1: View Own Profile

**Steps:**
1. Navigate to the Profile screen (often via avatar or username in nav)
2. Review the displayed information

**Expected Results:**
- [ ] Profile loads without errors
- [ ] Displays: username, display name, trust score, profile tier
- [ ] Shows: total wins, total losses, current streak
- [ ] Dispute statistics are visible (if any)
- [ ] Assembly memberships are listed

---

## Test 7.2: Edit Profile Information

**Steps:**
1. On the Profile screen, click Edit or find editable fields
2. Update the display name to `UAT Tester Updated`
3. Save changes

**Expected Results:**
- [ ] Changes save successfully
- [ ] Updated display name appears immediately throughout the UI
- [ ] Profile reflects the new information after page refresh
- [ ] No stale cached data

---

## Test 7.3: Citizen Lookup

**Steps:**
1. Navigate to the Citizen Lookup screen
2. Search for another user's username (e.g., any known test account)

**Expected Results:**
- [ ] Search returns results
- [ ] Public profile information is displayed
- [ ] Trust score and profile tier are visible
- [ ] Private information (email, etc.) is NOT exposed

---

## Test 7.4: Reputation After Approved Submission

**Precondition:** User has had a submission approved by jury

**Steps:**
1. Check the user's profile before a submission verdict
2. After a submission is approved, refresh the profile

**Expected Results:**
- [ ] Win count increments by 1
- [ ] Streak increments (if previous result was also a win)
- [ ] Trust score may update
- [ ] Profile tier may change if threshold is crossed

---

## Test 7.5: Reputation After Rejected Submission

**Precondition:** User has had a submission rejected by jury

**Steps:**
1. After a submission is rejected, check the user's profile

**Expected Results:**
- [ ] Loss count increments by 1
- [ ] Streak resets to 0 (if previous was a win streak)
- [ ] Trust score reflects the loss
- [ ] Changes are reflected immediately (no stale cache)

---

## Test 7.6: Trusted Contributor Status

**Context:** Users with 10+ consecutive approved submissions gain trusted status

**Steps:**
1. Check if a user with a high streak has a "Trusted Contributor" indicator
2. Observe if their submissions skip jury review

**Expected Results:**
- [ ] Trusted status is visually indicated on profile
- [ ] Submissions from trusted contributors may auto-approve
- [ ] Trust progress indicator shows current streak vs. threshold

---

## Test 7.7: Badge Display

**Precondition:** User has been awarded badges (via admin or system)

**Steps:**
1. Navigate to the user's profile
2. Look for badge/achievement section

**Expected Results:**
- [ ] Badges are displayed with icons/labels
- [ ] Badge descriptions explain what they represent
- [ ] Recently earned badges may be highlighted

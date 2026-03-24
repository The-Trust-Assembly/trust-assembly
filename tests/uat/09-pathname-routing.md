# UAT Script 09: Pathname Routing Migration

**Target:** https://trust-assembly-h3b8utunl-melvinsninkles-projects.vercel.app/login
**Preconditions:** At least 1 registered user

---

## Test 9.1: Clean URL Navigation

**Steps:**
1. Log in as any registered user
2. Click "Home" in the navigation bar
3. Observe the browser URL bar
4. Click "Submit", "Review", "Assemblies" in sequence, checking the URL each time

**Expected Results:**
- [ ] URL shows `/feed` (not `/#feed` or `#feed`)
- [ ] URL shows `/submit` when on the submit screen
- [ ] URL shows `/review` when on the review screen
- [ ] URL shows `/orgs` when on the assemblies screen
- [ ] No `#` fragment appears in any URL

---

## Test 9.2: Dropdown Menu Navigation

**Steps:**
1. Click the "Learn" dropdown in the nav bar
2. Click "Guide"
3. Check the URL
4. Click the "Explore" dropdown and click "Vaults"
5. Check the URL

**Expected Results:**
- [ ] URL shows `/guide` after clicking Guide
- [ ] URL shows `/vault` after clicking Vaults
- [ ] No hash fragments in the URL
- [ ] Dropdown closes after selection

---

## Test 9.3: Browser Back/Forward

**Steps:**
1. Navigate: Feed → Submit → Review → Assemblies
2. Click the browser Back button three times
3. Click the browser Forward button twice

**Expected Results:**
- [ ] Back returns to Review, then Submit, then Feed in correct order
- [ ] Forward returns to Submit, then Review
- [ ] URL updates correctly at each step (e.g., `/feed`, `/submit`, `/review`)
- [ ] No blank screens or errors during navigation

---

## Test 9.4: Page Refresh Preserves Screen

**Steps:**
1. Navigate to the Review screen
2. Confirm the URL shows `/review`
3. Press F5 or Ctrl+R to hard refresh the page
4. Wait for the page to reload

**Expected Results:**
- [ ] After refresh, the Review screen loads (not Feed or Login)
- [ ] URL remains `/review`
- [ ] User session is preserved (still logged in)
- [ ] No redirect to `/` or `/login`

---

## Test 9.5: Deep Link — Direct URL Entry

**Steps:**
1. Log out (or open an incognito window and log in)
2. Paste directly into the URL bar: `<target>/review`
3. After login (if needed), observe which screen loads

**Expected Results:**
- [ ] The Review screen loads directly (deep link preserved through login)
- [ ] URL remains `/review` after load
- [ ] No redirect to `/feed` or other default screen

---

## Test 9.6: Citizen Profile Deep Link

**Steps:**
1. Navigate to the Feed screen
2. Click on any citizen/user link to view their profile
3. Observe the URL

**Expected Results:**
- [ ] URL shows `/citizen/<username>` (not `#citizen/<username>`)
- [ ] Refreshing the page reloads the citizen profile
- [ ] Browser Back returns to the Feed

---

## Test 9.7: Record Deep Link & Copy Link

**Steps:**
1. Navigate to the Feed screen
2. Find any submission and click "Copy Link"
3. Paste the copied URL into a new browser tab
4. Navigate to it

**Expected Results:**
- [ ] Copied URL format is `<origin>/record/<id>` (not `#record/<id>`)
- [ ] Pasting the URL into a new tab opens the correct record
- [ ] Record detail panel loads with correct submission data

---

## Test 9.8: Mobile Menu Navigation

**Steps:**
1. Resize browser window to mobile width (< 768px) or use DevTools device emulation
2. Open the hamburger/mobile menu
3. Tap "Submit"
4. Check the URL

**Expected Results:**
- [ ] URL shows `/submit` (no hash)
- [ ] Mobile menu closes after selection
- [ ] Screen renders correctly at mobile width

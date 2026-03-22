# UAT Script 04: Vault Operations

**Target:** https://trust-assembly-h3b8utunl-melvinsninkles-projects.vercel.app
**Preconditions:** Logged in as a registered user with at least one approved submission

---

## Test 4.1: Browse Vault Screen

**Steps:**
1. Navigate to the Vault screen from the main navigation
2. Observe the available tabs: Corrections (Standing Corrections), Arguments, Beliefs, Translations

**Expected Results:**
- [ ] Vault screen loads without errors
- [ ] Tab navigation works between all vault types
- [ ] If entries exist, they display with: assertion/content, submitter, creation date
- [ ] Assembly filter/label is visible (General Public vs custom assemblies)

---

## Test 4.2: Create a Standing Correction (Vault Entry)

**Precondition:** User has at least one approved submission to link

**Steps:**
1. On the Vault screen, find the option to create a new vault entry
2. Select type: **Standing Correction** (vault)
3. Fill in:
   - Assertion: `CNN consistently uses "breaking news" for non-breaking stories`
   - Evidence: `Pattern observed across 5+ articles in January 2026`
4. Select target assembly: General Public
5. Link to an existing approved submission (if the UI supports it)
6. Submit

**Expected Results:**
- [ ] Vault entry is created successfully
- [ ] Entry appears in the Standing Corrections tab
- [ ] Assembly label is correctly shown
- [ ] No transaction errors

---

## Test 4.3: Create an Argument Entry

**Steps:**
1. Create a new vault entry with type: **Argument**
2. Fill in:
   - Content: `Headlines should not use certainty language ("will", "confirms") for unverified claims`
3. Select target assembly
4. Submit

**Expected Results:**
- [ ] Argument entry is created
- [ ] Entry appears in the Arguments tab
- [ ] Content is displayed correctly

---

## Test 4.4: Create a Belief Entry

**Steps:**
1. Create a new vault entry with type: **Belief**
2. Fill in:
   - Content: `Media outlets have an obligation to distinguish between opinion and reporting in headlines`
3. Select target assembly
4. Submit

**Expected Results:**
- [ ] Belief entry is created
- [ ] Entry appears in the Beliefs tab

---

## Test 4.5: Create a Translation Entry

**Steps:**
1. Create a new vault entry with type: **Translation**
2. Fill in:
   - Original: `Sources say`
   - Translated: `An unnamed person claims`
   - Translation Type: **Clarity** (or propaganda/euphemism/satirical)
3. Select target assembly
4. Submit

**Expected Results:**
- [ ] Translation entry is created
- [ ] Entry shows original and translated text side-by-side
- [ ] Translation type label is displayed

---

## Test 4.6: Multi-Assembly Vault Entry

**Precondition:** User is a member of at least 2 assemblies

**Steps:**
1. Create a new vault entry
2. Select **multiple assemblies** as targets
3. Submit

**Expected Results:**
- [ ] Entry is created for all selected assemblies
- [ ] Entry appears when filtering by each selected assembly
- [ ] No partial creation (transaction integrity)
- [ ] No duplicate entries

---

## Test 4.7: Delete a Vault Entry

**Steps:**
1. Find a vault entry you created
2. Click the delete/remove option
3. Confirm deletion if prompted

**Expected Results:**
- [ ] Entry is deleted successfully
- [ ] Entry no longer appears in the vault list
- [ ] No orphaned references remain
- [ ] Deletion is reflected immediately (cache invalidation)

---

## Test 4.8: Edit a Vault Entry

**Steps:**
1. Find a vault entry you created
2. Click edit
3. Modify the assertion/content text
4. Save changes

**Expected Results:**
- [ ] Changes are saved successfully
- [ ] Updated content is displayed immediately
- [ ] No stale data shown (TanStack Query cache is invalidated)

# UAT Script 05: Assembly Management

**Target:** https://trust-assembly-h3b8utunl-melvinsninkles-projects.vercel.app
**Preconditions:** Logged in as a registered user

---

## Test 5.1: Browse Assemblies

**Steps:**
1. Navigate to the Assemblies/Organizations screen
2. View the list of available assemblies

**Expected Results:**
- [ ] Assembly list loads without errors
- [ ] Each assembly shows: name, description, member count, creation date
- [ ] Sort/search functionality works (by activity, member count, etc.)
- [ ] "General Public" assembly is always present

---

## Test 5.2: Create a New Assembly

**Steps:**
1. Click "Create Assembly" or equivalent button
2. Fill in:
   - Name: `UAT Test Assembly` (minimum 3 characters)
   - Description: `Assembly created during UAT testing`
   - Charter: `This assembly evaluates headlines for factual accuracy without political bias`
3. Submit

**Expected Results:**
- [ ] Assembly is created successfully
- [ ] Creator is automatically a member
- [ ] Assembly appears in the browse list
- [ ] Assembly detail view shows correct information

---

## Test 5.3: Join an Assembly

**Steps:**
1. Find an assembly the user is NOT a member of
2. Click "Join" or "Request to Join"
3. Complete any application form if required

**Expected Results:**
- [ ] Join request is submitted or user is immediately added
- [ ] The user's assembly membership list updates
- [ ] If approval is required, the request shows as pending

---

## Test 5.4: Follow an Assembly

**Steps:**
1. Find an assembly the user is NOT a member of
2. Click "Follow" (if available as separate from Join)

**Expected Results:**
- [ ] Follow action succeeds
- [ ] Assembly's activity may appear in the user's feed
- [ ] User is NOT a voting member (distinct from joining)

---

## Test 5.5: Leave an Assembly

**Precondition:** User is a member of a non-General-Public assembly

**Steps:**
1. Navigate to assembly details for a joined assembly
2. Click "Leave" or equivalent
3. Confirm if prompted

**Expected Results:**
- [ ] User is removed from the assembly
- [ ] Assembly no longer appears in user's memberships
- [ ] User can no longer vote on submissions in that assembly
- [ ] Member count decrements

---

## Test 5.6: Assembly Creation Limit

**Steps:**
1. Note: The system limits users to 12 assemblies
2. If feasible, attempt to create assemblies up to the limit
3. Try creating one more beyond the limit

**Expected Results:**
- [ ] An error message indicates the maximum has been reached
- [ ] No assembly is created beyond the limit
- [ ] Error is user-friendly, not a raw server error

---

## Test 5.7: View Assembly Members

**Steps:**
1. Navigate to assembly detail view for an assembly with members
2. Find the members list/section

**Expected Results:**
- [ ] Member list is displayed
- [ ] Each member shows username and/or display name
- [ ] Reputation or role information may be shown
- [ ] The current user is listed if they are a member

---

## Test 5.8: Assembly Name Validation

**Steps:**
1. Try creating an assembly with:
   - Name less than 3 characters (e.g., `AB`)
   - Empty description
   - Empty charter

**Expected Results:**
- [ ] Validation prevents creation with too-short name
- [ ] Clear error messages for missing required fields
- [ ] No server errors — validation is handled gracefully

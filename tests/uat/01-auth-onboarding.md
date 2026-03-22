# UAT Script 01: Authentication & Onboarding

**Target:** https://trust-assembly-h3b8utunl-melvinsninkles-projects.vercel.app/#login
**Preconditions:** No active session (clear cookies if needed)

---

## Test 1.1: New User Registration

**Steps:**
1. Navigate to the target URL
2. Look for a "Register" or "Sign Up" link/button on the login screen and click it
3. Fill in the registration form with:
   - Username: `uat_tester_01` (append timestamp if taken)
   - Display Name: `UAT Tester One`
   - Email: `uat01@test.example.com`
   - Password: `UatTest2026!`
   - Gender: any option
   - Age: `30`
   - Country: `United States`
   - Political Affiliation: any option
4. Submit the registration form

**Expected Results:**
- [ ] Registration succeeds without errors
- [ ] User is redirected to the main app (Feed screen or Onboarding flow)
- [ ] No console errors related to database transactions
- [ ] The user is automatically logged in after registration

---

## Test 1.2: Logout

**Precondition:** Logged in as the user from Test 1.1

**Steps:**
1. Find and click the logout button/link (check profile menu, settings, or navigation)
2. Confirm logout if prompted

**Expected Results:**
- [ ] User is redirected to the login screen
- [ ] Navigating to a protected screen redirects back to login
- [ ] No error messages displayed

---

## Test 1.3: Login with Existing Account

**Steps:**
1. On the login screen, enter:
   - Username: `uat_tester_01` (the account created in Test 1.1)
   - Password: `UatTest2026!`
2. Click the Login button

**Expected Results:**
- [ ] Login succeeds without errors
- [ ] User is redirected to the main app
- [ ] User profile/display name appears correctly in the UI
- [ ] The session cookie is set (check via DevTools > Application > Cookies)

---

## Test 1.4: Session Persistence

**Precondition:** Logged in from Test 1.3

**Steps:**
1. Refresh the page (F5 or Ctrl+R)
2. Wait for the app to fully load

**Expected Results:**
- [ ] User remains logged in after page refresh
- [ ] Profile information is correctly restored
- [ ] No flash of login screen before redirect

---

## Test 1.5: Login with Invalid Credentials

**Steps:**
1. Log out if currently logged in
2. On the login screen, enter:
   - Username: `uat_tester_01`
   - Password: `WrongPassword123!`
3. Click Login

**Expected Results:**
- [ ] Login is rejected with a clear error message
- [ ] No unhandled exceptions or console errors
- [ ] User remains on the login screen

---

## Test 1.6: Rate Limiting on Login

**Steps:**
1. Attempt to login with wrong credentials 6 times rapidly (within 1 minute)

**Expected Results:**
- [ ] After ~5 failed attempts, a rate limit message is displayed
- [ ] The message indicates the user should wait before retrying
- [ ] No server error (500) is returned — should be a 429 or friendly message

---

## Test 1.7: Auto-Join General Public Assembly

**Precondition:** Logged in as user from Test 1.1

**Steps:**
1. Navigate to the Assemblies/Organizations screen
2. Look for "General Public" assembly in the user's memberships

**Expected Results:**
- [ ] The user is automatically a member of the "General Public" assembly
- [ ] No manual action was needed to join
- [ ] The assembly shows at least 1 member (the test user)

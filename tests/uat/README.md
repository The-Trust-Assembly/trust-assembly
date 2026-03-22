# Trust Assembly - UAT Scripts

These scripts are designed to be executed by the Claude Chrome Extension against the Vercel preview deployment.

**Target URL:** `https://trust-assembly-h3b8utunl-melvinsninkles-projects.vercel.app/#login`

## Script Index

| Script | File | Covers |
|--------|------|--------|
| 01 - Auth & Onboarding | `01-auth-onboarding.md` | Registration, login, logout, session persistence |
| 02 - Submission Flow | `02-submission-flow.md` | Creating corrections/affirmations, draft save, multi-assembly |
| 03 - Jury Review & Voting | `03-jury-review-voting.md` | Review queue, casting votes, verdict resolution |
| 04 - Vault Operations | `04-vault-operations.md` | Creating/browsing vault entries, multi-org vault |
| 05 - Assembly Management | `05-assembly-management.md` | Create/join/leave assemblies, member management |
| 06 - Transaction Hardening | `06-transaction-hardening.md` | Delete/patch safety, state machine guards, error handling |
| 07 - Profile & Reputation | `07-profile-reputation.md` | Profile display, trust scores, streak tracking |
| 08 - Stories & Consensus | `08-stories-consensus.md` | Story creation, cross-group review |

## How to Run

1. Open the target URL in Chrome with the Claude extension active
2. Paste the contents of a script file into the Claude extension
3. The extension will walk through each test case, reporting PASS/FAIL
4. Review results and report any failures

## Test Accounts

Scripts assume you can register fresh test accounts. Use the pattern:
- Username: `uat_tester_<timestamp>`
- Password: `UatTest2026!`

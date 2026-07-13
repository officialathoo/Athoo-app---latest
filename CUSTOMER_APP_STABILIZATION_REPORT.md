# Athoo Customer App Stabilization

## Corrections

- Corrected API migration health expectation to `20260713_broadcast_request_idempotency.sql`.
- Restored the shared `CustomerHomeSkeleton` and removed the ad-hoc dark loading card.
- Home skeleton displays only on the first load of the current JavaScript session, not each tab return.
- Prevented stale Android notification responses from redirecting a user after manual login.
- Retained one-owner cold-start notification handling for genuine notification launches.
- Added a short authenticated-navigation settling window after login/session restoration.
- Increased Invite Friends card inner spacing and separation from edges.
- Kept light-mode service cards on a white professional surface with readable text.
- Made broadcast provider matching, sockets, admin events, and push delivery best-effort after the database insert.
- Prevented notification delivery failures from changing a successfully-created broadcast into HTTP 500.
- Added safe recovery for concurrent duplicate broadcast submissions.

## Validation performed

- API source syntax checks passed for the changed backend files.
- Full API test suite: 209 passed, 0 failed.
- Customer experience design checks passed.
- Mobile hardening and notification navigation checks passed.

## Required local verification

Run from the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm check:project
pnpm typecheck
pnpm test
pnpm build
pnpm db:verify
pnpm db:integrity
pnpm mobile:doctor
pnpm mobile:validate
```

Deploy the API before rebuilding the APK. A previously-installed APK does not contain these changes.

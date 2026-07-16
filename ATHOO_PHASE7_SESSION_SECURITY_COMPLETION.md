# Athoo Phase 7 — Session Governance, Biometric Lock and Startup Stability

## Baseline

Source baseline: `ATHOO_PHASE6_ADMIN_OPERATIONS_FIXED.zip`

Output baseline: `ATHOO_PHASE7_SESSION_SECURITY_FIXED.zip`

## Goal

Make authentication production-safe and predictable across customer, provider and admin experiences, with exactly one active device per account, reliable sign-out/restart behavior, a real biometric lock for remembered mobile sessions, and a single navigation owner.

## Root causes confirmed

1. Login created additional database sessions instead of replacing older sessions.
2. Sessions were not bound to a stable installation/device identifier.
3. New-device detection relied mainly on user-agent strings, which cannot distinguish similar phones.
4. Existing biometric logic was contradictory: startup automatically restored the session before biometric authentication, while explicit logout deleted the token biometric restoration depended on.
5. Logout, role layouts, welcome/login screens and the root index could all initiate navigation, creating repeated redirects and welcome-screen blinking.
6. TanStack Query caches and realtime state were not comprehensively cleared during logout.
7. Revoked sessions could retain already-open WebSocket event/call connections until another API request failed.
8. Purpose tokens did not carry device identity, which would have broken realtime/object access after device binding.
9. Logout could revoke a session before the separate push-token cleanup completed.

## Completed implementation

### Single-device session policy

- Exactly one active database session is allowed per account.
- Concurrent login attempts are serialized with a PostgreSQL transaction advisory lock.
- Every successful new login revokes prior active sessions with `replaced_by_new_login`.
- A partial unique database index enforces one non-revoked session per user.
- The previous device's Expo push-token ownership is cleared before the new session is created.
- Refresh tokens are rejected and revoked when used from a different device identity.
- HTTP middleware returns `SESSION_REVOKED` for replaced/expired sessions.

### Stable device identity

- Mobile creates and stores a stable `athoo_device_id` in secure device storage.
- Mobile API, refresh, push-token and storage requests send `X-Athoo-Device-Id`.
- Admin web creates a stable `athoo_admin_device_id` and sends it for login, refresh, API, realtime and protected-file requests.
- Login history stores device identity and displays a device column in the admin panel.
- New-device security alerts deduplicate using the real device ID, with legacy user-agent fallback.

### Realtime and call session revocation

- Event and call WebSockets register against their authenticated session ID.
- New login, logout, logout-all and security revocation immediately close affected sockets.
- A 25-second database heartbeat also detects revocation across multiple API instances.
- Device identity is embedded in short-lived realtime/object-read purpose tokens.
- The mobile realtime client treats close code `4401` as session revocation, stops reconnecting and clears the local session.

### Real biometric session lock

- Remembered mobile sessions remain encrypted in Expo SecureStore.
- When biometric login is enabled, startup remains locked until Face ID, Touch ID, fingerprint or iris succeeds.
- Device PIN/passcode fallback remains disabled for the biometric action.
- The app relocks after the configured background interval (`EXPO_PUBLIC_BIOMETRIC_RELOCK_SECONDS`, default 300 seconds).
- Realtime connections stop while the app is biometric-locked and restart after successful unlock.
- Explicit logout remains a complete logout and disables quick biometric restoration.

### Logout and startup stability

- Logout is idempotent; repeated taps share one in-flight operation.
- Local authentication state, secure tokens, cached user profile, notification token sync, realtime connection and TanStack Query cache are cleared exactly once.
- The server logout endpoint clears Expo push ownership before revoking the session.
- Remote logout is bounded to four seconds and cannot block local sign-out.
- One root `SessionRouteGuard` now owns authenticated, unauthenticated, biometric-lock and role transitions.
- Competing redirects were removed from customer/provider layouts, root index, login, welcome and AuthContext role switching.

## Database migration

Apply:

`deploy/migrations/20260716_user_session_device_biometric_integrity.sql`

It adds:

- `auth_sessions.device_id`
- `login_history.device_id`
- device lookup indexes
- migration-time revocation of duplicate active sessions
- `auth_sessions_one_active_per_user_idx`, enforcing one active session per account

The authoritative latest migration is now:

`20260716_user_session_device_biometric_integrity.sql`

## Validation completed

- Phase 7 targeted checks: 10/10 passed.
- Complete API/source regression suite: 416/416 passed.
- Changed TypeScript/TSX syntax validation: 30/30 passed.
- Project JSON validation passed.
- Security scan passed.
- React Native style validation passed.
- Expo workspace validation passed.
- Mobile release validation passed.
- Release configuration check passed.

## Connected deployment sequence

1. Back up Neon.
2. Run `pnpm db:migrate`.
3. Run `pnpm db:status`, `pnpm db:verify` and `pnpm db:integrity`.
4. Deploy the API to Render.
5. Deploy the admin panel to Vercel.
6. Build fresh Android and iOS apps with the Phase 7 source.
7. Confirm `EXPO_PUBLIC_BIOMETRIC_RELOCK_SECONDS` is set as required, or accept the safe 300-second default.

## Required real-device acceptance

Using the Android phone and iPhone:

1. Sign in to the same account on Android, then sign in on iPhone. Android must be automatically logged out and must stop receiving private notifications.
2. Repeat in the opposite direction.
3. Keep chat/call WebSockets open during replacement; the old device must exit without an infinite reconnect loop.
4. Enable biometric login, close/reopen the app, and confirm no customer/provider data appears before biometric success.
5. Background longer than the relock interval and confirm biometric lock on return.
6. Cancel/ fail biometrics and confirm OTP/password remains available.
7. Explicitly log out, reopen the app and confirm no blinking, stale home screen, cached account data or biometric quick login remains.
8. Switch customer/provider role and confirm exactly one transition to the correct home.
9. Open protected screenshots/documents from mobile and admin after login to confirm device-bound access remains functional.
10. Review Login History in admin and confirm device IDs appear for new authentication events.

## Honest limitation

The clean source ZIP intentionally excludes dependencies, and this environment cannot perform connected Neon/Render/Vercel/R2 operations or physical Android/iPhone tests. Full dependency-aware `pnpm typecheck`, production builds and connected acceptance remain mandatory before production approval.

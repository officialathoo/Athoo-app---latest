# Athoo Phase 15 — Session Migration Repair

**Input baseline:** `ATHOO_PHASE14_MOBILE_UPLOAD_TYPECHECK_FIXED.zip`

## Failure

`20260716_user_session_device_biometric_integrity.sql` revoked duplicate sessions only when `expires_at > now()`, but the unique index applied to all rows with `revoked_at IS NULL`. Expired, unrevoked duplicates therefore caused `auth_sessions_one_active_per_user_idx` creation to fail.

## Fix

The migration now ranks every unrevoked session per user, keeps the newest row, and revokes every older row before creating the partial unique index.

Historical rows remain in `auth_sessions`; no rows are deleted.

## Verification

- Session governance targeted suite: 10/10 passed
- Complete source regression suite: 452/452 passed

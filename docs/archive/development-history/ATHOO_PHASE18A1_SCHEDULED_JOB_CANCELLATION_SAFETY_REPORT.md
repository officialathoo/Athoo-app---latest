# ATHOO Phase 18A1 — Scheduled Job Cancellation Safety

Date: 2026-08-01
Source baseline: `ATHOO_PHASE17_BROADCAST_RESPONSE_SCALING_FIXED.zip`

## Fixed

- Disabled automatic cancellation merely because an accepted booking has not been marked arrived. The production default is now `BOOKING_NO_SHOW_AUTO_CANCEL_ENABLED=false`.
- Preserved a configuration-first opt-in path for a future approved no-show policy.
- Made the opt-in path calculate eligibility from the booking's scheduled date/time in the configured IANA time zone, rather than record age alone.
- Guaranteed that an accepted job cannot become no-show eligible before scheduled start plus the configured grace period.
- Gave late acceptances/booking activity the full grace period.
- Added an atomic write guard so a concurrent provider arrival or booking update wins over the cancellation worker.
- Bounded each no-show scan with `BOOKING_NO_SHOW_SWEEP_BATCH_SIZE` and deterministic ordering.
- Fail closed on invalid scheduled date/time values instead of cancelling those bookings.
- Reused the timezone-safe parser for booking creation validation and customer cancellation-window enforcement.
- Added validated deployment settings to the production environment example and Render blueprint.
- Corrected the lifecycle-worker startup log so it no longer claims a hard-coded five-minute cancellation policy.

## Configuration

- `BOOKING_TIME_ZONE=Asia/Karachi`
- `BOOKING_NO_SHOW_AUTO_CANCEL_ENABLED=false`
- `BOOKING_NO_SHOW_GRACE_MINUTES=30`
- `BOOKING_NO_SHOW_SWEEP_BATCH_SIZE=100`

All settings are validated. Invalid booleans, bounds, or IANA time-zone values fail environment validation.

## Verification

- Phase 18A1 focused schedule regressions: 6/6 passed.
- Focused booking lifecycle verification: 23/23 tests passed.
- API TypeScript verification passed.
- Release blueprint verification passed.
- Full `pnpm run release:verify:code` passed.
- Full API test result: 459 tests passed, 0 failed.
- All library, API, admin, mobile, and scripts TypeScript checks passed.
- Security scan, operations validation, Expo workspace/style validation, Metro validation, API build, and admin production build passed.

Connected database/provider verification and Android/iPhone device verification were not run in this code-only phase and are not represented as passed.

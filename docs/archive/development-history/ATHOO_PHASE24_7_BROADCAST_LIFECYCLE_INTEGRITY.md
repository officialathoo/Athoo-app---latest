# Athoo Phase 24.7 — Broadcast Lifecycle Integrity

## Production defect repaired

The API fallback used a three-minute broadcast lifetime while the default expansion job ran after five minutes. When the production settings row inherited that fallback, the request expired before expanded delivery could run. The admin panel and mobile app both displayed a thirty-minute default, so the server behavior was inconsistent and difficult to diagnose.

## Changes

- Aligned the API broadcast TTL default to 30 minutes.
- Added a strict invariant that expansion must run before expiration.
- Added read-time normalization for legacy invalid settings.
- Added an idempotent database migration to persist the repaired timing pair.
- Canonicalized customer broadcast categories to admin-managed slugs.
- Changed the mobile broadcast request to send the category slug instead of a UUID where available.
- Made the provider's Available for Jobs setting authoritative for push delivery, realtime delivery, listing and response eligibility.
- Added an honest customer result message when the initial radius has no eligible provider, including whether automatic expansion is queued.
- Added focused regression coverage and updated active release metadata and runbooks.

## External evidence still required

Deploy the migration and exact source, then verify on Android and iPhone that an approved provider with availability enabled, a current GPS fix, a matching category, a valid Expo token and a radius covering the customer receives the broadcast immediately and after app termination.

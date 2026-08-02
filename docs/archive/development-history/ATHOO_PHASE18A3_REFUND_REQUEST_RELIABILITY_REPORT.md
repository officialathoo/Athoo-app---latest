# Athoo Phase 18A3 — Refund Request Reliability

Date: 2026-08-01
Baseline: `ATHOO_PHASE18A2_ACCOUNT_ACTION_STEP_UP_VERIFICATION_FIXED.zip`

## Outcome

The customer refund flow no longer sends an embedded base64 image inside the refund JSON request. Evidence is uploaded to authenticated private storage first, and refund creation now uses server-owned booking eligibility, exact remaining-refundable calculations, payload-aware retries, and database-backed concurrency protection.

## Root cause repaired

- The former mobile screen requested base64 image data and placed a `data:image/...` value in `evidenceUrl`.
- The refund API accepts an owned private-storage object path, not image bytes. A large data URL could exceed the JSON body limit and surface as the reported temporary error; smaller values were also the wrong storage contract.
- The former mobile picker filtered only booking status. It could offer unpaid bookings that the server correctly rejected, and it defaulted the amount from service price without consistently including the visit charge or prior paid refunds.

## Mobile and API behavior

- Camera/gallery selection keeps only a local URI, filename, and content type; `base64` is disabled.
- On submit, optional evidence is uploaded with private scope. The returned stable object path is cached across a failed API retry so the same file is not uploaded repeatedly.
- A new authenticated customer endpoint returns only completed/cancelled bookings whose payment is paid/received and whose remaining refundable amount is positive.
- The picker excludes a booking with a pending or approved refund and displays service charge, travel/visit charge, already-paid refunds, and the current maximum refundable amount.
- The API independently validates booking ownership, status, payment state, amount, reason length, retry identifier, and private evidence ownership.
- Refund lists are bounded, errors remain sanitized, and English/Urdu copy covers the new states.

## Retry, concurrency, and security controls

- The existing customer/request unique key is now payload-aware: an identical retry returns the original refund, while changed details under the same key return `IDEMPOTENCY_CONFLICT`.
- Creation obtains a booking-scoped PostgreSQL transaction advisory lock and rechecks all booking/refund state inside the transaction.
- The latest migration closes historical duplicate unresolved rows safely and creates one partial unique index across both `pending` and `approved` statuses.
- Supporting eligibility and booking/status indexes keep lookup and paid-refund aggregation bounded as history grows.
- Refund writes are rate-limited per hashed authenticated request context and IP; GET eligibility/history calls are not consumed by the write limiter.
- Audit records include only booking ID, amount, and whether evidence exists—never the reason text, image content, password, token, or storage credential.

## Database and rollout

Create a PostgreSQL restore point, then apply and verify:

`deploy/migrations/20260801_refund_request_reliability.sql`

Recommended order: database migration, API deployment, API eligibility/refund smoke test, then mobile release. Configure `REFUND_REQUEST_RATE_LIMIT_MAX` (default `10` writes per hour) through the deployment environment.

If rollback is required before accepting new traffic, stop refund writes, restore the application pair, drop `refund_requests_unresolved_booking_uidx`, and recreate the former pending-only index. Because the migration deliberately closes historical duplicate unresolved rows, a database restore point—not an automatic reverse update—is the safe way to recover those prior row states.

## Verification

- Focused Phase 18A3 suite: 4/4 passed.
- Combined refund/media/integrity regression set: 22/22 passed.
- Full API suite: 471/471 passed.
- API, mobile, scripts, admin, and shared-library TypeScript checks: passed.
- Full `pnpm run release:verify:code`: passed, including project/release/operations checks, blueprint validation, security scan, mobile workspace/style/Metro validation, all tests, TypeScript, API build, admin build, and bundle budget.

Connected PostgreSQL migration rehearsal, deployed correlation-ID reproduction, real R2/S3 private evidence upload, 429 behavior, and Android/iPhone camera/gallery retry testing were not performed in this offline code pass and remain release gates.

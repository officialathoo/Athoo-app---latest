# Athoo Phase 18A2 — Account Action Step-Up Verification

Date: 2026-08-01
Baseline: `ATHOO_PHASE18A1_SCHEDULED_JOB_CANCELLATION_SAFETY_FIXED.zip`

## Outcome

Temporary account deactivation and permanent account deletion can no longer be submitted without fresh identity confirmation. Both customer and provider entry points now use one shared, keyboard-safe Privacy & Security workflow.

## Server enforcement

- Both final actions require either the current password or a short-lived verification token. Omitting both is rejected.
- Wrong passwords and invalid step-up proofs return safe action errors without incorrectly triggering the mobile client's authentication-expiry logout behavior.
- Six-digit mobile OTPs are HMAC-protected at rest, short-lived, resend-throttled, attempt-bounded, and atomically consumed once.
- Verified-email OTPs reuse the provider-neutral durable email challenge system with separate `account_deactivate` and `account_delete` purposes.
- OTP verification creates a five-minute purpose token bound to the exact action, user, role, authenticated session, and normalized device ID.
- Successful actions revoke every active session and create a security audit entry containing the verification method, never the password, OTP, or token.
- Concurrent permanent-deletion requests are protected by a partial unique database index and an idempotent conflict path.
- Dedicated request, verify, and final-action rate limits derive keys from a one-way hash of the authenticated request context and IP address.

## Mobile workflow

- Privacy & Security separates **Deactivate temporarily** from **Request permanent deletion**.
- The user can choose the current password, a registered-mobile code, or a verified-email code when available.
- The modal uses `KeyboardAvoidingView`, a scrolling sheet, numeric OTP input, OS one-time-code hints, safe error messages, accessibility states, and English/Urdu copy.
- Customer and provider profile danger-zone buttons route to the shared verified workflow, preventing older duplicated screens from bypassing confirmation.
- OTPs and step-up tokens are held only in component memory and are not persisted locally.

## Database and deployment

Apply the new latest migration before starting the updated API:

`deploy/migrations/20260801_account_action_step_up_verification.sql`

Configure and validate the six new `ACCOUNT_STEP_UP_*` / `ACCOUNT_ACTION_*` environment controls included in `.env.production.example` and `render.yaml`. Production must have a working phone-bound WhatsApp/SMS route; verified email is offered only when email delivery is configured.

## Verification

- Focused Phase 18A2 security suite: 8/8 passed.
- Full API suite: 467/467 passed.
- Full `pnpm run release:verify:code`: passed, including project checks, operations/readiness checks, blueprint validation, security scan, mobile validation, all tests, TypeScript, Metro validation, API build, admin build, and bundle budget.

Connected PostgreSQL migration rehearsal, real WhatsApp/SMS/email delivery, and Android/iPhone interaction testing were not performed in this offline code pass and remain deployment gates.

## Invoice reference recorded

The supplied internet invoice image was recorded only as a layout reference in the separate Phase 18 master plan. The planned Athoo invoice will use Athoo branding and PKR, remove irrelevant retail/shipping/payment-QR fields, protect phone numbers, and add a privacy-safe official authenticity-verification QR. The third-party reference image is intentionally not included in this release artifact.

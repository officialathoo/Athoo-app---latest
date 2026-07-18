# Athoo RC2 Phase 4B — Portable Email System Certification

## Baseline

This cumulative phase was built only from:

- `ATHOO_RC2_PHASE_4A_NOTIFICATION_CALL_SOUND_CERTIFIED.zip`
- SHA-256: `ada58e440c3b1f8a76dbf7b6143b3f34f65181b2d2956c68b27e900f7cbdd1fc`

No older ZIP was used.

## Architecture completed

### Provider-neutral delivery

- Added one configurable SMTP adapter that can work with Zoho Mail, Zoho ZeptoMail SMTP, Amazon SES SMTP, Postmark SMTP, or another standards-compatible provider.
- Provider name, host, port, STARTTLS/TLS mode, credentials, sender, reply-to, pool size, connection limits, timeouts, brand identity, and support address are deployment configuration.
- No provider host, credential, or secret was embedded in mobile or admin source.
- Added safe configuration status and authenticated admin transport verification without exposing secrets.

### Email verification and authentication

- Added registration email verification with a six-digit code.
- Added verified-email OTP login as an alternative to phone OTP.
- Email OTP is issued only after the account, selected customer/provider role, active state, block/deactivation/deletion state, blacklist state, and verified email ownership are checked.
- Email lookup is normalized with `lower(trim(email))`, including historical mixed-case addresses.
- Added secure email-change verification with session revocation after a successful change.
- Added verified-email password recovery delivery while keeping the public forgot-password response generic to resist account enumeration.

### Challenge security

- Email OTP codes are stored only as HMAC-SHA256 hashes.
- Codes have configurable expiry, resend cooldown, and bounded attempts.
- Attempt increments and successful consumption are atomic so concurrent requests cannot reuse a code.
- Only one open challenge exists per user and purpose.
- Failed delivery invalidates the associated challenge.
- Dedicated rate limits cover email OTP send/verify, profile verification, email changes, and admin test-email delivery.

### Transactional and security email coverage

- Added configurable templates for verification, email login OTP, welcome, password reset, password changed, new-device login, email changed, account status, and custom campaigns.
- Added email notifications for booking/negotiation updates and finance-related payment, refund, subscription, withdrawal, and rate-request events.
- Admin customer/provider deactivation, reactivation, blocking, and unblocking now send mandatory account-status security email when an address is available.
- Push, realtime, and email delivery remain independent so an email failure cannot block the primary in-app workflow.

### Durable delivery and audit

- Added provider-neutral delivery records with statuses, attempts, provider result, dedupe key, timestamps, template variables, and safe metadata.
- Added PostgreSQL-backed email jobs with bounded retries and exponential queue backoff.
- Added queue-enqueue failure handling so delivery records do not remain silently stuck as queued.
- Added duplicate-send protection and campaign progress accounting.
- Added suppression for invalid/unowned/unverified addresses and disabled user preferences.
- Added configurable retention maintenance for expired/used challenges and completed delivery audit records.

### Preferences, consent, and unsubscribe

- Added per-user booking, account, product, and marketing email preferences.
- Security email cannot be disabled through user preferences.
- Marketing defaults to disabled and requires explicit opt-in.
- Added signed unsubscribe links, `List-Unsubscribe`, and RFC 8058 one-click POST headers.
- GET requests show a confirmation page instead of silently unsubscribing, protecting users from automated link scanners.

### Admin Email Center

- Added permission-controlled email configuration diagnostics.
- Added SMTP transport verification and bounded test-send capability.
- Added paginated delivery audit with status filtering.
- Added draft, edit, schedule/queue, cancel, audience filter, recipient cap, consent filtering, and progress tracking for product/marketing campaigns.
- Marketing delivery remains disabled by default through `EMAIL_MARKETING_ENABLED=false`.

### Mobile completion

- Added phone/email OTP selection on login.
- Added email verification after registration and from profile settings.
- Added user email communication preferences.
- Added email-change API support and professional email-specific errors.
- Added Urdu translations for all new verification, security, and preference UI; the translation map contains 847 unique keys with no duplicates.

## Database migration

Added the additive migration:

- `20260715_portable_email_delivery_verification.sql`

It creates:

- `email_verification_challenges`
- `email_preferences`
- `email_campaigns`
- `email_deliveries`
- normalized unique verified-email ownership
- integrity constraints and supporting indexes

Historical duplicate verified addresses are safely marked unverified instead of assigning ownership by guesswork.

## Configuration added

The complete provider-neutral configuration is documented in `.env.production.example` and `render.yaml`, including:

- SMTP provider and connection settings
- email sender/branding/support settings
- OTP hash secret and OTP policy
- verification/email-change/admin-test rate limits
- delivery retries and retention
- marketing enablement and recipient cap
- public API URL for signed unsubscribe links

Real credentials remain external to source control and the release ZIP.

## Verification evidence

- Changed TS/TSX syntax transpilation: **38 passed, 0 failed**
- Focused Phase 4B certification: **12 passed, 0 failed**
- Complete API/source regression: **365 passed, 0 failed**
- Project JSON validation: **31 passed**
- Release check: **passed**
- Mobile release validation: **passed**
- Closed-beta QA validation: **passed**
- Operations readiness: **passed**
- Security scan: **passed**
- Valid staging email environment fixture: **passed**
- Invalid email rate-limit fixture: **correctly rejected**
- Urdu translation-key audit: **847 unique, 0 duplicates**

## Certification boundary

This phase is source-certified for its implemented email architecture and workflows. The following connected checks are still required before production certification:

1. Install dependencies and run the full workspace typecheck and builds.
2. Apply the new Neon migration and run database verify/integrity checks.
3. Configure a real SMTP provider in Render using server-only secrets.
4. Deploy the API and confirm health reports email configuration without secret values.
5. In Admin Email Center, verify the transport and send one real test email.
6. Verify registration email, email OTP login, password recovery, account-status email, booking/finance email, preferences, suppression, and unsubscribe using test accounts.
7. Keep marketing disabled until provider sending limits, consent language, legal requirements, and a limited test campaign are approved.
8. Build/install the updated mobile app and complete the email section of `docs/qa/CLOSED_BETA_CHECKLIST.md`.

Dependency-backed typecheck/build and live SMTP delivery could not be executed in this environment because dependencies and external registry/network access are unavailable. No claim of live Zoho delivery is made by this source certificate.

## Next phase

Phase 4C should perform final connected runtime integration and regression: local dependency-backed gates, migration rehearsal, Render/Vercel/Neon configuration verification, new APK creation, and real-device testing of authentication, email, notifications, calls, maps, storage, and customer/provider/admin workflows.

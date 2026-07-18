# Athoo RC2 Phase 1 — Authentication and OTP Certification

## Canonical baseline

This phase was applied cumulatively to `ATHOO_RC2_FINAL_VERSION_ALL_TYPECHECK_ERRORS_FIXED(1).zip`. No older project package was used.

## Completed scope

- Separated login, registration, and password-reset OTP purposes.
- Login OTP checks account existence, selected role, lifecycle status, block/deactivation state, and active blacklist entries before generating an OTP.
- Registration OTP rejects an existing phone account and blocked registration identities.
- Registration requires a signed, short-lived phone-verification token before the account can be created.
- OTPs are HMAC-hashed with a dedicated secret fallback, purpose-scoped, expiring, attempt-limited, resend-limited, and audited by delivery channel.
- Concurrent OTP requests are protected by a database partial unique index so only one open OTP can exist per phone/purpose/role.
- OTP delivery failure invalidates the database record and returns a professional 503 response instead of false success.
- Mobile login and both customer/provider registration flows send explicit OTP purpose and role.
- Mobile OTP UI includes expiry and resend countdowns and professional account-state errors.
- Password OTP login now validates the selected role and account availability through the same central policy.
- SMTP is provider-agnostic and configured for Zoho-compatible STARTTLS without Gmail defaults.
- Health responses expose safe configuration state without exposing credentials.
- Deployment validation rejects development OTP disclosure in staging/production.
- Permanent Athoo EAS project linkage is retained in dynamic Expo configuration.

## Database migration

`20260715_auth_otp_purpose_delivery_integrity.sql`

Additive changes to `otps`:

- `purpose`
- `role`
- `attempts`
- `max_attempts`
- `delivery_channel`
- `delivered_at`
- `invalidated_reason`
- purpose and attempt constraints
- lookup indexes
- one-open-OTP partial unique index
- migration-time duplicate cleanup

## Source verification completed

- Project structure validation: passed (31 JSON files).
- Complete source regression suite: 322 tests passed, 0 failed.
- Focused authentication/OTP certification: 8 tests passed, 0 failed.
- Changed TypeScript/TSX source transpilation: passed.
- Urdu translation duplicate-key AST audit: passed (815 unique keys).
- Production environment validator safe/unsafe scenarios: passed.
- Known previously exposed credential scan: passed.
- ZIP is clean of `.env`, `node_modules`, `.git`, build output, and backups.

## Required local/deployment gates

The clean source ZIP intentionally contains no installed dependencies or private deployment configuration. Run from the project root after extraction:

```powershell
pnpm install --frozen-lockfile
pnpm check:project
pnpm typecheck
pnpm test
pnpm build
pnpm db:migrate
pnpm db:verify
pnpm db:integrity
pnpm mobile:doctor
pnpm mobile:validate
```

Live OTP delivery must then be verified on Render using at least one configured production delivery channel:

- Zoho SMTP, or
- approved WhatsApp OTP template.

Without either channel, production OTP requests intentionally return `OTP_DELIVERY_UNAVAILABLE` rather than pretending an OTP was sent.

## Regression statement

No existing booking, negotiation, finance, storage, admin, notification, or navigation API contract was removed. Existing phone/password authentication remains available, with stronger role and account-state enforcement.

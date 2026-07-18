# Athoo RC2 Phase 5 — Final Release-Candidate Integration Certification

## Certification type

**Source certification only.** This report does not claim that Render, Neon, R2, Mapbox, Zoho/SMTP, WhatsApp/SMS, Expo push, EAS builds, Android, or iPhone live tests have already passed.

## Canonical baseline

This cumulative phase was built only from:

```text
ATHOO_RC2_PHASE_4C_PORTABLE_MAP_CONNECTED_RUNTIME_CERTIFIED.zip
SHA-256: cf56ae5904636083cd467094fe12967771c259e45f1a95683366f6f0085747c5
```

No older ZIP was merged and no baseline file was removed.

## Scope completed

### 1. Portable authentication OTP delivery

Authentication OTP delivery now uses one provider-neutral service with three replaceable adapters:

- WhatsApp Cloud
- SMTP email fallback for an already verified account email
- Generic JSON-over-HTTPS SMS

Provider order and cost behavior are configuration-driven:

```env
OTP_DELIVERY_CHANNELS=whatsapp_cloud,email
OTP_DELIVERY_MODE=first_success
```

`first_success` is the safe default so Athoo does not send the same OTP through multiple paid channels unless redundancy is explicitly selected with `all`.

Phone-number registration is intentionally restricted to phone-bound delivery channels. Email cannot satisfy the phone-possession check. Registration email verification remains a separate post-registration control.

Login fallback email is used only when the stored account email is already verified. Password recovery also uses only a verified account email.

### 2. OTP safety and operational visibility

- Direct WhatsApp-provider calls were removed from authentication routes.
- Delivery failure continues to invalidate the stored OTP.
- Production responses never expose the OTP value.
- Health diagnostics expose only safe configuration booleans and provider labels.
- Health reports whether phone registration is actually deliverable, rather than only reporting that some email provider exists.
- Environment validation rejects production configuration that has no working phone-bound registration channel.

### 3. Release identity and deployment matching

Health endpoints now expose a safe release identity:

- service
- environment
- version
- commit SHA
- build ID

The values are portable and prefer explicit configuration while supporting host-provided release metadata. No deployment secrets are included.

The connected verifier can now reject a deployment when the running release version or commit does not match the intended source.

### 4. Connected runtime verification

The connected verifier now covers:

- liveness and deep readiness
- release identity
- database and migrations
- R2/S3-compatible storage readiness
- map tile image response
- authenticated search, reverse geocoding and directions
- transactional email transport
- optional controlled real email
- OTP configuration and optional controlled real OTP delivery
- admin-origin CORS preflight
- redacted evidence generation

Connected checks use environment-provided test accounts and never package credentials.

### 5. Android/iPhone evidence governance

The device checklist was upgraded to require evidence for Android, iPhone and cross-role workflows, including:

- native splash and branding
- phone and email authentication
- blocked/deactivated account handling
- one-device session enforcement
- dark/light theme matrix
- map search, named address and directions
- media upload
- distinct notification and call sounds
- foreground, background and killed-app notification behavior
- customer/provider/admin booking flow
- weak-network recovery

A validator checks build IDs, artifact hash, timestamps, device details, OS version, evidence and notes.

### 6. Final GO/NO-GO control

A release-decision tool now requires evidence for source, security, database, connected infrastructure, builds, both physical platforms, theme, sounds, open P0/P1 defects and engineering/QA/product/operations approvals.

It returns only:

- `GO`
- `NO-GO`
- `CONDITIONAL-NO-GO`

Pending evidence cannot accidentally produce a production `GO` decision.

### 7. CI and workflow reliability

- Standard CI runs release code verification, mobile validation, beta validation and device-preparation validation.
- pnpm is installed before setup-node requests a pnpm cache.
- The secret-bearing connected-runtime workflow disables package-manager caching.
- A manual connected workflow uploads only redacted runtime evidence.

### 8. Registration-email clarity

The phone-registration OTP email fallback was removed from the registration flow because email cannot prove phone ownership. A separate `registration_otp` email template exists for future workflows that explicitly use email-based registration, while the existing `email_verification` template remains dedicated to verifying the email address.

## Added files

```text
.github/workflows/connected-runtime.yml
api-server/src/lib/otpDelivery.ts
api-server/src/lib/releaseIdentity.ts
api-server/test/rc2-phase5-final-rc-integration.test.ts
docs/qa/device-acceptance-evidence-template.json
docs/qa/rc2-evidence-template.json
scripts/tools/rc2-decision.mjs
scripts/tools/validate-device-evidence.mjs
```

## Database impact

No new database migration was added in Phase 5. The cumulative package still requires all prior migrations, including the Phase 4B portable-email migration.

## Verification performed in the source environment

```text
Project JSON validation:                 Passed — 33 files
Release configuration check:             Passed
Mobile release validation:               Passed
Closed-beta QA validation:               Passed
Operations-readiness validation:         Passed — 6 runbooks
Security scan:                            Passed
Device-acceptance preparation:           Passed
Changed JavaScript syntax checks:         Passed
Workflow/render YAML parsing:             Passed — 3 files
TypeScript/TSX syntax-transpile audit:    Passed — 462 files
Focused Phase 5 tests:                    Passed — 5/5
Complete API source regression:           Passed — 376/376
Valid production-like env fixture:        Passed
Email-only phone registration fixture:    Correctly rejected
No configured OTP fixture:                Correctly rejected
```

## Certification boundary

The source environment could not install the pinned pnpm dependencies or contact Athoo's connected infrastructure. Therefore, the following remain mandatory and are not claimed as completed by this certificate:

- workspace dependency-backed typecheck
- API/admin production builds
- Expo Doctor and mobile export
- Neon migration and integrity execution against the real database
- connected Render/R2/Mapbox/SMTP/OTP/push verification
- Android preview build
- iOS preview build
- physical Android and iPhone acceptance evidence
- final GO/NO-GO approval

## Required final commands

```powershell
pnpm install --frozen-lockfile
pnpm rc2:source-verify
pnpm db:migrate
pnpm db:verify
pnpm db:integrity
pnpm mobile:doctor
pnpm mobile:export
```

After deploying the exact Git commit:

```powershell
$env:CONNECTED_API_BASE_URL="https://athoo-api.onrender.com"
$env:CONNECTED_ADMIN_ORIGIN="https://<your-vercel-admin-domain>"
$env:CONNECTED_EXPECTED_RELEASE_VERSION="rc2-candidate"
$env:CONNECTED_EXPECTED_COMMIT_SHA="<exact-git-commit-sha>"
$env:CONNECTED_CUSTOMER_IDENTIFIER="<test-customer>"
$env:CONNECTED_CUSTOMER_PASSWORD="<test-password>"
$env:CONNECTED_ADMIN_IDENTIFIER="<test-admin>"
$env:CONNECTED_ADMIN_PASSWORD="<test-password>"
$env:CONNECTED_OTP_TEST_PHONE="<registered-controlled-test-phone>"
$env:CONNECTED_EMAIL_TEST_TO="<controlled-test-email>"
pnpm rc2:connected-verify
```

Then copy and complete:

```powershell
Copy-Item docs/qa/device-acceptance-evidence-template.json device-acceptance-evidence.json
pnpm device:evidence:validate

Copy-Item docs/qa/rc2-evidence-template.json rc2-evidence.json
pnpm rc2:decision
```

Production launch is permitted only after `pnpm rc2:decision` returns `GO` with zero open P0 and P1 defects.

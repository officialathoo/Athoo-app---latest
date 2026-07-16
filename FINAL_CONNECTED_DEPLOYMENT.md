# Athoo Final Connected Deployment

Use `ATHOO_PHASE14_MOBILE_UPLOAD_TYPECHECK_FIXED.zip` as the only release baseline. Do not merge files from older ZIPs.

## 1. Local source certification

Use Node 22 and pnpm 10.33.2 from the committed package-manager metadata:

```powershell
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install --frozen-lockfile
pnpm release:verify:code
pnpm mobile:doctor
pnpm mobile:export
```

Stop on the first failure. Dependency-aware typecheck, Metro loading, API/admin builds and Expo export must pass in a connected environment.

## 2. Release identity

Commit the exact source and record the full Git SHA and ZIP SHA-256:

```powershell
git status --short
git add .
git commit -m "Athoo final audited production candidate"
git push origin main
git rev-parse HEAD
Get-FileHash .\ATHOO_PHASE14_MOBILE_UPLOAD_TYPECHECK_FIXED.zip -Algorithm SHA256
```

Render, Vercel, EAS, connected verification and device evidence must reference the same commit.

## 3. Production secrets and providers

Configure Render from `.env.production.example`. Never commit actual credentials. Required production groups include:

- Neon PostgreSQL and migration controls
- JWT, refresh, session and OTP secrets
- Explicit CORS origins
- Cloudflare R2 private object storage
- PostgreSQL durable queue
- Expo push and receipt endpoints
- SMTP and a phone-bound OTP channel
- Map providers and credentials
- TURN URLs, username and credential
- Monitoring and escalation contacts
- Release version, commit and build identity

Production validation rejects local storage, wildcard CORS, development OTP responses, missing phone-bound OTP, missing TURN credentials and placeholder release identity.

## 4. Database deployment

Create a Neon restore point before deployment, then run:

```powershell
pnpm db:migrate
pnpm db:status
pnpm db:verify
pnpm db:integrity
```

The expected latest migration is:

```text
20260716_workflow_inactivity_policy_governance.sql
```

Do not start the updated API if migration verification or integrity checks fail.

## 5. Render and Vercel

Deploy the same Git SHA to both services. Confirm:

```text
https://<api-domain>/api/healthz
https://<api-domain>/api/healthz/deep
```

Deep health must report current migrations, database, storage, maps, email, OTP, push and `calls.productionReady=true`.

Vercel must use the same API origin and exact Git SHA. Verify admin login and exact notification navigation for support, premium, bookings, finance, verification, users, providers, policies and inactivity review.

## 6. Connected runtime verification

Use controlled customer, provider and administrator accounts:

```powershell
$env:CONNECTED_API_BASE_URL="https://<api-domain>"
$env:CONNECTED_ADMIN_ORIGIN="https://<admin-domain>"
$env:CONNECTED_EXPECTED_RELEASE_VERSION="<release-version>"
$env:CONNECTED_EXPECTED_COMMIT_SHA="<full-git-sha>"
$env:CONNECTED_CUSTOMER_IDENTIFIER="<test-customer>"
$env:CONNECTED_CUSTOMER_PASSWORD="<test-password>"
$env:CONNECTED_PROVIDER_IDENTIFIER="<eligible-test-provider>"
$env:CONNECTED_PROVIDER_PASSWORD="<test-password>"
$env:CONNECTED_ADMIN_IDENTIFIER="<test-admin>"
$env:CONNECTED_ADMIN_PASSWORD="<test-password>"
$env:CONNECTED_OTP_TEST_PHONE="<controlled-phone>"
$env:CONNECTED_EMAIL_TEST_TO="<controlled-email>"
$env:CONNECTED_STRICT="true"
pnpm runtime:verify:connected
```

The controlled provider must be approved, active, have categories and coordinates, and not be busy. This verifies that the provider broadcast endpoint does not silently exclude the account. Actual customer-job receipt and notification sound remain physical-device acceptance cases.

## 7. Fresh native builds

From `athoo-app`:

```powershell
eas whoami
eas project:info
eas build --platform android --profile preview --clear-cache
eas build --platform ios --profile preview --clear-cache
```

Fresh builds are mandatory for notification sounds, Android channel v4, biometrics and WebRTC native configuration.

## 8. Physical-device acceptance

Complete `device-acceptance-evidence.json` using the exact Android and iOS builds:

```powershell
Copy-Item device-acceptance-evidence-template.json device-acceptance-evidence.json
pnpm device:evidence:validate
```

Required evidence includes customer-to-provider job broadcast receipt, message badge and sound, keyboard visibility, provider rates and multiple categories, two-way calls across different networks, one-device revocation, biometrics, admin exact destinations, policies and inactivity safety.

## 9. Final decision

Complete the production evidence file:

```powershell
Copy-Item rc2-evidence-template.json rc2-evidence.json
pnpm rc2:decision
```

Launch is prohibited unless the result is `GO`, every non-waivable gate passes, legal review is recorded, production credentials have been rotated, monitoring is active, and open P0/P1 defects are both zero.

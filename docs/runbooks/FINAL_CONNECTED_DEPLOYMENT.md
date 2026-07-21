# Athoo Final Connected Deployment

Use `ATHOO_PHASE28_5_2_RELEASE_METADATA_FIXED.zip` as the only release baseline. Do not merge files from older ZIPs.

## 1. Certify the exact source

Use Node 22 and pnpm 10.33.2 from the committed workspace metadata:

```powershell
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install --frozen-lockfile
pnpm release:verify:code
pnpm mobile:doctor
pnpm mobile:export
```

Stop on the first failure. The dependency-backed typecheck, API/admin builds, Metro resolution and Expo export must pass before deployment.

## 2. Freeze one release identity

Commit the exact source and record the complete Git SHA and ZIP checksum:

```powershell
git status --short
git add .
git commit -m "Athoo Phase 28.5 device acceptance integrity"
git push origin main
$Commit = git rev-parse HEAD
Get-FileHash .\ATHOO_PHASE28_5_2_RELEASE_METADATA_FIXED.zip -Algorithm SHA256
```

Use one release version and the same `$Commit` for Render, Vercel and EAS.

Render configuration:

```text
RELEASE_VERSION=<release-version>
RELEASE_COMMIT_SHA=<full-git-sha>
```

Vercel configuration:

```text
VITE_RELEASE_VERSION=<same-release-version>
VITE_RELEASE_COMMIT_SHA=<same-full-git-sha>
```

`VERCEL_GIT_COMMIT_SHA` is also consumed automatically. The admin build publishes a safe, non-cacheable `/release.json` manifest. It contains no credentials.

EAS configuration:

```text
EXPO_PUBLIC_RELEASE_VERSION=<same-release-version>
EXPO_PUBLIC_RELEASE_COMMIT_SHA=<same-full-git-sha>
```

EAS also supplies `EAS_BUILD_GIT_COMMIT_HASH` and `EAS_BUILD_ID` when available. These are exposed only as non-secret build provenance in Expo Constants.

## 3. Configure production providers

Configure Render from `.env.production.example`. Never commit actual credentials. Required groups include:

- Neon PostgreSQL and migration controls
- JWT, refresh, session and OTP secrets
- Exact CORS origins
- Cloudflare R2 or another certified private storage adapter
- PostgreSQL durable queue
- Expo push and receipt endpoints
- SMTP and a phone-bound OTP channel
- TomTom or another configured map provider
- TURN URLs, username and credential
- Monitoring and escalation contacts
- Release version, commit and build identity

For the current single Render API instance use:

```text
QUEUE_PROVIDER=postgres
CACHE_PROVIDER=memory
```

Do not scale to multiple API instances while using memory cache. Phase 28.5 verification rejects horizontal scaling unless the active cache reports `horizontalScaleSafe=true`.

## 4. Verify Neon before API rollout

Create a Neon restore point, then run:

```powershell
pnpm db:status
pnpm db:verify
pnpm db:integrity
```

The expected latest migration is:

```text
20260720_release_phase28_professional_workflow_integrity.sql
```

Do not start the updated API when migration verification or integrity checks fail.

## 5. Deploy Render and Vercel from the same commit

Confirm:

```text
https://<api-domain>/api/healthz
https://<api-domain>/api/healthz/deep
https://<admin-domain>/release.json
```

Deep health must report current migrations, database, queue, cache, storage, maps, email, OTP, push and `calls.productionReady=true`.

The API health identity and admin `/release.json` must contain the same release version and Git SHA. The admin deployment must return its configured security headers and `Cache-Control: no-store` for `/release.json`.

## 6. Run strict connected verification

Use controlled customer, provider and administrator accounts:

```powershell
$env:CONNECTED_API_BASE_URL="https://<api-domain>"
$env:CONNECTED_ADMIN_ORIGIN="https://<admin-domain>"
$env:CONNECTED_EXPECTED_RELEASE_VERSION="<release-version>"
$env:CONNECTED_EXPECTED_COMMIT_SHA="<full-git-sha>"
$env:CONNECTED_EXPECTED_API_INSTANCES="1"
$env:CONNECTED_MAX_FAILED_QUEUE_JOBS="0"
$env:CONNECTED_CUSTOMER_IDENTIFIER="<test-customer>"
$env:CONNECTED_CUSTOMER_PASSWORD="<test-password>"
$env:CONNECTED_PROVIDER_IDENTIFIER="<eligible-test-provider>"
$env:CONNECTED_PROVIDER_PASSWORD="<test-password>"
$env:CONNECTED_ADMIN_IDENTIFIER="<test-admin>"
$env:CONNECTED_ADMIN_PASSWORD="<test-password>"
$env:CONNECTED_OTP_TEST_PHONE="<controlled-registered-phone>"
$env:CONNECTED_EMAIL_TEST_TO="<controlled-email>"
$env:CONNECTED_STRICT="true"
pnpm runtime:verify:connected
```

This verifies:

- API and admin deployment provenance
- Admin security headers and exact CORS allowlist
- Neon-backed deep health and migration status
- PostgreSQL queue operation and failed-job threshold
- Cache safety for the declared instance count
- Map tiles, search, reverse geocoding and directions
- Provider broadcast eligibility
- TURN configuration returned to an authenticated provider
- Policy centers and admin governance queues
- Storage write/metadata/delete connectivity test
- Map-provider connectivity test
- SMTP transport and one real test email
- One real phone-bound authentication OTP request

The controlled provider must be approved, active, have categories and coordinates, and not be busy.

The GitHub Actions workflow `.github/workflows/connected-runtime.yml` performs the same source, Neon, API, admin and provider checks. Store the controlled credentials and `CONNECTED_DATABASE_URL` only in the `production-verification` GitHub environment.

## 7. Build fresh native applications

From `athoo-app`:

```powershell
eas whoami
eas project:info
eas build --platform android --profile preview --clear-cache
eas build --platform ios --profile preview --clear-cache
```

Fresh native builds are mandatory for notification sounds, Android channels, biometrics and WebRTC native configuration. Record each EAS build ID and source commit.

## 8. Complete physical-device evidence

Use the exact Phase 28.5 ZIP and the same release commit used by Render, Vercel and EAS:

```powershell
pnpm device:evidence:init -- --artifact .\ATHOO_PHASE28_5_2_RELEASE_METADATA_FIXED.zip --release-version <release-version> --commit <full-git-sha>
```

Complete both build records and every case in `device-acceptance-evidence.json`, then validate:

```powershell
pnpm device:evidence:validate -- .\device-acceptance-evidence.json .\ATHOO_PHASE28_5_2_RELEASE_METADATA_FIXED.zip
```

The validator binds the evidence to the active candidate name, real non-zero ZIP checksum, exact Git commit, both native build IDs and both physical devices. Cross-role cases must identify the Android and iPhone used. It rejects generic evidence such as “OK” or “Passed”, stale timestamps, missing cases, unknown cases and build/commit mismatches.

The physical matrix explicitly covers full map-tile rendering, fresh provider location on open/foreground, radius persistence and matching, broadcast receipt after radius change, immediate old-device revocation, biometric enable/unlock/disable, call crash resistance and two-way audio, time-picker layout, bottom safe area, availability state animation, notification delivery and invoices with no tax.

HTTP verification does not prove actual Expo receipt, sound playback, killed-state deep links or two-way audio. Those remain mandatory physical-device checks.

## 9. Final decision

Complete the production evidence file and reference the passed device summary produced above:

```powershell
Copy-Item docs/qa/rc2-evidence-template.json rc2-evidence.json
# Set deviceEvidenceSummary to the relative path under release-evidence/.
pnpm rc2:decision .\rc2-evidence.json
```

The RC2 gate verifies that the device summary is schema v4, has status `passed`, and matches the same candidate ZIP, release version, Git commit and SHA-256.

Launch is prohibited unless the result is `GO`, every non-waivable gate passes, legal review is recorded, production credentials have been rotated, monitoring is active, and open P0/P1 defects are both zero.

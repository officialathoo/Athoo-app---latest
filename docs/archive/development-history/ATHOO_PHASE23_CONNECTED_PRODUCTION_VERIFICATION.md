# Athoo Phase 23 — Connected Production Verification Ready

## Purpose

Phase 23 prepares the Phase 22 integrated source candidate for honest, repeatable connected verification across Neon, Render, Vercel, EAS, Cloudflare R2, TomTom, email, Expo push and TURN. It does not claim that those external systems passed from the isolated packaging environment.

## Baseline

- Input: `ATHOO_PHASE22_INTEGRATED_RELEASE_CANDIDATE_CLEAN.zip`
- Output: `ATHOO_PHASE23_CONNECTED_PRODUCTION_VERIFICATION_READY.zip`
- Database migrations added: none
- Existing API, mobile, admin, database and provider contracts preserved

## Permanent implementation work

### 1. One release identity across API, admin and mobile

The Admin production build now emits a safe `release.json` containing only version, commit, build identity and environment. Vercel serves it with `no-store` and `noindex` headers. Mobile builds expose the same safe release identity through Expo configuration. The API already reports release identity through health endpoints.

The connected verifier fails when API and Admin versions or Git commit identities differ. EAS receives the same version and commit metadata, allowing device evidence to be tied to the exact source candidate.

### 2. Strict connected verification

`scripts/tools/connected-runtime-verify.mjs` now verifies:

- API liveness and deep readiness
- database and migration status reported by the deployed API
- PostgreSQL durable queue readiness, ownership and failed-job threshold
- cache provider truth and horizontal-scaling safety
- map, storage, email, OTP, push and TURN configuration
- Admin security headers and non-cacheable release manifest
- API/Admin release-version and commit equality
- exact CORS preflight behavior
- map tile image delivery
- authenticated search, reverse geocoding and directions
- customer/provider/admin account access
- provider broadcast eligibility
- real OTP delivery without returning OTP codes
- Admin storage and map connectivity tests
- SMTP transport and controlled real email delivery

Evidence is redacted before being written to `release-evidence/`.

### 3. Connected GitHub workflow

`.github/workflows/connected-runtime.yml` runs from a protected production-verification environment. It installs the locked workspace, certifies source, runs Neon database status/checksum/integrity checks and then executes the strict connected verifier with controlled test accounts and provider checks. Evidence artifacts are retained for 90 days.

### 4. Deep health truth

The API deep-health response now exposes the actual queue statistics, selected cache status and call/TURN readiness alongside existing database, migration, maps, email, push, OTP and storage status.

### 5. Runtime map switching completed through the mobile client

Phase 18 added server-side/Admin map switching, but the mobile tile renderer still used build-time tile size and attribution. That could render the wrong grid or legal attribution when switching between a 256-pixel provider such as TomTom and a 512-pixel provider such as Mapbox.

Phase 23 closes that gap permanently:

- map status includes the active provider tile size and attribution
- public platform settings expose only safe active map metadata
- mobile settings preserve a deployment fallback but consume runtime map metadata
- the tile renderer projects, unprojects and lays out tiles using the active 256/512 size
- attribution updates with the provider
- customer and provider clients receive an immediate settings realtime event
- the public settings response is revalidated rather than held in a second stale route cache
- custom HTTP tile providers can declare `MAP_CUSTOM_TILE_SIZE`

Provider credentials remain entirely server-side. The mobile tile URL remains the stable Athoo proxy, so changing an already configured map provider requires no mobile rebuild or API route change.

### 6. Production configuration correction

The production example now consistently selects TomTom fallback values:

- `TOMTOM_TILE_SIZE=256`
- `EXPO_PUBLIC_MAP_TILE_SIZE=256`
- TomTom/OpenStreetMap attribution

The mobile public values are safe deployment fallbacks. Runtime provider metadata replaces them after settings load.

## Packaging-environment verification completed

- API source suite: **491 passed, 0 failed**
- TypeScript/TSX syntax transpilation diagnostics: **523 files passed**
- JavaScript/MJS/CJS syntax checks: **43 files passed**
- Project JSON validation: **36 files passed**
- Release check: passed
- Operations readiness: passed
- Release blueprint validation: passed
- Security scan: passed
- Expo workspace validation: passed
- React Native style validation: passed
- Mobile release validation: passed with the expected missing local `EAS_PROJECT_ID` warning
- Closed-beta QA assets: passed
- Device acceptance preparation: passed
- Sanitized production environment validation: passed with expected single-instance memory-cache and absent error-tracking warnings

## Verification deliberately not claimed

The clean packaging environment does not contain installed workspace dependencies or production credentials and cannot establish outbound provider connections. Therefore Phase 23 does **not** claim completion of:

- frozen dependency installation
- full semantic workspace typecheck
- API and Admin production builds
- Metro dependency resolution or Expo export
- Neon connected database verification
- deployment of the exact source commit to Render and Vercel
- live R2, TomTom, SMTP, Expo push or TURN connectivity
- Android/iPhone behavior
- load, backup/restore or final penetration/security evidence

Those checks must run in the connected environment using the exact packaged source commit.

## Release decision

**CONNECTED-VERIFICATION-READY — NO-GO FOR PUBLIC LAUNCH.**

After the exact candidate is committed and deployed, execute `docs/runbooks/FINAL_CONNECTED_DEPLOYMENT.md` and the protected GitHub connected workflow. Do not move to device acceptance if connected verification fails; fix the candidate and repeat Phase 23 evidence first.

After connected verification passes, the next stage is Phase 24 Android/iPhone cross-role acceptance.

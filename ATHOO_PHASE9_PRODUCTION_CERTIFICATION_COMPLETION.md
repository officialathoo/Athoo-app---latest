# Athoo Phase 9 — Production Certification Preparation

## Baseline

Input baseline: `ATHOO_PHASE8_GOVERNANCE_ACCESSIBILITY_FIXED.zip`

Output baseline: `ATHOO_PHASE9_PRODUCTION_CERTIFICATION_READY.zip`

## Goal

Prevent a source-only pass from being mistaken for a production launch approval. Phase 9 hardens deployment configuration, connected verification, physical-device evidence, and the final GO/NO-GO decision.

## Completed source and release-engineering fixes

### Production voice readiness

- Centralized STUN/TURN configuration in `api-server/src/lib/callConfiguration.ts`.
- Production readiness now requires valid `turn:`/`turns:` URLs plus both TURN username and credential.
- Deep health now reports a sanitized `checks.calls` readiness object.
- The authenticated call configuration still returns ICE credentials to signed-in app users only.
- Environment validation rejects incomplete or invalid production TURN configuration.
- Render configuration now exposes provider-neutral STUN/TURN variables.

### Deployment configuration

- Removed the pinned release-version value from `render.yaml`; release identity is now supplied per deployment.
- Added JWT issuer/audience and trusted-proxy configuration to the Render blueprint.
- Added lifecycle scheduling and operations escalation variables.
- Added error-tracking, incident commander, support escalation, and status-page inputs.
- Added a release-blueprint validator and wired it into `release:verify:code`.
- Synchronized current Phase 9 baseline and latest migration wording in launch runbooks.

### Connected runtime verification

The connected verifier now checks:

- release version and commit identity
- current migrations and database health
- maps, storage, email, OTP and push readiness
- production-ready TURN configuration
- customer and provider policy centers
- controlled provider identity and broadcast eligibility
- provider broadcast endpoint availability
- admin sidebar counts, policy governance and inactivity queue
- controlled customer/provider/admin authentication

The controlled provider must be active, approved, categorized, located and not busy. This prevents silent provider exclusion from passing unnoticed.

### Physical-device evidence

The Android/iOS checklist now explicitly includes:

- biometric session lock and restart
- keyboard-visible chat input
- unread badge and background message delivery
- provider hourly rate and multiple services visibility
- policy center offline/accessibility behavior

Cross-role evidence now explicitly includes:

- customer job broadcast received by a provider
- two-way voice across different networks
- admin notification opening the exact record
- inactivity warning, safe return and no automatic deletion

### Final release decision

The final GO decision now separately requires evidence for:

- customer job broadcasts
- realtime chat and unread counts
- two-way voice calls
- one-device session and biometrics
- admin exact deep links
- policy governance and legal review
- inactivity lifecycle safety
- production secret rotation
- monitoring and alerts
- hosting-capacity approval
- zero P0 and zero P1 defects

## Validation performed in this environment

- 19/19 targeted Phase 9/related regression checks passed.
- 431/431 complete API/source regression tests passed.
- Project JSON validation passed.
- Release configuration validation passed.
- Operations readiness validation passed.
- Release blueprint validation passed.
- Security scan passed.
- Expo workspace validation passed.
- React Native style validation passed.
- Mobile release validation passed.
- Closed-beta and device-preparation validation passed.
- Changed TypeScript and JavaScript files passed syntax checks.
- A fully populated synthetic production environment passed environment validation.

## Not completed here

The clean ZIP intentionally excludes dependencies and this environment cannot reach the npm registry. Therefore the following still require the connected project environment:

- `pnpm install --frozen-lockfile`
- workspace typecheck
- API and admin production builds
- Metro configuration loading and Expo export
- Neon backup, migrations, verification and integrity
- Render and Vercel deployment
- Cloudflare R2 upload/read verification
- live Expo push receipt verification
- fresh Android/iOS EAS builds
- physical Android/iPhone acceptance
- cross-network TURN call test
- policy legal approval
- production secret rotation and monitoring confirmation

## Current release decision

`CONDITIONAL-NO-GO`

The source and certification tooling are ready. Production launch is not approved until all connected and physical-device evidence is completed and `pnpm rc2:decision` returns `GO`.

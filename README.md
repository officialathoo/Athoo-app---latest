# Athoo Phase 24.8 Device Acceptance Integrity Candidate

This cumulative package contains the Athoo mobile application, API, admin panel, shared libraries, database migrations and release-engineering controls.

## Workspaces

- `api-server/` — backend API and provider abstraction layers
- `admin-panel/` — administration panel
- `athoo-app/` — Expo/React Native customer and provider application
- `lib/` — shared packages and database schema
- `scripts/` — validation, database, security, connected-runtime and release-decision tooling
- `sql/` and `deploy/` — database and deployment resources
- `.maestro/` — mobile smoke-test flows

## Configuration-first rule

External providers, endpoints, credentials, branding, limits and deployment-specific behavior remain configurable. Secrets belong in deployment secret managers, never in the mobile app, admin bundle, Git history or public ZIPs.

Current documentation is indexed in `docs/README.md`. Provider contracts are under `docs/architecture/`, and production procedures are under `docs/runbooks/`.

## Local source certification

```powershell
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install --frozen-lockfile
pnpm rc2:source-verify
pnpm db:verify
pnpm db:integrity
pnpm mobile:doctor
pnpm mobile:export
```

## Connected certification

Phase 24.8 carries forward all Phase 24.7 broadcast lifecycle, session, map, biometric, UI, call-transport, fresh-location and notification self-healing fixes. It hardens release acceptance so the exact ZIP, Git commit, Android build and iOS build are bound to one evidence set. Every originally reported defect now has an explicit Android, iOS or cross-role acceptance case, and the final RC2 decision cannot return GO without a passed strict device-evidence summary.

Follow:

- `docs/archive/development-history/ATHOO_PHASE24_8_DEVICE_ACCEPTANCE_INTEGRITY.md`
- `docs/archive/development-history/ATHOO_PHASE24_7_BROADCAST_LIFECYCLE_INTEGRITY.md`
- `docs/archive/development-history/ATHOO_PHASE24_6_LOCATION_NOTIFICATION_SELF_HEALING.md`
- `docs/archive/development-history/ATHOO_PHASE24_5_CALL_TRANSPORT_GATING.md`
- `docs/archive/development-history/ATHOO_PHASE24_4_FINAL_SOURCE_AUDIT.md`
- `docs/runbooks/FINAL_CONNECTED_DEPLOYMENT.md`
- `docs/runbooks/MOBILE_BETA_RELEASE_RUNBOOK.md`
- `docs/qa/device-acceptance-checklist.json`
- `docs/qa/device-acceptance-evidence-template.json`
- `docs/qa/rc2-evidence-template.json`

A production launch is allowed only after connected, device, load and security evidence is complete and `pnpm rc2:decision` returns `GO`.

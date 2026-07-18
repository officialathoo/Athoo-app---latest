# Athoo Phase 23 Connected Production Verification Candidate

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

Phase 23 adds verifiable API/admin/mobile build provenance and strict connected checks for Neon, Render, Vercel, maps, storage, email, OTP, queue, cache and TURN.
It also completes runtime map switching in the mobile renderer: active tile size and attribution now follow Admin/provider configuration while all credentials remain behind the stable Athoo API proxy.

Follow:

- `docs/archive/development-history/ATHOO_PHASE23_CONNECTED_PRODUCTION_VERIFICATION.md`
- `docs/runbooks/FINAL_CONNECTED_DEPLOYMENT.md`
- `docs/runbooks/MOBILE_BETA_RELEASE_RUNBOOK.md`
- `docs/qa/device-acceptance-checklist.json`
- `docs/qa/device-acceptance-evidence-template.json`
- `docs/qa/rc2-evidence-template.json`

A production launch is allowed only after connected, device, load and security evidence is complete and `pnpm rc2:decision` returns `GO`.

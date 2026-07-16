# Athoo RC2 Release-Candidate Source Package

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

External providers, endpoints, credentials, branding, limits and deployment-specific behavior must remain configurable. Secrets belong in deployment secret managers, never in the mobile app, admin bundle, Git history or public ZIPs.

## Local setup

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

## Final certification

Follow:

- `RC2_PHASE_5_FINAL_RELEASE_CANDIDATE_INTEGRATION_CERTIFICATION.md`
- `FINAL_CONNECTED_DEPLOYMENT.md`
- `MOBILE_BETA_RELEASE_RUNBOOK.md`
- `device-acceptance-checklist.json`
- `device-acceptance-evidence-template.json`
- `rc2-evidence-template.json`

A production launch is allowed only after the connected and device evidence is complete and `pnpm rc2:decision` returns `GO`.

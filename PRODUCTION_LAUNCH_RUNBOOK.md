# Athoo Production Launch Runbook

This runbook is the final controlled path from a certified source archive to a live production release.

## 1. Prepare the immutable artifact

Create the release ZIP from the certified repository without `node_modules`, build output, `.env` files, or release evidence. Calculate its SHA-256 digest and store both in the release ticket.

## 2. Prepare the production environment

Keep the production environment file outside the repository. It must include the normal application variables plus:

- `RELEASE_VERSION`
- `RELEASE_APPROVED_BY`
- `RELEASE_CHANGE_TICKET`
- `RELEASE_SOURCE_REVISION`
- `INCIDENT_COMMANDER_CONTACT`
- `SUPPORT_ESCALATION_EMAIL`
- `STATUS_PAGE_URL`

Never add secrets or the production environment file to the release ZIP.

## 3. Run the launch preflight

```bash
pnpm install --frozen-lockfile
pnpm launch:preflight /secure/production.env /releases/athoo-vX.zip
```

The preflight stops when any of these fail:

- Environment validation
- Operational readiness
- Automated tests, TypeScript, and production builds
- Database migration verification
- Release approval metadata
- Artifact hashing and evidence generation

The generated preflight evidence is written under `release-evidence/` and must be attached to the release ticket, not committed to source control.

Use `--skip-code` only when the same source revision has already passed `pnpm release:verify:code` in the trusted CI pipeline and that CI evidence is attached to the release ticket.

## 4. Back up and deploy

Create a database backup immediately before deployment. Retain the previous API and admin artifacts. Deploy database migrations before starting the new API. Do not perform destructive schema rollback without following `ROLLBACK_RUNBOOK.md`.

## 5. Verify the live deployment

```bash
SMOKE_API_BASE_URL=https://api.athoo.example pnpm launch:postdeploy
```

For authenticated beta verification, also supply the dedicated staging or production test-account variables described in `CLOSED_BETA_AUTOMATION.md`. Never use a real customer account for automated smoke tests.

## 6. Observe before increasing traffic

Monitor error rate, response latency, background jobs, database connections, storage errors, notification delivery, authentication failures, and manual-finance queues. Keep the release owner and incident commander available during the observation window.

## 7. Sign off or roll back

Sign off only after smoke tests pass and operational metrics remain healthy. Roll back immediately for authentication failure, data corruption, financial inconsistency, widespread booking failure, privacy exposure, or migration incompatibility.

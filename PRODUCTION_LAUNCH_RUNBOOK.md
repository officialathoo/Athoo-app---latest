# Athoo Production Launch Runbook

This is the controlled path from the Phase 5 source candidate to production.

## 1. Immutable artifact

Create the release ZIP without dependencies, build output, `.env` files, credentials or generated evidence. Record:

- full Git commit SHA
- ZIP SHA-256
- API release version
- Android EAS build ID
- iOS EAS build ID

All deployed components must trace to the same release source.

## 2. Source and environment gates

```powershell
pnpm install --frozen-lockfile
pnpm rc2:source-verify
pnpm db:verify
pnpm db:integrity
pnpm mobile:doctor
pnpm mobile:export
pnpm launch:preflight /secure/production.env /releases/athoo-rc2.zip
```

The production environment must pass `scripts/tools/validate-environment.mjs` and must include a phone-bound OTP channel, remote storage, PostgreSQL queueing, secure secrets, release identity and all selected provider configuration.

Use `--skip-code` only when the exact Git SHA already passed the trusted CI source workflow and that evidence is attached.

## 3. Backup and migrate

- Create a Neon restore point or backup immediately before deployment.
- Retain the previous API, admin and mobile artifacts.
- Apply migrations before starting the updated API.
- Run `pnpm db:verify` and `pnpm db:integrity` after migration.
- Follow `ROLLBACK_RUNBOOK.md` for any rollback. Do not manually reverse additive migrations without review.

## 4. Deploy exact source

Deploy the same Git SHA to Render and Vercel. Create EAS builds from that same source. Confirm `/api/healthz` and `/api/healthz/deep` report the expected release version and commit.

## 5. Post-deployment smoke and connected runtime evidence

Run the public post-deployment smoke test first:

```powershell
$env:SMOKE_API_BASE_URL="https://athoo-api.onrender.com"
pnpm launch:postdeploy
```

Then run the environment described in `FINAL_CONNECTED_DEPLOYMENT.md`:

```powershell
pnpm rc2:connected-verify
```

This must pass release identity, database, migration, storage, maps, CORS, email and controlled OTP checks.

## 6. Android and iPhone evidence

Complete `device-acceptance-evidence.json` from its template using the exact preview/release builds:

```powershell
pnpm device:evidence:validate
```

Both physical platforms and all cross-role cases must pass.

## 7. Final production decision

Complete `rc2-evidence.json` from its template and attach the evidence locations for every check:

```powershell
pnpm rc2:decision
```

Launch is prohibited unless the result is:

```text
GO
```

There must be zero open P0 defects and zero open P1 defects, with engineering, QA, product and operations approvals.

## 8. Observe and roll back

Monitor authentication, OTP delivery, email queues, push notifications, map failures, storage uploads, booking workflows, finance queues, database connections, error rate and latency.

Roll back immediately for authentication outage, privacy exposure, data corruption, financial inconsistency, widespread booking failure or incompatible migration behavior.

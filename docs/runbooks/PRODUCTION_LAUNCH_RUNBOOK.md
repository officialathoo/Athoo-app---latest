# Athoo Production Launch Runbook

This runbook promotes the Phase 23 connected-verification-ready candidate without bypassing connected, load, security or physical-device evidence.

## 1. Freeze the artifact

Record the Git SHA, release version, ZIP SHA-256, Render deploy ID, Vercel deployment ID, Android build ID and iOS build ID. Every component must trace to one source revision.

## 2. Run source and environment gates

```powershell
pnpm install --frozen-lockfile
pnpm release:verify:code
pnpm mobile:doctor
pnpm mobile:export
pnpm env:validate .\production.env
pnpm launch:preflight .\production.env .\ATHOO_PHASE23_CONNECTED_PRODUCTION_VERIFICATION_READY.zip
```

`--skip-code` is allowed only when the exact commit already passed trusted CI and that evidence is attached.

## 3. Back up and migrate

Create a Neon restore point. Apply and verify every migration through `20260716_workflow_inactivity_policy_governance.sql`. Retain the previous API, admin and mobile artifacts. Use `docs/runbooks/ROLLBACK_RUNBOOK.md` for rollback.

## 4. Deploy one commit

Deploy the same Git commit to Render and Vercel. Build Android and iOS from that commit. Verify API release identity and the admin `/release.json` manifest before functional testing.

## 5. Run connected production verification

```powershell
pnpm db:status
pnpm db:verify
pnpm db:integrity
pnpm launch:postdeploy
pnpm runtime:verify:connected
```

Strict verification must include controlled customer, provider and admin credentials. API/admin provenance, TURN, queue, cache, storage, maps, email, OTP, provider broadcast eligibility, policies and admin operational queues must pass.

## 6. Complete Android and iPhone evidence

Run every item in `docs/qa/device-acceptance-checklist.json`, including all originally reported failures. Attach screenshots or video, device/OS, build ID, timestamp and notes.

## 7. Run load, recovery and security gates

Complete performance smoke, broadcast and chat concurrency, queue recovery, database restore rehearsal, upload concurrency, provider-failure behavior, dependency audit, secret rotation and monitoring checks.

## 8. Obtain approvals

Engineering, QA, product and operations approvals are required. Legal review is mandatory for customer-facing policies. Confirm development credentials were replaced with production secrets and escalation contacts are active.

## 9. Decide

Run `pnpm rc2:decision`. Release only on `GO`, with no open P0 or P1 defects and no pending non-waivable check.

## 10. Observe and roll back

Monitor authentication, one-device revocation, OTP, email, push receipts, broadcasts, chat, calls, maps, uploads, bookings, premium/support operations, finance queues, lifecycle automation, database connections, latency and error rate. Roll back for privacy exposure, authentication outage, data corruption, financial inconsistency, widespread broadcast/booking failure or incompatible migrations.

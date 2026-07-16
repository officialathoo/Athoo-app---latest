# Athoo Production Launch Runbook

This runbook promotes the Phase 14 mobile-upload-typecheck-fixed candidate to release without bypassing connected or physical-device evidence.

## 1. Freeze the artifact

Record the Git SHA, release version, ZIP SHA-256, Render deploy ID, Vercel deployment, Android build ID and iOS build ID. Every component must trace to the same source revision.

## 2. Run source and environment gates

```powershell
pnpm install --frozen-lockfile
pnpm release:verify:code
pnpm mobile:doctor
pnpm mobile:export
pnpm env:validate .\production.env
pnpm launch:preflight .\production.env .\ATHOO_PHASE14_MOBILE_UPLOAD_TYPECHECK_FIXED.zip
```

`--skip-code` is allowed only when the exact commit already passed trusted CI and that evidence is attached.

## 3. Back up and migrate

Create a Neon restore point. Apply and verify every migration through `20260716_workflow_inactivity_policy_governance.sql`. Retain previous API, admin and mobile artifacts. Use `ROLLBACK_RUNBOOK.md` for rollback.

## 4. Deploy the exact source

Deploy the same commit to Render and Vercel. Build Android and iOS from the same commit. Confirm release version and commit identity through deep health.

## 5. Run post-deployment verification

```powershell
$env:SMOKE_API_BASE_URL="https://<api-domain>"
pnpm launch:postdeploy
pnpm runtime:verify:connected
```

Connected verification must include controlled customer, provider and admin credentials. TURN, storage, maps, email, OTP, provider broadcast eligibility, policies and admin operational queues must pass.

## 6. Complete Android and iPhone evidence

Run every item in `device-acceptance-checklist.json`, including the original reported failures. Attach screenshots or video, device/OS, build ID, timestamp and notes.

## 7. Obtain approvals

Engineering, QA, product and operations approvals are required. Legal review is mandatory for customer-facing policies. Confirm temporary development credentials were replaced with production secrets and monitoring/escalation contacts are active.

## 8. Decide

Run `pnpm rc2:decision`. Release only on `GO`, with no open P0 or P1 defects and no pending non-waivable check.

## 9. Observe and roll back

Monitor authentication, one-device revocation, OTP, email, push receipts, broadcasts, chat, calls, maps, uploads, bookings, premium/support operations, finance queues, lifecycle automation, database connections, latency and error rate. Roll back for privacy exposure, authentication outage, data corruption, financial inconsistency, widespread broadcast/booking failure or incompatible migrations.

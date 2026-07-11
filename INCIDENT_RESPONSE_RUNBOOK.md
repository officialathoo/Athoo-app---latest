# Athoo Incident Response Runbook

## Severity
- **SEV-1:** security breach, financial corruption, broad outage, or private-data exposure.
- **SEV-2:** major customer/provider workflow unavailable with no safe workaround.
- **SEV-3:** limited degradation, delayed jobs, or isolated feature failure.

## First 15 minutes
1. Name an incident commander and open one incident record.
2. Stop risky deployments and preserve logs, request IDs, audit records, and release evidence.
3. Determine affected roles, regions, records, and start time.
4. For security or finance risk, disable the affected mutation path before investigating convenience fixes.
5. Publish an internal status update and use the configured status page for external impact.

## Containment and recovery
- Follow `ROLLBACK_RUNBOOK.md` when the current release is implicated.
- Never edit an applied migration; restore only from a verified backup with explicit authorization.
- Revoke compromised sessions and rotate affected credentials.
- Reconcile bookings, ledger entries, refunds, withdrawals, and durable jobs before declaring recovery.
- Run `pnpm smoke:test` and role-specific beta smoke checks after recovery.

## Closure
Record timeline, root cause, customer impact, data impact, corrective actions, owners, and due dates. A SEV-1 or SEV-2 incident requires a written post-incident review.

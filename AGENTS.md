# Athoo Production Engineering Rules

Athoo is a real production platform. Never treat it as a disposable prototype or test project.

## Mandatory engineering policy

- Use permanent, production-grade fixes. Do not use temporary workarounds, fake data, bypasses, or destructive shortcuts.
- Preserve all working customer, provider, admin, API, database, storage, notification, call, and deployment behavior.
- Keep architecture configuration-first and vendor-agnostic. Deployment-specific settings and secrets belong in environment configuration.
- Manual payments remain the current production policy; do not add a live payment gateway unless explicitly approved.
- Database migrations must be repeatable, transaction-safe where practical, backward compatible, and must preserve real data.
- Design all externally retried operations to be idempotent. Protect against duplicate requests, races, stale workers, double processing, and conflicting state transitions.
- Keep expensive email, push, broadcast, media, cleanup, and lifecycle work outside request-critical paths using the durable queue where appropriate.
- Bound concurrency, query size, retry count, payload size, memory use, and network timeouts. Never launch unbounded `Promise.all` work over user-controlled or database-sized collections.
- Use pagination and suitable indexes for growing tables. Avoid loading an entire production table when a bounded query or batch process can be used.
- Fail gracefully, log actionable structured context without secrets, and preserve service availability during partial provider failures.
- Never commit `.env`, credentials, private keys, tokens, database URLs, or production customer data.
- Do not commit, push, deploy, force-push, reset history, or modify production infrastructure without explicit approval.

## Required verification

Before release packaging, run the relevant focused tests and then:

```text
pnpm run release:verify:code
```

Connected verification requiring real configured services is separate and must not be represented as passed unless it actually ran successfully:

```text
pnpm run release:verify:connected
```

Review the final diff for regressions, hardcoded changeable values, performance hazards, missing wiring, and migration safety before declaring a new baseline.

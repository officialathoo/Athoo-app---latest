# Athoo Phase 16 — Production Rules and Bounded Broadcast Audit

## Baseline

Source: `ATHOO_PHASE15_SESSION_MIGRATION_FIXED.zip`

Phase 16 preserves the Phase 15 session-migration correction and applies the newly confirmed production engineering policy.

## Production findings and changes

### 1. Permanent repository engineering policy

Added root `AGENTS.md` so future coding work is governed by durable project rules rather than chat-only instructions. It requires production-grade fixes, real-data-safe migrations, configuration-first architecture, idempotency, bounded resource usage, durable background work, pagination/indexing, secret safety, and explicit release verification.

### 2. Unbounded expanded-broadcast fan-out

Confirmed issue: expanded provider broadcasts used `Promise.all(expandedOnly.map(...))`. Recipient count comes from production data, so a large provider population could create an unbounded burst of notification/database operations inside one queue job.

Permanent correction:

- Added a bounded worker-pool implementation.
- Added configurable `BROADCAST_DELIVERY_CONCURRENCY`.
- Default concurrency: 10.
- Enforced safe range: 1–50.
- Preserved existing notification, realtime, fallback, metrics, queue, and deep-link behavior.
- Did not introduce a new provider dependency.

This limits simultaneous delivery pressure while retaining parallel throughput.

### 3. Regression protection

Updated the broadcast delivery certification test to require bounded fan-out and reject the previous unbounded pattern.

## Verification completed in this environment

- Focused notification/broadcast suite: 7/7 passed.
- Complete API/source regression suite: 452/452 passed.
- Phase 15 migration fix retained.
- No real data, credentials, environment files, or deployment settings were added.

## Verification limitation

The isolated audit environment could not reach `registry.npmjs.org`, so it could not download the pinned pnpm 10.33.2 toolchain or reinstall dependencies. Therefore `pnpm run release:verify:code` was not represented as executed here.

Run the following from the connected Windows project after replacing the source or applying the two changed files:

```powershell
pnpm install --frozen-lockfile
pnpm run release:verify:code
```

Then review the diff before committing and deploying.

## Changed files

- `AGENTS.md`
- `api-server/src/routes/broadcast.ts`
- `api-server/test/phase3-notification-broadcast-delivery.test.ts`
- `docs/archive/development-history/ATHOO_PHASE16_PRODUCTION_RULES_AND_BOUNDED_BROADCAST_AUDIT.md`

## Release status

Source-level Phase 16 audit: **PASS**

Connected dependency/build/deployment certification: **must run on the connected project environment before production deployment**

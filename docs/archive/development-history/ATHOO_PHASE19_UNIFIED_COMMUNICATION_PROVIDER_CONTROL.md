# Athoo Phase 19 — Unified Communication Provider Control

## Objective

Extend Athoo's configuration-first, provider-neutral architecture beyond maps while preserving all existing email, OTP, notification, Expo receipt, mobile, and admin workflows.

## Delivered

### Provider-neutral communication runtime

- Added a secret-free runtime provider selection layer backed by the existing cached platform-settings record.
- Added independent runtime choices for email and push.
- Preserved environment configuration as the default and emergency fallback.
- No database migration was required.

### Portable email delivery

- Preserved SMTP delivery and pooling.
- Any standards-compatible SMTP vendor can be selected through configuration.
- Added a generic HTTPS/JSON email adapter with declarative headers, authentication, request-body templates, field names, timeouts, health checks, and response message-ID paths.
- Preserved backward compatibility for `EMAIL_FROM`, `SMTP_FROM`, and `EMAIL_FROM_ADDRESS`.
- Kept console email forbidden in production.

### Portable push delivery

- Preserved Expo batching, retry behavior, ticket collection, durable receipt processing, invalid-token cleanup, custom channel IDs, sounds, badge values, and TTL policies.
- Added a generic HTTPS/JSON push adapter with declarative message templates, batch templates, authentication, timeouts, response counters, invalid-token paths, and ticket-ID paths.
- Existing exported push function names remain compatible with current call sites.

### OTP and health integration

- OTP email readiness now follows the runtime-selected email adapter.
- API health endpoints now report the active runtime email and push adapters.
- Delivery falls back safely to deployment configuration if platform settings cannot be read.

### Admin control and diagnostics

- Added Communication & External Providers controls to Platform Settings.
- Added a unified, permission-protected integration status endpoint.
- Added secret-safe readiness cards for maps, email, push, OTP, storage, calls, queue, and cache.
- The status API returns credential-presence booleans only.
- Stateful integrations are clearly marked as deployment-controlled/restart-required.

### Deployment and validation

- Added generic email and push adapter variables to `.env.production.example` and `render.yaml`.
- Extended deployment environment validation for provider selection, HTTPS endpoints, JSON templates, methods, timeouts, and batch sizes.
- Kept compatibility with the existing formatted `EMAIL_FROM="Athoo <noreply@athoo.pk>"` deployment style.
- Added permanent architecture documentation under `docs/architecture/`.

## Files added

- `api-server/src/integrations/httpJsonAdapter.ts`
- `api-server/src/lib/communicationRuntime.ts`
- `api-server/test/phase19-unified-provider-control.test.ts`
- `docs/architecture/COMMUNICATION_PROVIDER_ARCHITECTURE.md`
- `docs/archive/development-history/ATHOO_PHASE19_UNIFIED_COMMUNICATION_PROVIDER_CONTROL.md`

## Main files updated

- `.env.production.example`
- `render.yaml`
- `scripts/tools/validate-environment.mjs`
- `api-server/src/lib/admin.ts`
- `api-server/src/lib/email.ts`
- `api-server/src/lib/push.ts`
- `api-server/src/lib/otpDelivery.ts`
- `api-server/src/app.ts`
- `api-server/src/routes/admin.ts`
- `api-server/src/routes/email.ts`
- `api-server/src/routes/health.ts`
- `admin-panel/src/lib/types.ts`
- `admin-panel/src/pages/SettingsPage.tsx`
- related release certification tests

## Verification evidence

- Full API source certification suite: **467 passed, 0 failed**.
- Project structure/JSON validation: **35 JSON files passed**.
- TypeScript transpilation diagnostics: **16 changed TS/TSX files passed**.
- Deployment environment validator: passed with a synthetic production configuration using the backward-compatible formatted `EMAIL_FROM` value.
- Repository security scan: passed.
- Generated/build artifact scan: no `node_modules`, `.git`, `dist`, coverage, local `.env`, log, backup, or temporary files included.
- Private-key marker scan: no private keys detected.

## Important boundary

This phase permits future provider changes without source edits when a provider uses SMTP, Expo, or a conventional configurable HTTPS/JSON API. A provider requiring proprietary signing, a native-only SDK, a binary protocol, or multi-step authentication still needs a dedicated isolated adapter. Public Athoo APIs and business workflows remain unchanged when that adapter is added.

Storage, queue, cache, and voice/TURN providers remain deployment-controlled by design because safe switching may require data migration, connection draining, or a process restart.

## Build limitation

The clean package intentionally contains no installed dependencies. A complete workspace `pnpm typecheck` and production build were not repeated in the isolated packaging directory. The available source certification suite, syntax/transpilation checks, project validation, environment validation, and security scan all passed. Full typecheck and build remain required in the normal installed workspace or CI before deployment.

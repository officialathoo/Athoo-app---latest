# Athoo RC2 Phase 1 — Architecture and Runtime Audit

## Baseline

This audit was performed against `ATHOO_RC2_PROTECTED_BASELINE` without broad rewrites. All changes in this phase are configuration, consistency, or user-facing wording corrections designed to preserve existing behavior.

## Regression-safe corrections applied

1. **Single migration-version authority**
   - Added `lib/db/src/migrations.ts`.
   - API startup migration checks and `db:integrity` now import the same constant from `@workspace/db`.
   - This prevents the deployment failure previously caused by two hard-coded expected migration names drifting apart.

2. **Secret-bearing mobile environment removed from source package**
   - Removed `athoo-app/.env` from the distributable source.
   - `.env.example` remains available.
   - EAS/Render/local secrets must be supplied at deployment time.

3. **Pakistan-wide wording alignment**
   - Updated invoice and PDF branding from Rawalpindi/Islamabad to Pakistan-wide wording.
   - Updated admin service-area guidance and provider location placeholder.
   - Replaced the outdated chatbot answer that claimed Athoo served only Rawalpindi and Islamabad.

## Verified architectural risks for later RC2 phases

### Critical runtime backlog

- Native map/location crash must be reproduced with Android/iOS logs and corrected in Phase 3/7.
- Media uploads depend on valid R2 credentials and require end-to-end upload tests.
- Broadcast creation requires live API/R2/push verification after deployment.
- Notification cold-start and read/deep-link state require device testing.

### Location architecture

- The backend has a nationwide hierarchy, but several mobile discovery screens still maintain fixed fallback city arrays.
- These arrays must be replaced by one shared server-driven location repository in the Pakistan rollout phase.
- Free-text operational location fields still exist in some admin/customer/provider forms and need dependent selectors.

### Type safety and maintainability

- There is extensive `any` usage in mobile, admin, and API code. Removing it all at once would be regression-prone.
- It should be reduced module-by-module while adding focused tests.
- Large customer/provider screens should be decomposed gradually through behavior-preserving component extraction.

### Mobile configuration

- Server-only cache/queue/telemetry keys should not be kept in the mobile `.env`.
- The source package now contains only examples; EAS environment configuration remains authoritative.

## Phase 1 acceptance

- No route, API contract, database schema, or workflow was removed.
- Existing migration filename remains unchanged.
- Both migration health consumers now share one constant.
- No real `.env` is present in the source package.
- Pakistan-only legacy marketing claims corrected.

## Next phase

Phase 2 will establish the shared design system and audit runtime theme usage, spacing, typography, cards, loading states, and admin/mobile visual consistency. Critical map/upload defects remain tracked as release blockers and will be addressed in their dedicated runtime phases with real-device evidence.

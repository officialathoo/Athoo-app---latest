# Athoo Phase 28.5.1 — Map Provider Typecheck Fix

## Issue

The Phase 28.5 Windows verification exposed TypeScript TS2367 errors in `api-server/src/lib/mapConfiguration.ts`. The generic `normalizeProvider<T>()` inferred the literal fallback type `"open"`, so valid runtime comparisons against `"tomtom"` and `"mapbox"` appeared impossible to TypeScript.

## Permanent fix

`normalizeProvider` now returns `string`, which matches the deployment/runtime nature of `MAP_PROVIDER` and the existing `MapProviderConfiguration.primaryProvider` contract. This preserves TomTom, Mapbox, open-provider, disabled-provider, and declarative custom-provider selection without casts or hardcoded narrowing.

A regression test prevents the literal-generic signature from returning.

## Verification completed in the packaging environment

- Focused map configuration and Phase 28.4/28.5 regression suites: 24 passed, 0 failed.
- New Phase 28.5.1 regression: passed.
- Full dependency-backed monorepo verification remains required on Windows.
- No database migration is included.

# Athoo Phase 18 — Runtime Map Provider Administration

## Objective

Allow Athoo administrators to change the active map provider stack without code changes or a mobile rebuild, while keeping provider credentials server-side and preserving environment configuration as a safe fallback.

## Changes

- Added database-backed runtime map-provider fields to the existing platform-settings JSON record.
- Added runtime overrides for primary, tile, search, reverse-geocoding, directions, and fallback providers.
- Kept all provider secrets in deployment environment variables; no secret values are returned to the Admin Panel.
- Updated `/api/geo/*` routes to resolve the cached runtime settings before selecting a provider.
- Updated API health output to report the runtime-active map configuration.
- Added fail-safe environment fallback when runtime settings cannot be loaded.
- Added admin configuration status endpoint: `GET /api/admin/settings/maps/status`.
- Added guarded live provider test endpoint: `POST /api/admin/settings/maps/test`.
- Added a professional Maps & Location Providers section to Platform Settings.
- Added provider validation and safe defaults without a database migration.
- Added regression tests for runtime selection, health integration, admin endpoints, UI wiring, and environment fallback.

## Compatibility

- Mobile map API routes are unchanged.
- Existing Render environment variables remain supported.
- Runtime control defaults to disabled, so upgrading does not unexpectedly change the active provider.
- No database schema migration is required because `app_settings.value` is JSON.

## Verification

- Backend TypeScript syntax checks passed for all changed server files.
- Admin TSX transpilation diagnostics passed.
- Focused map/runtime tests passed.
- Full API source suite passed after test alignment.
- Build/package-manager installation was not repeated in the isolated environment because npm registry access was unavailable.

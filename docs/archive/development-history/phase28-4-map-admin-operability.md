# Athoo Phase 28.4 — Map and Admin Operability

## Scope

This phase repairs the blank production map surface, makes the Operations Inbox tolerant of a failing work source, and reduces avoidable database work during admin navigation.

## Map delivery

- TomTom Orbis v2 raster tiles are the default production raster source.
- The configured TomTom raster generation remains selectable through environment configuration.
- TomTom tile requests retain an alternate raster endpoint for recovery when a successful response is suspiciously small and likely transparent/no-data.
- Public tile URLs carry a controlled version token so mobile and intermediary caches do not retain previously blank tiles.
- Provider keys remain server-side behind the Athoo tile proxy.
- Diagnostic response headers expose the selected upstream generation and response size without exposing credentials.

## Operations Inbox

- Independent queue sources settle separately; one unavailable table or query no longer makes the whole inbox return HTTP 500.
- Source queries are bounded by a configurable timeout and per-type row limit.
- Person and seen-state lookups are restricted to the returned work items.
- The admin UI preserves previously loaded results during refresh, ignores stale responses, debounces filtering, and shows explicit partial/error states instead of a false all-clear screen.

## Admin loading and CSP

- Sidebar badge counts are calculated in a single PostgreSQL request instead of fourteen network round trips.
- The blocked external Google Fonts request was removed in favor of a system font stack.
- The sidebar logo uses the deployed public asset path.

## Deployment

No database migration is required. The API and admin panel require redeployment. The map tile URL change also requires a compatible EAS Update for the existing preview APK; a new native build is not required for these JavaScript/configuration changes.

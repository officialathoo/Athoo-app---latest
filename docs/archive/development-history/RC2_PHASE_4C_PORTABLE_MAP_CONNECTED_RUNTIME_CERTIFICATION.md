# Athoo RC2 Phase 4C — Portable Map and Connected Runtime Certification

**Certification date:** 2026-07-15  
**Canonical input:** `ATHOO_RC2_PHASE_4B_PORTABLE_EMAIL_SYSTEM_CERTIFIED.zip`  
**Input SHA-256:** `704995fecb574c9daa4cc500515760e557a70272da0ba85ec35c71090cc9b069`

## Scope

This cumulative phase adds a configuration-driven map-provider layer and a safe
connected-runtime verifier while preserving the Phase 4B email, notification,
authentication, storage, finance, admin, and mobile functionality.

## Implemented and audited

### Portable map-provider architecture

- Independent provider selection for tiles, search, reverse geocoding, and directions.
- Mapbox Static Tiles, Geocoding v6, and Directions v5 adapters.
- Existing custom tiles, Photon, Nominatim, and OSRM remain selectable fallbacks.
- Provider tokens remain in the API environment and are not present in mobile code.
- Mapbox style owner, style ID, tile size, scale, language, country, API endpoints,
  directions profile, and geocoding storage mode are configurable.
- Provider health exposes configuration state without exposing credentials.
- Mapbox is the recommended tile/directions provider in deployment configuration;
  Photon remains the beta search/reverse provider so booking and saved-address
  persistence does not depend on temporary Mapbox geocoding results.

### Map correctness, cost, and policy protections

- Temporary Mapbox geocoding results are not stored in API or mobile caches.
- Mapbox reverse geocoding no longer sends an invalid `limit=1` combination.
- The mobile renderer supports configurable 256- or 512-pixel tiles.
- Expo and backend tile sizes are validated to match for Mapbox.
- Upstream tile cache headers are respected by default.
- Configurable maximum tile zoom and bounded tile response size remain enforced.
- Search, reverse, and directions endpoints have configurable provider-cost rate limits.
- Invalid provider combinations fail deployment validation.

### Connected runtime verifier

Added `scripts/tools/connected-runtime-verify.mjs` and root commands:

```text
pnpm runtime:verify:connected
pnpm release:verify:connected
```

The verifier checks:

- API liveness and deep readiness;
- database and migration health;
- map and email configuration status;
- public categories;
- real map-tile image response;
- authenticated search, reverse geocoding, and directions when test credentials are supplied;
- SMTP transport verification when admin credentials are supplied;
- one real test email only when `CONNECTED_EMAIL_TEST_TO` is explicitly supplied.

Binary tile responses are recorded as metadata rather than embedded in evidence.
Credentials and token-like response fields are redacted. Evidence is written with
restricted permissions under an ignored `release-evidence/` directory.

## Files changed or added

- `.env.production.example`
- `.gitignore`
- `render.yaml`
- `eas.json`
- `package.json`
- `api-server/src/app.ts`
- `api-server/src/lib/mapConfiguration.ts`
- `api-server/src/lib/productionReadiness.ts`
- `api-server/src/routes/geo.ts`
- `api-server/test/map-configuration-unit.test.ts`
- `api-server/test/rc2-final-mobile-typecheck-regression.test.ts`
- `api-server/test/rc2-phase-2-map-location-certification.test.ts`
- `api-server/test/rc2-phase-4c-portable-map-connected-runtime.test.ts` (new)
- `athoo-app/app.config.js`
- `athoo-app/components/maps/OpenStreetMapPreview.tsx`
- `athoo-app/eas.json`
- `athoo-app/services/maps.ts`
- `scripts/tools/connected-runtime-verify.mjs` (new)
- `scripts/tools/validate-environment.mjs`
- connected deployment and beta/staging runbooks

## Verification performed in the certification environment

```text
Focused map/runtime certification: 17 passed, 0 failed
Complete API source regression:     371 passed, 0 failed
Project JSON validation:             31 passed
Release check:                       Passed
Mobile release validation:           Passed
Closed-beta QA validation:           Passed
Operations readiness:                Passed
Security scan:                       Passed
Valid production-map fixture:        Passed
Missing Mapbox-token fixture:        Correctly rejected
Connected verifier syntax:           Passed
Environment validator syntax:        Passed
Database migration required:         No
```

## Certification boundary

This is a **source certification**, not a claim that external systems were
successfully contacted from this offline build environment. The following remain
mandatory after deployment:

- add the real Mapbox token in Render;
- run local dependency-backed typecheck, test, build, database, Expo Doctor, and
  mobile validation gates;
- run the connected-runtime verifier against Render and Neon;
- verify one real Zoho SMTP test email;
- build a new APK and test map alignment, search, GPS, routes, notification sounds,
  calls, and email workflows on physical Android and iPhone devices.

No older ZIP was used, no secret was added, and no existing database migration or
API contract was removed.

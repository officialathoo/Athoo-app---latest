# Athoo Phase 17 — Provider Registry and Repository Cleanup

## Scope

This phase converted the map/location subsystem from provider-specific route logic into a runtime-configurable provider registry, added complete TomTom support, restored the stable Expo EAS project fallback in `athoo-app/app.config.js`, and cleaned development-history files out of the repository root.

## Runtime architecture

The public Athoo API contract remains unchanged:

- `GET /api/geo/tiles/:z/:x/:y.png`
- `GET /api/geo/search`
- `GET /api/geo/reverse`
- `GET /api/geo/directions`

Provider selection now happens server-side. Built-in adapters support TomTom, Mapbox, Photon, Nominatim, OSRM, OpenStreetMap development tiles, and a declarative custom HTTP provider. The custom adapter allows an unlisted conventional HTTPS/JSON map provider to be configured with URL templates and response field paths without changing Athoo source code.

Provider credentials remain server-side and are not added to Expo public configuration.

## TomTom coverage

TomTom is implemented for:

- Raster map tiles
- Search/geocoding
- Reverse geocoding
- Route calculation

`MAP_PROVIDER=tomtom` selects TomTom for all supported operations. Each operation can also be selected independently, and operation-specific fallbacks can be configured.

## Repository cleanup

The root now contains only runtime source, primary project documentation, and build/deployment configuration. Historical phase reports, audits, certification notes, and development snapshots were moved to:

`docs/archive/development-history/`

Maintained documents were separated into architecture, runbooks, policies, and QA folders.

## App configuration restoration

`athoo-app/app.config.js` now preserves environment-based portability while providing the known stable EAS project fallback:

`42a7f8fe-68ea-4422-8f46-0def1f55abb9`

An `EAS_PROJECT_ID` environment value continues to override this fallback.

## Verification completed

- API source test suite: **455 passed, 0 failed**
- Map configuration unit suite: **8 passed, 0 failed**
- Project JSON/configuration validation: **passed**
- Strict standalone TypeScript checks for the new map registry/providers/configuration: **passed**
- Node syntax checks for the provider-neutral geo route and provider adapters: **passed**
- Runtime configuration smoke test confirmed TomTom readiness and generated a valid redacted tile URL
- Selected credential values supplied in chat were scanned and were not present in the packaged source

## Verification limitation

A fresh workspace-wide `pnpm` installation/typecheck/build could not be repeated in the isolated packaging environment because DNS access to `registry.npmjs.org` failed while Corepack attempted to download pnpm. This is an environment/network limitation, not a reported code failure. The complete source test suite and focused strict TypeScript checks passed.

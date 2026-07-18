# RC2 Phase 4 — Open Map, GPS and Location Reliability

## Baseline

Built cumulatively on `ATHOO_RC2_PHASE_3_STORAGE_LIFECYCLE_RELIABILITY.zip`.

## Completed

- Removed the mobile `react-native-maps` dependency and all Android/iOS Google Maps key configuration.
- Added a reusable OpenStreetMap tile preview with:
  - map tiles without a commercial API key;
  - configurable tile endpoint through `EXPO_PUBLIC_MAP_TILE_URL`;
  - marker overlays;
  - road-route polyline overlays;
  - tap-to-move-pin coordinate selection;
  - retry and slow-network fallback;
  - required OpenStreetMap attribution.
- Replaced the provider live-tracking native map with the same OpenStreetMap preview.
- Updated the customer provider-map screen to display provider, customer and selected-location markers.
- Added cache-first foreground location resolution using:
  - Expo last-known location;
  - Athoo persisted location cache;
  - bounded balanced-accuracy refresh;
  - cached fallback instead of an indefinite spinner.
- Applied the fast location service to booking, saved-address, negotiation, provider discovery, customer map, search and job-location flows.
- Reworked the geo API to use only:
  - Photon for OpenStreetMap search/reverse data;
  - Nominatim as the secondary geocoder;
  - OSRM for road routes;
  - straight-line routing when the upstream router is unavailable.
- Added upstream timeouts, coordinate validation and in-memory geo caching.
- Added configurable `PHOTON_BASE_URL`, `NOMINATIM_BASE_URL`, and `OSRM_BASE_URL` values for future self-hosting or managed OpenStreetMap infrastructure.
- Removed the production readiness requirement for a Google Maps key.
- Removed the obsolete Google Maps secret from `render.yaml`.

## Verification performed in the clean workspace

- Project configuration validation: passed.
- JSON/YAML parse validation: passed.
- Changed TypeScript/TSX syntax validation: passed.
- Focused Phase 4 regression tests: 6 passed, 0 failed.
- No database migration required.

## Local verification still required

Run the full dependency-backed gates after extraction:

- `pnpm install --frozen-lockfile`
- `pnpm check:project`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm db:verify`
- `pnpm db:integrity`
- `pnpm mobile:doctor`
- `pnpm mobile:validate`

Real-device certification must verify GPS permission denial/recovery, tile loading, tap-to-select, address search, reverse geocoding, provider live tracking and slow/offline behavior.

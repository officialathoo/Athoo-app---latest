# Athoo RC2 Phase 2 — Map, GPS and Location Certification

## Baseline

This phase was implemented directly on `ATHOO_RC2_PHASE_1_AUTH_OTP_CERTIFIED.zip`. No older source package was used.

## Root causes confirmed

1. The mobile map rendered tiles directly from `tile.openstreetmap.org`, so the public volunteer service could block the application.
2. Production had no enforced tile-provider configuration or readiness signal.
3. Location search returned basic labels and could persist fake typed results without valid coordinates.
4. Booking, map, provider search, and saved-address screens used different location-selection behavior.
5. GPS acquisition relied on one bounded position request but did not refine a weak location fix.
6. Address search did not consistently use a customer-location bias, saved places, or recent places.
7. Map/provider upstream failures were not exposed through production health and readiness checks.

## Backend corrections

- Added `api-server/src/lib/mapConfiguration.ts`.
- Added public, cacheable `GET /api/geo/tiles/:z/:x/:y.png`.
- Tile-provider API keys remain server-side and never enter the mobile bundle.
- Production rejects a missing provider and direct `tile.openstreetmap.org` configuration.
- Tile coordinates, response status, MIME type, empty responses, and maximum bytes are validated.
- Added browser/CDN caching and safe user-facing failure codes.
- Health and readiness responses now include map configuration status.
- Geocoding results now include stable ID, primary/secondary labels, city, province, postcode, precision, source, and optional distance.
- Photon is the autocomplete provider; Nominatim search is disabled by default and only available as an explicit bounded fallback.
- Reverse geocoding uses Photon first and Nominatim only when needed.
- Search is Pakistan-scoped, location-biased, cached, deduplicated, and ranked.
- Removed fake `0,0` typed-address results.
- OSRM requests now validate the HTTP response and use the configured Athoo user agent.

## Mobile corrections

- Mobile tiles now load through the Athoo API proxy.
- Added a reusable full-screen location picker with:
  - debounced search;
  - structured suggestions;
  - current GPS location;
  - saved addresses;
  - recent selections;
  - distance from current/selected location;
  - choose-on-map action;
  - professional offline/error states;
  - theme, Urdu/RTL, accessibility, and responsive support.
- Integrated the picker into:
  - booking creation;
  - customer map;
  - provider discovery/map tab;
  - saved-address management.
- Saved-address creation now requires real coordinates and supports an interactive map pin.
- GPS is cache-first and performs a short high-accuracy refinement when the first fix is weak.
- Provider distance ordering updates from the selected service location, not only the initial GPS position.

## Production configuration

Recommended server-side raster provider example:

```env
MAP_TILE_UPSTREAM_URL=https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key={apiKey}
MAP_TILE_API_KEY=<provider-key>
MAP_TILE_PROVIDER_NAME=MapTiler Streets
MAP_TILE_ATTRIBUTION=© MapTiler © OpenStreetMap contributors
MAP_TILE_ALLOW_OSM_DEVELOPMENT=false
MAP_CONTACT_EMAIL=support@athoo.pk
NOMINATIM_SEARCH_FALLBACK=false
```

The mobile application requires no map-provider key. It uses:

```text
https://athoo-api.onrender.com/api/geo/tiles/{z}/{x}/{y}.png
```

## Deployment checks

After setting Render environment variables and deploying:

1. `GET /api/health` must show `maps.configured: true` and `maps.productionSafe: true`.
2. `GET /api/geo/tiles/6/44/26.png` must return HTTP 200 and an image content type.
3. Search `Blue Area Islamabad`, `Gulberg Lahore`, and `Clifton Karachi` from the app.
4. Confirm search results contain valid non-zero coordinates and named areas.
5. Test current location outdoors and indoors, then move the map pin.
6. Verify booking, saved address, and provider-distance ordering use the selected coordinates.
7. Test slow/offline mode: a cached address may remain visible, while the map shows a professional retry state.

## Verification performed in the certification environment

- Project validation: passed (31 JSON files).
- Changed TypeScript/TSX/JS syntax: 16 files, no syntax diagnostics.
- Focused map/location tests: passed.
- Full source regression suite: 330 passed, 0 failed.
- Mobile release validation: passed.
- Closed-beta QA asset validation: passed.
- Release check: passed.
- Database migration required: no.
- Existing Phase 1 OTP/auth changes retained: yes.

## Verification boundary

The clean source package intentionally excludes dependencies and deployment secrets. Full dependency-backed `pnpm typecheck`, production builds, live provider-tile requests, and real-device GPS must be run after extraction in the normal Athoo local/Render/EAS environment. Source certification does not falsely claim those external checks were executed here.

# Map Provider Architecture

Athoo mobile clients never call a map vendor directly and never contain map-provider credentials. They use the stable Athoo endpoints:

- `GET /api/geo/tiles/:z/:x/:y.png`
- `GET /api/geo/search`
- `GET /api/geo/reverse`
- `GET /api/geo/directions`

The API selects providers at runtime through configuration. No mobile rebuild is required when a provider changes.

## Built-in providers

| Capability | Supported providers |
|---|---|
| Tiles | TomTom, Mapbox, custom HTTP template, development-only OpenStreetMap |
| Search | TomTom, Mapbox, Photon, Nominatim, custom HTTP adapter |
| Reverse geocoding | TomTom, Mapbox, Photon, Nominatim, custom HTTP adapter |
| Directions | TomTom, Mapbox, OSRM, custom HTTP adapter |

Set one primary provider:

```env
MAP_PROVIDER=tomtom
```

Or configure each capability independently:

```env
MAP_TILE_PROVIDER=tomtom
MAP_SEARCH_PROVIDER=photon
MAP_REVERSE_PROVIDER=photon
MAP_DIRECTIONS_PROVIDER=tomtom
```

Optional operation-specific fallbacks are controlled by:

```env
MAP_PROVIDER_FALLBACK_ENABLED=true
MAP_SEARCH_FALLBACK_PROVIDER=photon
MAP_REVERSE_FALLBACK_PROVIDER=photon
MAP_DIRECTIONS_FALLBACK_PROVIDER=osrm
```

## Adding an unlisted provider without source changes

Set `MAP_PROVIDER` to the provider label and configure the `MAP_CUSTOM_*` URL templates and response paths. Unknown provider labels automatically select the declarative custom adapter.

Example:

```env
MAP_PROVIDER=futuremaps
MAP_CUSTOM_PROVIDER_ID=futuremaps
MAP_CUSTOM_API_KEY=replace-me
MAP_CUSTOM_API_KEY_QUERY_PARAM=key
MAP_CUSTOM_TILE_URL_TEMPLATE=https://tiles.example.com/{z}/{x}/{y}.png?key={apiKey}
MAP_CUSTOM_SEARCH_URL_TEMPLATE=https://api.example.com/search?q={query}&limit={limit}
MAP_CUSTOM_REVERSE_URL_TEMPLATE=https://api.example.com/reverse?lat={lat}&lng={lng}
MAP_CUSTOM_DIRECTIONS_URL_TEMPLATE=https://api.example.com/route?from={originLat},{originLng}&to={destLat},{destLng}
```

Response field mappings are configured with variables such as:

```env
MAP_CUSTOM_SEARCH_RESULTS_PATH=results
MAP_CUSTOM_SEARCH_LAT_PATH=position.lat
MAP_CUSTOM_SEARCH_LNG_PATH=position.lon
MAP_CUSTOM_REVERSE_ADDRESS_PATH=address
MAP_CUSTOM_DIRECTIONS_POINTS_PATH=routes.0.points
```

The custom adapter is suitable for HTTPS/JSON providers whose responses can be normalized with field paths. A provider requiring proprietary signing, binary protocols, or multi-step authentication still requires a dedicated driver, but mobile APIs and screens remain unchanged.

## Security rules

- Provider credentials remain in the API deployment environment.
- Do not use `EXPO_PUBLIC_*` variables for provider secrets.
- Failed upstream requests are logged without API keys or credential-bearing URLs.
- Production refuses direct volunteer OpenStreetMap tiles.
- Map configuration appears in API health/readiness output without exposing secrets.

## Runtime provider control from the Admin Panel

Super administrators with `settings.write` can switch the active map stack from:

`Admin Panel → Platform Settings → Maps & Location Providers`

The runtime selection is stored inside the existing versioned platform-settings JSON record, so it does not require a schema migration. The API reads it through the existing 60-second settings cache and immediately refreshes the cache after a successful save.

Runtime settings may select providers separately for:

- map tiles;
- address search;
- reverse geocoding;
- directions;
- operation-specific fallbacks.

When runtime control is disabled, the deployment environment remains the source of truth. If the settings database is temporarily unavailable, Athoo fails safely back to the deployment environment rather than making maps a database-dependent single point of failure.

The Admin Panel exposes only configuration state such as `tomtomConfigured: true`. It never returns API keys, authorization headers, or credential-bearing upstream URLs. Provider secrets continue to live in Render or another deployment secret store.

The administrator can run a guarded live test for tiles, search, reverse geocoding, and directions. Test results contain only status, latency, result counts, and safe capability information.

### Practical switching model

1. Configure credentials for the providers Athoo may use in the deployment secret store.
2. Deploy once with the provider-neutral registry.
3. Switch between those configured providers from the Admin Panel without editing code, rebuilding the mobile app, or changing public API routes.
4. For an unlisted conventional HTTPS/JSON provider, configure the declarative `MAP_CUSTOM_*` adapter once, then select `custom` at runtime.

/**
 * Provider-neutral map configuration.
 *
 * Mobile clients always call Athoo endpoints. Deployments select a built-in
 * provider (TomTom, Mapbox, Photon, Nominatim, OSRM), or configure an arbitrary
 * HTTP provider through the `MAP_CUSTOM_*` templates and response paths.
 */

import { customGeocodingCacheable } from "../maps/providers/custom.ts";
import { envBool, envInt, normalized } from "../maps/utils.ts";

const DEFAULT_DEVELOPMENT_TILE_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export type MapSearchProvider = "photon" | "nominatim" | "mapbox" | "tomtom" | "custom" | "disabled";
export type MapDirectionsProvider = "osrm" | "mapbox" | "tomtom" | "custom" | "disabled";
export type MapTileProvider = "custom" | "mapbox" | "tomtom" | "openstreetmap" | "disabled";

export type MapProviderRuntimeOverrides = {
  enabled?: boolean;
  primaryProvider?: string;
  tileProvider?: string;
  searchProvider?: string;
  reverseProvider?: string;
  directionsProvider?: string;
  searchFallbackProvider?: string;
  reverseFallbackProvider?: string;
  directionsFallbackProvider?: string;
  fallbackEnabled?: boolean;
};

const SEARCH_PROVIDERS = new Set<MapSearchProvider>(["photon", "nominatim", "mapbox", "tomtom", "custom", "disabled"]);
const DIRECTIONS_PROVIDERS = new Set<MapDirectionsProvider>(["osrm", "mapbox", "tomtom", "custom", "disabled"]);
const TILE_PROVIDERS = new Set<MapTileProvider>(["custom", "mapbox", "tomtom", "openstreetmap", "disabled"]);

function runtimeValue(value: unknown): string {
  const candidate = normalized(value).toLowerCase();
  return candidate && candidate !== "environment" ? candidate : "";
}

function allowedProvider<T extends string>(value: unknown, fallback: T, allowed: Set<T>): T {
  const candidate = normalized(value).toLowerCase() as T;
  return candidate && allowed.has(candidate) ? candidate : fallback;
}

export type MapProviderConfiguration = {
  primaryProvider: string;
  tileProvider: MapTileProvider;
  searchProvider: MapSearchProvider;
  reverseProvider: MapSearchProvider;
  directionsProvider: MapDirectionsProvider;
  searchFallbackProvider: MapSearchProvider;
  reverseFallbackProvider: MapSearchProvider;
  directionsFallbackProvider: MapDirectionsProvider;
  fallbackEnabled: boolean;
  mapbox: {
    configured: boolean;
    tokenConfigured: boolean;
    styleOwner: string;
    styleId: string;
    tileSize: 256 | 512;
    tileScale: "" | "@2x";
    countryCodes: string;
    language: string;
    geocodingPermanent: boolean;
    directionsProfile: string;
    geocodingBaseUrl: string;
    directionsBaseUrl: string;
  };
  tomtom: {
    configured: boolean;
    apiKeyConfigured: boolean;
    baseUrl: string;
    countrySet: string;
    language: string;
    mapLayer: string;
    mapStyle: string;
    mapView: string;
    tileSize: 256 | 512;
    routeType: string;
    travelMode: string;
    trafficEnabled: boolean;
  };
  custom: {
    providerId: string;
    tileSize: 256 | 512;
    tileConfigured: boolean;
    searchConfigured: boolean;
    reverseConfigured: boolean;
    directionsConfigured: boolean;
    geocodingCacheable: boolean;
  };
};

export type MapConfigurationStatus = {
  configured: boolean;
  provider: string;
  attribution: string;
  tileSize: 256 | 512;
  productionSafe: boolean;
  source: "configured" | "provider-default" | "development-fallback" | "missing";
  error?: string;
  primaryProvider: string;
  tileProvider: MapTileProvider;
  searchProvider: MapSearchProvider;
  reverseProvider: MapSearchProvider;
  directionsProvider: MapDirectionsProvider;
  searchFallbackProvider: MapSearchProvider;
  reverseFallbackProvider: MapSearchProvider;
  directionsFallbackProvider: MapDirectionsProvider;
  fallbackEnabled: boolean;
  geocodingCacheable: boolean;
  searchCacheable: boolean;
  reverseCacheable: boolean;
  mapboxConfigured: boolean;
  tomtomConfigured: boolean;
  customConfigured: boolean;
};

function normalizeProvider<T extends string>(value: unknown, fallback: T): T {
  const provider = normalized(value).toLowerCase();
  return (provider || fallback) as T;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(
      value
        .replaceAll("{z}", "0")
        .replaceAll("{x}", "0")
        .replaceAll("{y}", "0")
        .replaceAll("{apiKey}", "test")
        .replaceAll("{query}", "test")
        .replaceAll("{limit}", "1")
        .replaceAll("{lat}", "0")
        .replaceAll("{lng}", "0")
        .replaceAll("{originLat}", "0")
        .replaceAll("{originLng}", "0")
        .replaceAll("{destLat}", "0")
        .replaceAll("{destLng}", "0"),
    ).protocol === "https:";
  } catch {
    return false;
  }
}

function hasRequiredTileTokens(value: string): boolean {
  return value.includes("{z}") && value.includes("{x}") && value.includes("{y}");
}

function isDirectOpenStreetMapTileUrl(value: string): boolean {
  try {
    const parsed = new URL(value.replaceAll("{z}", "0").replaceAll("{x}", "0").replaceAll("{y}", "0"));
    return parsed.hostname === "tile.openstreetmap.org" || parsed.hostname.endsWith(".tile.openstreetmap.org");
  } catch {
    return false;
  }
}

function providerDefaults(primaryProvider: string): {
  tile: MapTileProvider;
  search: MapSearchProvider;
  reverse: MapSearchProvider;
  directions: MapDirectionsProvider;
} {
  if (primaryProvider === "mapbox") return { tile: "mapbox", search: "mapbox", reverse: "mapbox", directions: "mapbox" };
  if (primaryProvider === "tomtom") return { tile: "tomtom", search: "tomtom", reverse: "tomtom", directions: "tomtom" };
  if (primaryProvider === "disabled") return { tile: "disabled", search: "disabled", reverse: "disabled", directions: "disabled" };
  if (["open", "openstreetmap", "osm"].includes(primaryProvider)) {
    return { tile: "openstreetmap", search: "photon", reverse: "photon", directions: "osrm" };
  }
  // Any unfamiliar provider name is handled by the declarative custom HTTP adapter.
  return { tile: "custom", search: "custom", reverse: "custom", directions: "custom" };
}

function defaultSearchFallback(primary: MapSearchProvider): MapSearchProvider {
  if (primary === "photon") return "nominatim";
  if (primary === "nominatim") return "photon";
  if (primary === "disabled") return "disabled";
  return "photon";
}

function defaultDirectionsFallback(primary: MapDirectionsProvider): MapDirectionsProvider {
  return primary === "osrm" || primary === "disabled" ? "disabled" : "osrm";
}

function resolveMapboxTileTemplate(config: MapProviderConfiguration): string {
  if (!config.mapbox.configured) return "";
  const { styleOwner, styleId, tileSize, tileScale } = config.mapbox;
  return `https://api.mapbox.com/styles/v1/${encodeURIComponent(styleOwner)}/${encodeURIComponent(styleId)}/tiles/${tileSize}/{z}/{x}/{y}${tileScale}?access_token={apiKey}`;
}

function resolveTomTomTileTemplate(config: MapProviderConfiguration): string {
  if (!config.tomtom.configured) return "";
  const { baseUrl, mapLayer, mapStyle, mapView, tileSize } = config.tomtom;
  const params = new URLSearchParams({ tileSize: String(tileSize), view: mapView, key: "{apiKey}" });
  return `${baseUrl}/map/1/tile/${encodeURIComponent(mapLayer)}/${encodeURIComponent(mapStyle)}/{z}/{x}/{y}.png?${params.toString().replace("%7BapiKey%7D", "{apiKey}")}`;
}

function resolveTileTemplate(config: MapProviderConfiguration): {
  template: string;
  source: MapConfigurationStatus["source"];
} {
  const configuredTemplate = normalized(process.env.MAP_TILE_UPSTREAM_URL);
  if (configuredTemplate) return { template: configuredTemplate, source: "configured" };

  if (config.tileProvider === "tomtom") {
    const template = resolveTomTomTileTemplate(config);
    return { template, source: template ? "provider-default" : "missing" };
  }
  if (config.tileProvider === "mapbox") {
    const template = resolveMapboxTileTemplate(config);
    return { template, source: template ? "provider-default" : "missing" };
  }
  if (config.tileProvider === "custom") {
    const template = normalized(process.env.MAP_CUSTOM_TILE_URL_TEMPLATE);
    return { template, source: template ? "configured" : "missing" };
  }

  const allowDevelopmentFallback =
    process.env.NODE_ENV !== "production" || envBool("MAP_TILE_ALLOW_OSM_DEVELOPMENT", false);
  if (config.tileProvider === "openstreetmap" && allowDevelopmentFallback) {
    return { template: DEFAULT_DEVELOPMENT_TILE_TEMPLATE, source: "development-fallback" };
  }
  return { template: "", source: "missing" };
}

function operationCacheable(provider: MapSearchProvider, config: MapProviderConfiguration): boolean {
  if (provider === "mapbox") return config.mapbox.geocodingPermanent;
  if (provider === "custom") return config.custom.geocodingCacheable;
  return true;
}

export function getMapProviderConfiguration(overrides: MapProviderRuntimeOverrides = {}): MapProviderConfiguration {
  const runtimeEnabled = overrides.enabled === true;
  const runtimePrimaryProvider = runtimeEnabled ? runtimeValue(overrides.primaryProvider) : "";
  const primaryProvider = normalizeProvider(runtimePrimaryProvider || process.env.MAP_PROVIDER, "open");
  const defaults = providerDefaults(primaryProvider);
  const mapboxToken = normalized(process.env.MAPBOX_ACCESS_TOKEN);
  const tomtomApiKey = normalized(process.env.TOMTOM_API_KEY);

  const tileProvider = allowedProvider<MapTileProvider>(
    (runtimeEnabled ? runtimeValue(overrides.tileProvider) : "") || process.env.MAP_TILE_PROVIDER,
    normalized(process.env.MAP_TILE_UPSTREAM_URL) ? "custom" : defaults.tile,
    TILE_PROVIDERS,
  );
  const searchProvider = allowedProvider<MapSearchProvider>(
    (runtimeEnabled ? runtimeValue(overrides.searchProvider) : "") || process.env.MAP_SEARCH_PROVIDER,
    defaults.search,
    SEARCH_PROVIDERS,
  );
  const reverseProvider = allowedProvider<MapSearchProvider>(
    (runtimeEnabled ? runtimeValue(overrides.reverseProvider) : "") || process.env.MAP_REVERSE_PROVIDER,
    searchProvider === "disabled" ? "disabled" : defaults.reverse === defaults.search ? searchProvider : defaults.reverse,
    SEARCH_PROVIDERS,
  );
  const directionsProvider = allowedProvider<MapDirectionsProvider>(
    (runtimeEnabled ? runtimeValue(overrides.directionsProvider) : "") || process.env.MAP_DIRECTIONS_PROVIDER,
    defaults.directions,
    DIRECTIONS_PROVIDERS,
  );

  const mapboxTileSize = envInt("MAPBOX_TILE_SIZE", 512, 256, 512) === 256 ? 256 : 512;
  const tomtomTileSize = envInt("TOMTOM_TILE_SIZE", 256, 256, 512) === 512 ? 512 : 256;
  const customTileSize = envInt("MAP_CUSTOM_TILE_SIZE", 256, 256, 512) === 512 ? 512 : 256;
  const mapboxTileScale: "" | "@2x" = normalized(process.env.MAPBOX_TILE_SCALE) === "@2x" ? "@2x" : "";
  const mapboxStyleOwner = normalized(process.env.MAPBOX_STYLE_OWNER) || "mapbox";
  const mapboxStyleId = normalized(process.env.MAPBOX_STYLE_ID) || "streets-v12";
  const fallbackEnabled = runtimeEnabled && overrides.fallbackEnabled !== undefined
    ? Boolean(overrides.fallbackEnabled)
    : envBool("MAP_PROVIDER_FALLBACK_ENABLED", process.env.NODE_ENV !== "production");

  const customTileTemplate = normalized(process.env.MAP_TILE_UPSTREAM_URL || process.env.MAP_CUSTOM_TILE_URL_TEMPLATE);
  const customSearchTemplate = normalized(process.env.MAP_CUSTOM_SEARCH_URL_TEMPLATE);
  const customReverseTemplate = normalized(process.env.MAP_CUSTOM_REVERSE_URL_TEMPLATE);
  const customDirectionsTemplate = normalized(process.env.MAP_CUSTOM_DIRECTIONS_URL_TEMPLATE);

  const configuration: MapProviderConfiguration = {
    primaryProvider,
    tileProvider,
    searchProvider,
    reverseProvider,
    directionsProvider,
    searchFallbackProvider: allowedProvider<MapSearchProvider>(
      (runtimeEnabled ? runtimeValue(overrides.searchFallbackProvider) : "") || process.env.MAP_SEARCH_FALLBACK_PROVIDER,
      fallbackEnabled ? defaultSearchFallback(searchProvider) : "disabled",
      SEARCH_PROVIDERS,
    ),
    reverseFallbackProvider: allowedProvider<MapSearchProvider>(
      (runtimeEnabled ? runtimeValue(overrides.reverseFallbackProvider) : "") || process.env.MAP_REVERSE_FALLBACK_PROVIDER,
      fallbackEnabled ? defaultSearchFallback(reverseProvider) : "disabled",
      SEARCH_PROVIDERS,
    ),
    directionsFallbackProvider: allowedProvider<MapDirectionsProvider>(
      (runtimeEnabled ? runtimeValue(overrides.directionsFallbackProvider) : "") || process.env.MAP_DIRECTIONS_FALLBACK_PROVIDER,
      fallbackEnabled ? defaultDirectionsFallback(directionsProvider) : "disabled",
      DIRECTIONS_PROVIDERS,
    ),
    fallbackEnabled,
    mapbox: {
      configured: Boolean(mapboxToken && mapboxStyleOwner && mapboxStyleId),
      tokenConfigured: Boolean(mapboxToken),
      styleOwner: mapboxStyleOwner,
      styleId: mapboxStyleId,
      tileSize: mapboxTileSize,
      tileScale: mapboxTileScale,
      countryCodes: normalized(process.env.MAPBOX_COUNTRY_CODES) || normalized(process.env.MAP_COUNTRY_CODE) || "pk",
      language: normalized(process.env.MAPBOX_LANGUAGE) || normalized(process.env.MAP_LANGUAGE) || "en",
      geocodingPermanent: envBool("MAPBOX_GEOCODING_PERMANENT", false),
      directionsProfile: normalized(process.env.MAPBOX_DIRECTIONS_PROFILE) || "mapbox/driving",
      geocodingBaseUrl: normalized(process.env.MAPBOX_GEOCODING_BASE_URL) || "https://api.mapbox.com/search/geocode/v6",
      directionsBaseUrl: normalized(process.env.MAPBOX_DIRECTIONS_BASE_URL) || "https://api.mapbox.com/directions/v5",
    },
    tomtom: {
      configured: Boolean(tomtomApiKey),
      apiKeyConfigured: Boolean(tomtomApiKey),
      baseUrl: normalized(process.env.TOMTOM_BASE_URL).replace(/\/+$/, "") || "https://api.tomtom.com",
      countrySet: normalized(process.env.TOMTOM_COUNTRY_SET) || normalized(process.env.MAP_COUNTRY_CODE).toUpperCase() || "PK",
      language: normalized(process.env.TOMTOM_MAP_LANGUAGE) || normalized(process.env.MAP_LANGUAGE) || "en-GB",
      mapLayer: normalized(process.env.TOMTOM_MAP_LAYER) || "basic",
      mapStyle: normalized(process.env.TOMTOM_MAP_STYLE) || "main",
      mapView: normalized(process.env.TOMTOM_MAP_VIEW) || "Unified",
      tileSize: tomtomTileSize,
      routeType: normalized(process.env.TOMTOM_ROUTE_TYPE) || "fastest",
      travelMode: normalized(process.env.TOMTOM_TRAVEL_MODE) || "car",
      trafficEnabled: envBool("TOMTOM_TRAFFIC_ENABLED", true),
    },
    custom: {
      providerId: normalized(process.env.MAP_CUSTOM_PROVIDER_ID) || primaryProvider || "custom",
      tileSize: customTileSize,
      tileConfigured: Boolean(customTileTemplate),
      searchConfigured: Boolean(customSearchTemplate),
      reverseConfigured: Boolean(customReverseTemplate),
      directionsConfigured: Boolean(customDirectionsTemplate),
      geocodingCacheable: customGeocodingCacheable(),
    },
  };
  return configuration;
}

function selectedProviderError(config: MapProviderConfiguration): string | null {
  const allProviders = [
    config.tileProvider,
    config.searchProvider,
    config.reverseProvider,
    config.directionsProvider,
    ...(config.fallbackEnabled
      ? [config.searchFallbackProvider, config.reverseFallbackProvider, config.directionsFallbackProvider]
      : []),
  ];
  if (allProviders.includes("tomtom") && !config.tomtom.apiKeyConfigured) return "TOMTOM_API_KEY is required by the selected TomTom services";
  if (allProviders.includes("mapbox") && !config.mapbox.tokenConfigured) return "MAPBOX_ACCESS_TOKEN is required by the selected Mapbox services";
  if (config.searchProvider === "custom" && !config.custom.searchConfigured) return "MAP_CUSTOM_SEARCH_URL_TEMPLATE is required when custom search is selected";
  if (config.reverseProvider === "custom" && !config.custom.reverseConfigured) return "MAP_CUSTOM_REVERSE_URL_TEMPLATE is required when custom reverse geocoding is selected";
  if (config.directionsProvider === "custom" && !config.custom.directionsConfigured) return "MAP_CUSTOM_DIRECTIONS_URL_TEMPLATE is required when custom directions are selected";
  return null;
}

export function getMapConfigurationStatus(overrides: MapProviderRuntimeOverrides = {}): MapConfigurationStatus {
  const config = getMapProviderConfiguration(overrides);
  const { template, source } = resolveTileTemplate(config);
  const provider =
    normalized(process.env.MAP_TILE_PROVIDER_NAME) ||
    (config.tileProvider === "tomtom"
      ? "TomTom"
      : config.tileProvider === "mapbox"
        ? "Mapbox"
        : source === "development-fallback"
          ? "OpenStreetMap development tiles"
          : config.tileProvider === "custom"
            ? config.custom.providerId
            : config.tileProvider);
  const attribution =
    normalized(process.env.MAP_TILE_ATTRIBUTION) ||
    (config.tileProvider === "tomtom"
      ? "© TomTom | © OpenStreetMap contributors"
      : config.tileProvider === "mapbox"
        ? "© Mapbox © OpenStreetMap contributors"
        : "© OpenStreetMap contributors");

  const tileSize: 256 | 512 = config.tileProvider === "mapbox"
    ? config.mapbox.tileSize
    : config.tileProvider === "tomtom"
      ? config.tomtom.tileSize
      : config.tileProvider === "custom"
        ? config.custom.tileSize
        : 256;
  const searchCacheable = operationCacheable(config.searchProvider, config);
  const reverseCacheable = operationCacheable(config.reverseProvider, config);
  const base = {
    provider,
    attribution,
    tileSize,
    primaryProvider: config.primaryProvider,
    tileProvider: config.tileProvider,
    searchProvider: config.searchProvider,
    reverseProvider: config.reverseProvider,
    directionsProvider: config.directionsProvider,
    searchFallbackProvider: config.searchFallbackProvider,
    reverseFallbackProvider: config.reverseFallbackProvider,
    directionsFallbackProvider: config.directionsFallbackProvider,
    fallbackEnabled: config.fallbackEnabled,
    geocodingCacheable: searchCacheable && reverseCacheable,
    searchCacheable,
    reverseCacheable,
    mapboxConfigured: config.mapbox.configured,
    tomtomConfigured: config.tomtom.configured,
    customConfigured:
      config.custom.tileConfigured || config.custom.searchConfigured || config.custom.reverseConfigured || config.custom.directionsConfigured,
  };

  if (config.tileProvider === "disabled") {
    return { ...base, configured: false, productionSafe: false, source, error: "Map tile provider is disabled" };
  }
  if (!template) {
    const error = config.tileProvider === "tomtom"
      ? "TOMTOM_API_KEY is required for TomTom tiles"
      : config.tileProvider === "mapbox"
        ? "MAPBOX_ACCESS_TOKEN is required for Mapbox tiles"
        : config.tileProvider === "custom"
          ? "MAP_CUSTOM_TILE_URL_TEMPLATE or MAP_TILE_UPSTREAM_URL is required"
          : "MAP_TILE_UPSTREAM_URL is required in production";
    return { ...base, configured: false, productionSafe: false, source, error };
  }
  if (!hasRequiredTileTokens(template)) {
    return { ...base, configured: false, productionSafe: false, source, error: "Map tile template must contain {z}, {x}, and {y}" };
  }
  if (!isHttpsUrl(template)) {
    return { ...base, configured: false, productionSafe: false, source, error: "Map tile template must use HTTPS" };
  }
  if (template.includes("{apiKey}") && !resolveTileApiKey(config)) {
    return { ...base, configured: false, productionSafe: false, source, error: "The selected tile provider requires an API key" };
  }

  const directOsm = isDirectOpenStreetMapTileUrl(template);
  const productionSafe = process.env.NODE_ENV !== "production" || !directOsm;
  if (!productionSafe) {
    return {
      ...base,
      configured: false,
      productionSafe: false,
      source,
      error: "Direct openstreetmap.org tiles are development-only; configure a production tile provider",
    };
  }

  const providerError = selectedProviderError(config);
  if (providerError) return { ...base, configured: false, productionSafe: false, source, error: providerError };
  return { ...base, configured: true, productionSafe, source };
}

function resolveTileApiKey(config: MapProviderConfiguration): string {
  if (config.tileProvider === "tomtom") return normalized(process.env.TOMTOM_API_KEY);
  if (config.tileProvider === "mapbox") return normalized(process.env.MAPBOX_ACCESS_TOKEN);
  return normalized(process.env.MAP_TILE_API_KEY || process.env.MAP_CUSTOM_API_KEY);
}

export function buildMapTileUpstreamUrl(
  z: number,
  x: number,
  y: number,
  overrides: MapProviderRuntimeOverrides = {},
): string {
  const config = getMapProviderConfiguration(overrides);
  const status = getMapConfigurationStatus(overrides);
  if (!status.configured) throw new Error(status.error || "Map tile provider is not configured");
  const { template } = resolveTileTemplate(config);
  const apiKey = resolveTileApiKey(config);
  if (template.includes("{apiKey}") && !apiKey) throw new Error("An API key is required by the configured tile URL");
  return template
    .replaceAll("{z}", String(z))
    .replaceAll("{x}", String(x))
    .replaceAll("{y}", String(y))
    .replaceAll("{apiKey}", encodeURIComponent(apiKey));
}

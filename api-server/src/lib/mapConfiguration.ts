const DEFAULT_DEVELOPMENT_TILE_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function normalized(value: unknown): string {
  return String(value || "").trim();
}

function normalizeProvider(value: unknown, fallback: string): string {
  const provider = normalized(value).toLowerCase();
  return provider || fallback;
}

function envBool(name: string, fallback = false): boolean {
  const value = normalized(process.env[name]).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(normalized(process.env[name]));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : fallback;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(
      value
        .replace("{z}", "0")
        .replace("{x}", "0")
        .replace("{y}", "0")
        .replace("{apiKey}", "test"),
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
    const parsed = new URL(value.replace("{z}", "0").replace("{x}", "0").replace("{y}", "0"));
    return parsed.hostname === "tile.openstreetmap.org" || parsed.hostname.endsWith(".tile.openstreetmap.org");
  } catch {
    return false;
  }
}

export type MapSearchProvider = "photon" | "nominatim" | "mapbox" | "disabled";
export type MapDirectionsProvider = "osrm" | "mapbox" | "disabled";
export type MapTileProvider = "custom" | "mapbox" | "openstreetmap" | "disabled";

export type MapProviderConfiguration = {
  primaryProvider: string;
  tileProvider: MapTileProvider;
  searchProvider: MapSearchProvider;
  reverseProvider: MapSearchProvider;
  directionsProvider: MapDirectionsProvider;
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
};

export type MapConfigurationStatus = {
  configured: boolean;
  provider: string;
  attribution: string;
  productionSafe: boolean;
  source: "configured" | "provider-default" | "development-fallback" | "missing";
  error?: string;
  primaryProvider: string;
  tileProvider: MapTileProvider;
  searchProvider: MapSearchProvider;
  reverseProvider: MapSearchProvider;
  directionsProvider: MapDirectionsProvider;
  fallbackEnabled: boolean;
  geocodingCacheable: boolean;
  searchCacheable: boolean;
  reverseCacheable: boolean;
  mapboxConfigured: boolean;
};

function resolveMapboxTileTemplate(config: MapProviderConfiguration): string {
  if (!config.mapbox.configured) return "";
  const { styleOwner, styleId, tileSize, tileScale } = config.mapbox;
  return `https://api.mapbox.com/styles/v1/${encodeURIComponent(styleOwner)}/${encodeURIComponent(styleId)}/tiles/${tileSize}/{z}/{x}/{y}${tileScale}?access_token={apiKey}`;
}

function resolveTileTemplate(config: MapProviderConfiguration): {
  template: string;
  source: MapConfigurationStatus["source"];
} {
  const configuredTemplate = normalized(process.env.MAP_TILE_UPSTREAM_URL);
  if (configuredTemplate) return { template: configuredTemplate, source: "configured" };

  if (config.tileProvider === "mapbox") {
    const template = resolveMapboxTileTemplate(config);
    return { template, source: template ? "provider-default" : "missing" };
  }

  const allowDevelopmentFallback =
    process.env.NODE_ENV !== "production" || envBool("MAP_TILE_ALLOW_OSM_DEVELOPMENT", false);
  if (config.tileProvider === "openstreetmap" && allowDevelopmentFallback) {
    return { template: DEFAULT_DEVELOPMENT_TILE_TEMPLATE, source: "development-fallback" };
  }

  return { template: "", source: "missing" };
}

export function getMapProviderConfiguration(): MapProviderConfiguration {
  const primaryProvider = normalizeProvider(process.env.MAP_PROVIDER, "open");
  const mapboxToken = normalized(process.env.MAPBOX_ACCESS_TOKEN);
  const mapboxRequested = primaryProvider === "mapbox";

  const tileProvider = normalizeProvider(
    process.env.MAP_TILE_PROVIDER,
    normalized(process.env.MAP_TILE_UPSTREAM_URL) ? "custom" : mapboxRequested ? "mapbox" : "openstreetmap",
  ) as MapTileProvider;
  const searchProvider = normalizeProvider(
    process.env.MAP_SEARCH_PROVIDER,
    mapboxRequested ? "mapbox" : "photon",
  ) as MapSearchProvider;
  const reverseProvider = normalizeProvider(
    process.env.MAP_REVERSE_PROVIDER,
    searchProvider === "disabled" ? "disabled" : searchProvider,
  ) as MapSearchProvider;
  const directionsProvider = normalizeProvider(
    process.env.MAP_DIRECTIONS_PROVIDER,
    mapboxRequested ? "mapbox" : "osrm",
  ) as MapDirectionsProvider;

  const tileSize = envInt("MAPBOX_TILE_SIZE", 512, 256, 512) === 256 ? 256 : 512;
  const requestedScale = normalized(process.env.MAPBOX_TILE_SCALE);
  const tileScale: "" | "@2x" = requestedScale === "@2x" ? "@2x" : "";
  const styleOwner = normalized(process.env.MAPBOX_STYLE_OWNER) || "mapbox";
  const styleId = normalized(process.env.MAPBOX_STYLE_ID) || "streets-v12";

  return {
    primaryProvider,
    tileProvider,
    searchProvider,
    reverseProvider,
    directionsProvider,
    fallbackEnabled: envBool("MAP_PROVIDER_FALLBACK_ENABLED", process.env.NODE_ENV !== "production"),
    mapbox: {
      configured: Boolean(mapboxToken && styleOwner && styleId),
      tokenConfigured: Boolean(mapboxToken),
      styleOwner,
      styleId,
      tileSize,
      tileScale,
      countryCodes: normalized(process.env.MAPBOX_COUNTRY_CODES) || "pk",
      language: normalized(process.env.MAPBOX_LANGUAGE) || "en",
      geocodingPermanent: envBool("MAPBOX_GEOCODING_PERMANENT", false),
      directionsProfile: normalized(process.env.MAPBOX_DIRECTIONS_PROFILE) || "mapbox/driving",
      geocodingBaseUrl: normalized(process.env.MAPBOX_GEOCODING_BASE_URL) || "https://api.mapbox.com/search/geocode/v6",
      directionsBaseUrl: normalized(process.env.MAPBOX_DIRECTIONS_BASE_URL) || "https://api.mapbox.com/directions/v5",
    },
  };
}

export function getMapConfigurationStatus(): MapConfigurationStatus {
  const config = getMapProviderConfiguration();
  const { template, source } = resolveTileTemplate(config);
  const provider =
    normalized(process.env.MAP_TILE_PROVIDER_NAME) ||
    (config.tileProvider === "mapbox"
      ? "Mapbox"
      : source === "development-fallback"
        ? "OpenStreetMap development tiles"
        : config.tileProvider === "custom"
          ? "configured tile provider"
          : config.tileProvider);
  const attribution =
    normalized(process.env.MAP_TILE_ATTRIBUTION) ||
    (config.tileProvider === "mapbox" ? "© Mapbox © OpenStreetMap contributors" : "© OpenStreetMap contributors");

  const base = {
    provider,
    attribution,
    primaryProvider: config.primaryProvider,
    tileProvider: config.tileProvider,
    searchProvider: config.searchProvider,
    reverseProvider: config.reverseProvider,
    directionsProvider: config.directionsProvider,
    fallbackEnabled: config.fallbackEnabled,
    geocodingCacheable:
      (config.searchProvider !== "mapbox" || config.mapbox.geocodingPermanent) &&
      (config.reverseProvider !== "mapbox" || config.mapbox.geocodingPermanent),
    searchCacheable: config.searchProvider !== "mapbox" || config.mapbox.geocodingPermanent,
    reverseCacheable: config.reverseProvider !== "mapbox" || config.mapbox.geocodingPermanent,
    mapboxConfigured: config.mapbox.configured,
  };

  if (config.tileProvider === "disabled") {
    return {
      ...base,
      configured: false,
      productionSafe: false,
      source,
      error: "Map tile provider is disabled",
    };
  }
  if (!template) {
    return {
      ...base,
      configured: false,
      productionSafe: false,
      source,
      error:
        config.tileProvider === "mapbox"
          ? "MAPBOX_ACCESS_TOKEN is required for Mapbox tiles"
          : "MAP_TILE_UPSTREAM_URL is required in production",
    };
  }
  if (!hasRequiredTileTokens(template)) {
    return {
      ...base,
      configured: false,
      productionSafe: false,
      source,
      error: "MAP_TILE_UPSTREAM_URL must contain {z}, {x}, and {y}",
    };
  }
  if (!isHttpsUrl(template)) {
    return {
      ...base,
      configured: false,
      productionSafe: false,
      source,
      error: "MAP_TILE_UPSTREAM_URL must use HTTPS",
    };
  }
  if (template.includes("{apiKey}") && !normalized(process.env.MAP_TILE_API_KEY || process.env.MAPBOX_ACCESS_TOKEN)) {
    return {
      ...base,
      configured: false,
      productionSafe: false,
      source,
      error: config.tileProvider === "mapbox" ? "MAPBOX_ACCESS_TOKEN is required" : "MAP_TILE_API_KEY is required",
    };
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

  const mapboxServicesRequested = [config.searchProvider, config.reverseProvider, config.directionsProvider].includes("mapbox");
  if (mapboxServicesRequested && !config.mapbox.tokenConfigured) {
    return {
      ...base,
      configured: false,
      productionSafe: false,
      source,
      error: "MAPBOX_ACCESS_TOKEN is required by the selected Mapbox services",
    };
  }

  return { ...base, configured: true, productionSafe, source };
}

export function buildMapTileUpstreamUrl(z: number, x: number, y: number): string {
  const config = getMapProviderConfiguration();
  const status = getMapConfigurationStatus();
  if (!status.configured) throw new Error(status.error || "Map tile provider is not configured");

  const { template } = resolveTileTemplate(config);
  const apiKey = normalized(process.env.MAP_TILE_API_KEY || process.env.MAPBOX_ACCESS_TOKEN);
  if (template.includes("{apiKey}") && !apiKey) {
    throw new Error(config.tileProvider === "mapbox" ? "MAPBOX_ACCESS_TOKEN is required" : "MAP_TILE_API_KEY is required by the configured tile URL");
  }

  return template
    .replaceAll("{z}", String(z))
    .replaceAll("{x}", String(x))
    .replaceAll("{y}", String(y))
    .replaceAll("{apiKey}", encodeURIComponent(apiKey));
}

import type { DirectionsResult, GeoResult, MapOperationProvider, SearchRequest } from "../types.ts";
import {
  appendQueryParameter,
  envBool,
  fetchWithTimeout,
  getPath,
  numberAt,
  precisionFromText,
  replaceTemplate,
  stringAt,
  validCoordinate,
} from "../utils.ts";

function providerId(): string {
  return String(process.env.MAP_CUSTOM_PROVIDER_ID || process.env.MAP_TILE_PROVIDER_NAME || "custom")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-") || "custom";
}

function parseHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const raw = String(process.env.MAP_CUSTOM_HEADERS_JSON || "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string" && key.trim()) headers[key.trim()] = value;
      }
    } catch {
      // Environment validation reports malformed JSON; runtime remains fail-closed.
    }
  }
  const apiKey = String(process.env.MAP_CUSTOM_API_KEY || process.env.MAP_TILE_API_KEY || "").trim();
  const headerName = String(process.env.MAP_CUSTOM_API_KEY_HEADER || "").trim();
  if (apiKey && headerName) {
    const prefix = String(process.env.MAP_CUSTOM_API_KEY_HEADER_PREFIX || "").trim();
    headers[headerName] = prefix ? `${prefix} ${apiKey}` : apiKey;
  }
  return headers;
}

function configuredUrl(template: string, values: Record<string, string | number | boolean | undefined>): string {
  const apiKey = String(process.env.MAP_CUSTOM_API_KEY || process.env.MAP_TILE_API_KEY || "").trim();
  let url = replaceTemplate(template, { ...values, apiKey });
  const queryParam = String(process.env.MAP_CUSTOM_API_KEY_QUERY_PARAM || "").trim();
  if (apiKey && queryParam && !template.includes("{apiKey}")) url = appendQueryParameter(url, queryParam, apiKey);
  return url;
}

async function requestJson(template: string, values: Record<string, string | number | boolean | undefined>): Promise<unknown | null> {
  if (!template) return null;
  const response = await fetchWithTimeout(configuredUrl(template, values), { headers: parseHeaders() });
  if (!response.ok) return null;
  return response.json();
}

function customSearchResult(item: unknown, index: number): GeoResult | null {
  const lat = numberAt(item, String(process.env.MAP_CUSTOM_SEARCH_LAT_PATH || "position.lat"));
  const lng = numberAt(item, String(process.env.MAP_CUSTOM_SEARCH_LNG_PATH || "position.lon"));
  if (!validCoordinate(lat, lng)) return null;
  const primary = stringAt(item, String(process.env.MAP_CUSTOM_SEARCH_PRIMARY_PATH || "name"));
  const secondary = stringAt(item, String(process.env.MAP_CUSTOM_SEARCH_SECONDARY_PATH || "address"));
  const explicitLabel = stringAt(item, String(process.env.MAP_CUSTOM_SEARCH_LABEL_PATH || "label"));
  const label = explicitLabel || [primary, secondary].filter(Boolean).join(", ");
  if (!label || (!primary && !secondary)) return null;
  const id = stringAt(item, String(process.env.MAP_CUSTOM_SEARCH_ID_PATH || "id"));
  const type = stringAt(item, String(process.env.MAP_CUSTOM_SEARCH_TYPE_PATH || "type"));
  const city = stringAt(item, String(process.env.MAP_CUSTOM_SEARCH_CITY_PATH || "city"));
  const province = stringAt(item, String(process.env.MAP_CUSTOM_SEARCH_PROVINCE_PATH || "province"));
  const postcode = stringAt(item, String(process.env.MAP_CUSTOM_SEARCH_POSTCODE_PATH || "postcode"));
  return {
    placeId: `${providerId()}:${id || `${lat.toFixed(6)}:${lng.toFixed(6)}:${index}`}`,
    label,
    primary: primary || label.split(",")[0] || label,
    secondary,
    lat,
    lng,
    ...(city ? { city } : {}),
    ...(province ? { province } : {}),
    ...(postcode ? { postcode } : {}),
    precision: precisionFromText(type, precisionFromText(process.env.MAP_CUSTOM_SEARCH_DEFAULT_PRECISION, "area")),
    source: providerId(),
  };
}

async function search(request: SearchRequest): Promise<GeoResult[]> {
  const template = String(process.env.MAP_CUSTOM_SEARCH_URL_TEMPLATE || "").trim();
  const data = await requestJson(template, {
    query: request.query,
    limit: request.limit,
    lat: request.bias?.lat,
    lng: request.bias?.lng,
    country: process.env.MAP_COUNTRY_CODE || "PK",
    language: process.env.MAP_LANGUAGE || "en",
  });
  if (data == null) return [];
  const resultsPath = String(process.env.MAP_CUSTOM_SEARCH_RESULTS_PATH || "results");
  const items = getPath(data, resultsPath);
  return Array.isArray(items)
    ? items.map(customSearchResult).filter((result): result is GeoResult => Boolean(result))
    : [];
}

async function reverse({ lat, lng }: { lat: number; lng: number }): Promise<string | null> {
  const template = String(process.env.MAP_CUSTOM_REVERSE_URL_TEMPLATE || "").trim();
  const data = await requestJson(template, {
    lat,
    lng,
    country: process.env.MAP_COUNTRY_CODE || "PK",
    language: process.env.MAP_LANGUAGE || "en",
  });
  if (data == null) return null;
  const addressPath = String(process.env.MAP_CUSTOM_REVERSE_ADDRESS_PATH || "address");
  const address = stringAt(data, addressPath);
  return address.length > 3 ? address : null;
}

async function directions(request: {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}): Promise<DirectionsResult | null> {
  const template = String(process.env.MAP_CUSTOM_DIRECTIONS_URL_TEMPLATE || "").trim();
  const data = await requestJson(template, {
    originLat: request.originLat,
    originLng: request.originLng,
    destLat: request.destLat,
    destLng: request.destLng,
    language: process.env.MAP_LANGUAGE || "en",
  });
  if (data == null) return null;
  const points = getPath(data, String(process.env.MAP_CUSTOM_DIRECTIONS_POINTS_PATH || "routes.0.points"));
  if (!Array.isArray(points)) return null;
  const latPath = String(process.env.MAP_CUSTOM_DIRECTIONS_POINT_LAT_PATH || "latitude");
  const lngPath = String(process.env.MAP_CUSTOM_DIRECTIONS_POINT_LNG_PATH || "longitude");
  const polyline = points
    .map((point) => ({ latitude: numberAt(point, latPath), longitude: numberAt(point, lngPath) }))
    .filter((point) => validCoordinate(point.latitude, point.longitude));
  if (polyline.length < 2) return null;

  const distanceRaw = numberAt(data, String(process.env.MAP_CUSTOM_DIRECTIONS_DISTANCE_PATH || "routes.0.distance"));
  const durationRaw = numberAt(data, String(process.env.MAP_CUSTOM_DIRECTIONS_DURATION_PATH || "routes.0.duration"));
  const distanceKm = Number.isFinite(distanceRaw)
    ? String(process.env.MAP_CUSTOM_DIRECTIONS_DISTANCE_UNIT || "meters").toLowerCase() === "km"
      ? distanceRaw
      : distanceRaw / 1000
    : null;
  const durationMin = Number.isFinite(durationRaw)
    ? String(process.env.MAP_CUSTOM_DIRECTIONS_DURATION_UNIT || "seconds").toLowerCase() === "minutes"
      ? Math.ceil(durationRaw)
      : Math.ceil(durationRaw / 60)
    : null;

  return { polyline, distanceKm, durationMin, source: providerId() };
}

export function customGeocodingCacheable(): boolean {
  return envBool("MAP_CUSTOM_GEOCODING_CACHEABLE", false);
}

export const customProvider: MapOperationProvider = {
  get id() {
    return providerId();
  },
  search,
  reverse,
  directions,
};

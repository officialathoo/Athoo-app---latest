import type { DirectionsResult, GeoResult, MapOperationProvider, SearchRequest } from "../types.ts";
import { baseUrl, envBool, fetchWithTimeout, precisionFromText, validCoordinate } from "../utils.ts";

interface MapboxContextItem {
  name?: string;
}

interface MapboxFeature {
  id?: string;
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: {
    mapbox_id?: string;
    feature_type?: string;
    name?: string;
    name_preferred?: string;
    place_formatted?: string;
    full_address?: string;
    coordinates?: { longitude?: number; latitude?: number; accuracy?: string };
    context?: {
      locality?: MapboxContextItem;
      place?: MapboxContextItem;
      district?: MapboxContextItem;
      region?: MapboxContextItem;
      postcode?: MapboxContextItem;
    };
  };
}

interface MapboxGeocodingResponse {
  features?: MapboxFeature[];
}

interface MapboxDirectionsResponse {
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: [number, number][] };
  }>;
}

function token(): string {
  return String(process.env.MAPBOX_ACCESS_TOKEN || "").trim();
}

function toResult(feature: MapboxFeature): GeoResult | null {
  const properties = feature.properties || {};
  const geometry = feature.geometry?.coordinates || [];
  const lng = Number(properties.coordinates?.longitude ?? geometry[0]);
  const lat = Number(properties.coordinates?.latitude ?? geometry[1]);
  if (!validCoordinate(lat, lng)) return null;
  const context = properties.context || {};
  const primary = String(properties.name_preferred || properties.name || "").trim();
  const secondary = String(properties.place_formatted || "").trim();
  const label = String(properties.full_address || [primary, secondary].filter(Boolean).join(", ")).trim();
  if (label.length < 3 || primary.length < 1) return null;
  return {
    placeId: `mapbox:${properties.mapbox_id || feature.id || `${lat.toFixed(6)}:${lng.toFixed(6)}`}`,
    label,
    primary,
    secondary,
    lat,
    lng,
    city: context.place?.name || context.locality?.name,
    province: context.region?.name,
    postcode: context.postcode?.name,
    precision: precisionFromText(properties.feature_type),
    source: "mapbox",
  };
}

async function search(request: SearchRequest): Promise<GeoResult[]> {
  const accessToken = token();
  if (!accessToken) return [];
  const params = new URLSearchParams({
    q: request.query,
    access_token: accessToken,
    country: String(process.env.MAPBOX_COUNTRY_CODES || process.env.MAP_COUNTRY_CODE || "pk"),
    language: String(process.env.MAPBOX_LANGUAGE || process.env.MAP_LANGUAGE || "en"),
    limit: String(Math.min(10, Math.max(1, request.limit))),
    autocomplete: "true",
    permanent: envBool("MAPBOX_GEOCODING_PERMANENT", false) ? "true" : "false",
  });
  if (request.bias && validCoordinate(request.bias.lat, request.bias.lng)) {
    params.set("proximity", `${request.bias.lng},${request.bias.lat}`);
  }
  const response = await fetchWithTimeout(
    `${baseUrl("MAPBOX_GEOCODING_BASE_URL", "https://api.mapbox.com/search/geocode/v6")}/forward?${params.toString()}`,
    { headers: { Accept: "application/geo+json,application/json" } },
  );
  if (!response.ok) return [];
  const data = (await response.json()) as MapboxGeocodingResponse;
  return Array.isArray(data.features)
    ? data.features.map(toResult).filter((result): result is GeoResult => Boolean(result))
    : [];
}

async function reverse({ lat, lng }: { lat: number; lng: number }): Promise<string | null> {
  const accessToken = token();
  if (!accessToken) return null;
  const params = new URLSearchParams({
    longitude: String(lng),
    latitude: String(lat),
    access_token: accessToken,
    country: String(process.env.MAPBOX_COUNTRY_CODES || process.env.MAP_COUNTRY_CODE || "pk"),
    language: String(process.env.MAPBOX_LANGUAGE || process.env.MAP_LANGUAGE || "en"),
    permanent: envBool("MAPBOX_GEOCODING_PERMANENT", false) ? "true" : "false",
  });
  const response = await fetchWithTimeout(
    `${baseUrl("MAPBOX_GEOCODING_BASE_URL", "https://api.mapbox.com/search/geocode/v6")}/reverse?${params.toString()}`,
    { headers: { Accept: "application/geo+json,application/json" } },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as MapboxGeocodingResponse;
  const first = Array.isArray(data.features) ? data.features.map(toResult).find(Boolean) : null;
  return first?.label || null;
}

async function directions(request: {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}): Promise<DirectionsResult | null> {
  const accessToken = token();
  if (!accessToken) return null;
  const profile = String(process.env.MAPBOX_DIRECTIONS_PROFILE || "mapbox/driving").replace(/^\/+|\/+$/g, "");
  const coordinates = `${request.originLng},${request.originLat};${request.destLng},${request.destLat}`;
  const params = new URLSearchParams({ access_token: accessToken, overview: "full", geometries: "geojson", steps: "false" });
  const response = await fetchWithTimeout(
    `${baseUrl("MAPBOX_DIRECTIONS_BASE_URL", "https://api.mapbox.com/directions/v5")}/${profile}/${coordinates}?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as MapboxDirectionsResponse;
  const route = data.routes?.[0];
  const coordinatesList = route?.geometry?.coordinates || [];
  if (!route || !Array.isArray(coordinatesList) || coordinatesList.length < 2) return null;
  const polyline = coordinatesList
    .filter((coordinate): coordinate is [number, number] => Array.isArray(coordinate) && coordinate.length >= 2)
    .map(([longitude, latitude]) => ({ latitude: Number(latitude), longitude: Number(longitude) }))
    .filter((coordinate) => validCoordinate(coordinate.latitude, coordinate.longitude));
  if (polyline.length < 2) return null;
  return {
    polyline,
    distanceKm: Number.isFinite(route.distance) ? Number(route.distance) / 1000 : null,
    durationMin: Number.isFinite(route.duration) ? Math.ceil(Number(route.duration) / 60) : null,
    source: "mapbox",
  };
}

export const mapboxProvider: MapOperationProvider = { id: "mapbox", search, reverse, directions };

import type { DirectionsResult, GeoResult, MapOperationProvider, SearchRequest } from "../types.ts";
import { baseUrl, envBool, fetchWithTimeout, precisionFromText, validCoordinate } from "../utils.ts";

interface TomTomAddress {
  freeformAddress?: string;
  streetNumber?: string;
  streetName?: string;
  municipalitySubdivision?: string;
  municipality?: string;
  countrySecondarySubdivision?: string;
  countrySubdivision?: string;
  postalCode?: string;
  countryCode?: string;
  countryCodeISO3?: string;
}

interface TomTomPosition {
  lat?: number;
  lon?: number;
}

interface TomTomSearchResult {
  id?: string;
  type?: string;
  dist?: number;
  score?: number;
  poi?: { name?: string };
  address?: TomTomAddress;
  position?: TomTomPosition;
}

interface TomTomSearchResponse {
  results?: TomTomSearchResult[];
}

interface TomTomReverseResponse {
  addresses?: Array<{
    address?: TomTomAddress;
    position?: string;
  }>;
}

interface TomTomRouteResponse {
  routes?: Array<{
    summary?: {
      lengthInMeters?: number;
      travelTimeInSeconds?: number;
    };
    legs?: Array<{
      points?: Array<{ latitude?: number; longitude?: number }>;
    }>;
  }>;
}

function apiKey(): string {
  return String(process.env.TOMTOM_API_KEY || "").trim();
}

function language(): string {
  return String(process.env.TOMTOM_MAP_LANGUAGE || process.env.MAP_LANGUAGE || "en-GB").trim();
}

function countrySet(): string {
  return String(process.env.TOMTOM_COUNTRY_SET || process.env.MAP_COUNTRY_CODE || "PK").trim().toUpperCase();
}

function buildAddressLabel(address: TomTomAddress): string {
  const freeform = String(address.freeformAddress || "").trim();
  if (freeform) return freeform;
  const street = [address.streetNumber, address.streetName].filter(Boolean).join(" ").trim();
  return [street, address.municipalitySubdivision, address.municipality, address.countrySubdivision, address.postalCode]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(", ");
}

function toResult(result: TomTomSearchResult): GeoResult | null {
  const lat = Number(result.position?.lat);
  const lng = Number(result.position?.lon);
  if (!validCoordinate(lat, lng)) return null;
  const address = result.address || {};
  const label = buildAddressLabel(address);
  const primary = String(result.poi?.name || [address.streetNumber, address.streetName].filter(Boolean).join(" ") || address.municipalitySubdivision || address.municipality || "").trim();
  if (label.length < 3 || primary.length < 1) return null;
  const secondary = [
    address.municipalitySubdivision,
    address.municipality,
    address.countrySecondarySubdivision,
    address.countrySubdivision,
    address.postalCode,
  ]
    .filter((value, index, values): value is string => Boolean(value) && value !== primary && values.indexOf(value) === index)
    .join(", ");
  return {
    placeId: `tomtom:${result.id || `${lat.toFixed(6)}:${lng.toFixed(6)}`}`,
    label,
    primary,
    secondary,
    lat,
    lng,
    city: address.municipality,
    province: address.countrySubdivision,
    postcode: address.postalCode,
    precision: precisionFromText(result.type),
    source: "tomtom",
    ...(Number.isFinite(result.dist) ? { distanceKm: Math.round((Number(result.dist) / 1000) * 10) / 10 } : {}),
  };
}

async function search(request: SearchRequest): Promise<GeoResult[]> {
  const key = apiKey();
  if (!key) return [];
  const url = new URL(`${baseUrl("TOMTOM_BASE_URL", "https://api.tomtom.com")}/search/2/search/${encodeURIComponent(request.query)}.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("countrySet", countrySet());
  url.searchParams.set("language", language());
  url.searchParams.set("limit", String(Math.min(100, Math.max(1, request.limit))));
  url.searchParams.set("typeahead", "true");
  if (request.bias && validCoordinate(request.bias.lat, request.bias.lng)) {
    url.searchParams.set("lat", String(request.bias.lat));
    url.searchParams.set("lon", String(request.bias.lng));
  }
  const response = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) return [];
  const data = (await response.json()) as TomTomSearchResponse;
  return Array.isArray(data.results)
    ? data.results.map(toResult).filter((result): result is GeoResult => Boolean(result))
    : [];
}

async function reverse({ lat, lng }: { lat: number; lng: number }): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;
  const url = new URL(`${baseUrl("TOMTOM_BASE_URL", "https://api.tomtom.com")}/search/2/reverseGeocode/${lat},${lng}.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("language", language());
  url.searchParams.set("returnSpeedLimit", "false");
  url.searchParams.set("allowFreeformNewline", "false");
  const response = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const data = (await response.json()) as TomTomReverseResponse;
  const address = data.addresses?.[0]?.address;
  if (!address) return null;
  const label = buildAddressLabel(address);
  return label.length > 3 ? label : null;
}

async function directions(request: {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}): Promise<DirectionsResult | null> {
  const key = apiKey();
  if (!key) return null;
  const locations = `${request.originLat},${request.originLng}:${request.destLat},${request.destLng}`;
  const url = new URL(`${baseUrl("TOMTOM_BASE_URL", "https://api.tomtom.com")}/routing/1/calculateRoute/${locations}/json`);
  url.searchParams.set("key", key);
  url.searchParams.set("routeType", String(process.env.TOMTOM_ROUTE_TYPE || "fastest"));
  url.searchParams.set("traffic", envBool("TOMTOM_TRAFFIC_ENABLED", true) ? "true" : "false");
  url.searchParams.set("travelMode", String(process.env.TOMTOM_TRAVEL_MODE || "car"));
  url.searchParams.set("routeRepresentation", "polyline");
  url.searchParams.set("instructionsType", "none");
  url.searchParams.set("language", language());
  const response = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const data = (await response.json()) as TomTomRouteResponse;
  const route = data.routes?.[0];
  if (!route) return null;
  const polyline = (route.legs || [])
    .flatMap((leg) => leg.points || [])
    .map((point) => ({ latitude: Number(point.latitude), longitude: Number(point.longitude) }))
    .filter((point) => validCoordinate(point.latitude, point.longitude));
  if (polyline.length < 2) return null;
  return {
    polyline,
    distanceKm: Number.isFinite(route.summary?.lengthInMeters) ? Number(route.summary?.lengthInMeters) / 1000 : null,
    durationMin: Number.isFinite(route.summary?.travelTimeInSeconds) ? Math.ceil(Number(route.summary?.travelTimeInSeconds) / 60) : null,
    source: "tomtom",
  };
}

export const tomtomProvider: MapOperationProvider = { id: "tomtom", search, reverse, directions };

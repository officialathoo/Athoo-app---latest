/**
 * Provider-neutral geocoding, map-tile, and routing proxy for Athoo.
 *
 * The mobile app talks only to Athoo APIs. Deployments may select Mapbox,
 * Photon/Nominatim/OSRM, or compatible custom tile providers through server
 * configuration without exposing provider credentials in the app bundle.
 */

import { Router, type Response } from "express";
import { logger } from "../lib/logger";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { buildMapTileUpstreamUrl, getMapConfigurationStatus, getMapProviderConfiguration } from "../lib/mapConfiguration";

const router = Router();

const PHOTON_BASE_URL = String(process.env.PHOTON_BASE_URL || "https://photon.komoot.io").replace(/\/$/, "");
const NOMINATIM_BASE_URL = String(process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const OSRM_BASE_URL = String(process.env.OSRM_BASE_URL || "https://router.project-osrm.org").replace(/\/$/, "");
const NOMINATIM_SEARCH_FALLBACK = process.env.NOMINATIM_SEARCH_FALLBACK === "true";
const MAPBOX_ACCESS_TOKEN = String(process.env.MAPBOX_ACCESS_TOKEN || "").trim();

const MAP_CONTACT_EMAIL = String(process.env.MAP_CONTACT_EMAIL || "support@athoo.pk").trim();
const MAP_USER_AGENT = String(process.env.MAP_USER_AGENT || `AthooApp/1.0 (+https://athoo.pk; contact: ${MAP_CONTACT_EMAIL})`).trim();
const NOMINATIM_HEADERS = {
  "User-Agent": MAP_USER_AGENT,
  "Accept-Language": "en",
  Accept: "application/json",
};

// ─── Shared types ─────────────────────────────────────────────────────────────

interface GeoResult {
  placeId: string;
  label: string;
  primary: string;
  secondary: string;
  lat: number;
  lng: number;
  city?: string;
  province?: string;
  postcode?: string;
  precision: "building" | "street" | "area" | "city" | "region";
  source: "photon" | "nominatim" | "mapbox";
  distanceKm?: number;
}

const GEO_UPSTREAM_TIMEOUT_MS = Number(process.env.GEO_UPSTREAM_TIMEOUT_MS || 6_000);
const GEO_CACHE_MAX_ITEMS = Number(process.env.GEO_CACHE_MAX_ITEMS || 500);
type GeoCacheEntry = { value: unknown; expiresAt: number };
const geoCache = new Map<string, GeoCacheEntry>();

const MAP_TILE_TIMEOUT_MS = Number(process.env.MAP_TILE_TIMEOUT_MS || 8_000);
const MAP_TILE_BROWSER_CACHE_SECONDS = Math.max(60, Number(process.env.MAP_TILE_BROWSER_CACHE_SECONDS || 86_400));
const MAP_TILE_CDN_CACHE_SECONDS = Math.max(MAP_TILE_BROWSER_CACHE_SECONDS, Number(process.env.MAP_TILE_CDN_CACHE_SECONDS || 604_800));
const MAP_TILE_MAX_BYTES = Math.max(64 * 1024, Number(process.env.MAP_TILE_MAX_BYTES || 2 * 1024 * 1024));
const configuredMapTileMaxZoom = Number(process.env.MAP_TILE_MAX_ZOOM || 20);
const MAP_TILE_MAX_ZOOM = Number.isFinite(configuredMapTileMaxZoom)
  ? Math.max(1, Math.min(22, Math.trunc(configuredMapTileMaxZoom)))
  : 20;
const MAP_TILE_RESPECT_UPSTREAM_CACHE = String(process.env.MAP_TILE_RESPECT_UPSTREAM_CACHE || "true").toLowerCase() !== "false";

function validTileCoordinate(z: number, x: number, y: number): boolean {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > MAP_TILE_MAX_ZOOM) return false;
  const max = 2 ** z;
  return x >= 0 && y >= 0 && x < max && y < max;
}

// Public, cacheable map tile proxy. No user data is exposed and the upstream
// provider/key remain server-side. Production refuses the volunteer OSM tile
// endpoint unless an explicit provider is configured.
router.get("/tiles/:z/:x/:y.png", async (req, res) => {
  const z = Number(req.params.z);
  const x = Number(req.params.x);
  const y = Number(req.params.y);
  if (!validTileCoordinate(z, x, y)) {
    res.status(400).json({ error: "Invalid map tile coordinates" });
    return;
  }

  const status = getMapConfigurationStatus();
  if (!status.configured) {
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      error: "Map preview is temporarily unavailable",
      code: "MAP_TILE_PROVIDER_NOT_CONFIGURED",
    });
    return;
  }

  try {
    const upstreamUrl = buildMapTileUpstreamUrl(z, x, y);
    const upstream = await fetchWithTimeout(upstreamUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8",
        "User-Agent": String(process.env.MAP_TILE_USER_AGENT || "AthooApp/1.0 (+https://athoo.pk)"),
      },
    }, MAP_TILE_TIMEOUT_MS);

    const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
    if (!upstream.ok || !contentType.startsWith("image/")) {
      logger.warn({ status: upstream.status, contentType, provider: status.provider, z, x, y }, "map tile upstream rejected request");
      res.setHeader("Cache-Control", "no-store");
      res.status(502).json({ error: "Map preview could not be loaded", code: "MAP_TILE_UPSTREAM_FAILED" });
      return;
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    if (!body.length) {
      res.setHeader("Cache-Control", "no-store");
      res.status(502).json({ error: "Map preview could not be loaded", code: "MAP_TILE_EMPTY_RESPONSE" });
      return;
    }
    if (body.length > MAP_TILE_MAX_BYTES) {
      logger.warn({ bytes: body.length, maxBytes: MAP_TILE_MAX_BYTES, provider: status.provider, z, x, y }, "map tile exceeded size limit");
      res.setHeader("Cache-Control", "no-store");
      res.status(502).json({ error: "Map preview could not be loaded", code: "MAP_TILE_RESPONSE_TOO_LARGE" });
      return;
    }

    res.setHeader("Content-Type", contentType);
    const upstreamCacheControl = String(upstream.headers.get("cache-control") || "").trim();
    res.setHeader(
      "Cache-Control",
      MAP_TILE_RESPECT_UPSTREAM_CACHE && upstreamCacheControl
        ? upstreamCacheControl
        : `public, max-age=${MAP_TILE_BROWSER_CACHE_SECONDS}, s-maxage=${MAP_TILE_CDN_CACHE_SECONDS}, stale-while-revalidate=86400, stale-if-error=604800`,
    );
    res.setHeader("X-Map-Provider", status.provider);
    const etag = upstream.headers.get("etag");
    if (etag) res.setHeader("ETag", etag);
    res.status(200).send(body);
  } catch (error) {
    logger.warn({ err: error, provider: status.provider, z, x, y }, "map tile proxy unavailable");
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ error: "Map preview is temporarily unavailable", code: "MAP_TILE_TEMPORARILY_UNAVAILABLE" });
  }
});

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = GEO_UPSTREAM_TIMEOUT_MS): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function getCached<T>(key: string): T | null {
  const entry = geoCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    geoCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached(key: string, value: unknown, ttlMs: number): void {
  if (geoCache.size >= GEO_CACHE_MAX_ITEMS) {
    const now = Date.now();
    for (const [cacheKey, entry] of geoCache) {
      if (entry.expiresAt <= now || geoCache.size >= GEO_CACHE_MAX_ITEMS) geoCache.delete(cacheKey);
    }
  }
  geoCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function validCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// ─── Photon (Komoot) helpers ───────────────────────────────────────────────────
// Photon indexes OpenStreetMap with Elasticsearch for better relevance scoring.
// No API key required. Returns real street/landmark names for Pakistan.

interface PhotonFeature {
  type: "Feature";
  properties: {
    name?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;       // "house" | "street" | "locality" | "district" | "city" | "other"
    street?: string;     // parent street (when type=house)
    housenumber?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    countrycode?: string;
  };
  geometry: { type: "Point"; coordinates: [number, number] }; // [lng, lat]
}

interface PhotonResponse {
  features: PhotonFeature[];
}

interface OsrmRoute {
  distance?: number;
  duration?: number;
  geometry?: {
    coordinates?: [number, number][];
  };
}

interface OsrmResponse {
  code?: string;
  routes?: OsrmRoute[];
}

interface MapboxContextItem {
  name?: string;
  region_code?: string;
  country_code?: string;
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
      address?: MapboxContextItem;
      street?: MapboxContextItem;
      neighborhood?: MapboxContextItem;
      locality?: MapboxContextItem;
      place?: MapboxContextItem;
      district?: MapboxContextItem;
      region?: MapboxContextItem;
      postcode?: MapboxContextItem;
      country?: MapboxContextItem;
    };
  };
}

interface MapboxGeocodingResponse {
  features?: MapboxFeature[];
}

interface MapboxDirectionsResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: [number, number][] };
  }>;
}

const PHOTON_HEADERS = {
  "User-Agent": "AthooApp/1.0",
  Accept: "application/json",
};

// Types ordered most-specific → least-specific for Pakistan
const PHOTON_TYPE_RANK: Record<string, number> = {
  house: 1,
  other: 2,    // parks, landmarks, mosques, schools, shops
  street: 3,
  locality: 4,
  district: 5,
  city: 6,
  county: 7,
  state: 8,
  country: 9,
};

function photonFeatureRank(f: PhotonFeature): number {
  return PHOTON_TYPE_RANK[f.properties.type ?? ""] ?? 10;
}

/**
 * Build a clean Pakistani address label from a Photon feature.
 * Format: "[housenumber] [street/name], [area/district], [city]"
 */
function buildPhotonLabel(p: PhotonFeature["properties"]): string {
  const parts: string[] = [];

  if (p.housenumber && p.street) {
    parts.push(`${p.housenumber} ${p.street}`);
  } else if (p.housenumber && p.name && p.name !== p.street) {
    parts.push(`${p.housenumber} ${p.name}`);
  } else if (p.street && p.type === "house") {
    parts.push(p.street);
  } else if (p.name && p.type !== "city" && p.type !== "state" && p.type !== "country") {
    // Named place/street — only include if it adds info beyond city
    if (!p.city || p.name.toLowerCase() !== p.city.toLowerCase()) {
      parts.push(p.name);
    }
  }

  const area = p.district;
  if (area && area !== p.city) parts.push(area);

  if (p.city) parts.push(p.city);

  const unique = [...new Set(parts.filter(Boolean))];
  return unique.join(", ");
}

function photonPrecision(type: string | undefined): GeoResult["precision"] {
  if (type === "house") return "building";
  if (type === "street") return "street";
  if (type === "locality" || type === "district" || type === "other") return "area";
  if (type === "city" || type === "county") return "city";
  return "region";
}

function photonResult(feature: PhotonFeature): GeoResult | null {
  const [lng, lat] = feature.geometry?.coordinates || [];
  if (!validCoordinate(Number(lat), Number(lng))) return null;
  const p = feature.properties || {};
  const label = buildPhotonLabel(p);
  if (label.length < 3) return null;
  const primary = p.housenumber && p.street
    ? `${p.housenumber} ${p.street}`
    : p.name || p.street || p.district || p.city || label.split(",")[0] || label;
  const secondary = [p.district, p.city, p.state, p.postcode]
    .filter((value, index, values): value is string => Boolean(value) && value !== primary && values.indexOf(value) === index)
    .join(", ");
  const identity = `${p.osm_key || "place"}:${p.osm_value || p.type || "unknown"}:${Number(lat).toFixed(6)}:${Number(lng).toFixed(6)}`;
  return {
    placeId: `photon:${identity}`,
    label,
    primary,
    secondary,
    lat: Number(lat),
    lng: Number(lng),
    city: p.city,
    province: p.state,
    postcode: p.postcode,
    precision: photonPrecision(p.type),
    source: "photon",
  };
}

async function photonReverse(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${PHOTON_BASE_URL}/reverse?lat=${lat}&lon=${lng}&limit=5&lang=en`;
    const res = await fetchWithTimeout(url, { headers: PHOTON_HEADERS });
    if (!res.ok) return null;
    const data = (await res.json()) as PhotonResponse;
    if (!data.features?.length) return null;

    // Sort: most specific first (house > landmark > street > area > city)
    const sorted = [...data.features].sort(
      (a, b) => photonFeatureRank(a) - photonFeatureRank(b),
    );

    // Try to build the richest non-admin label
    for (const f of sorted) {
      // Skip purely administrative features (no street/name useful to the user)
      if (["county", "state", "country"].includes(f.properties.type ?? "")) continue;
      const label = buildPhotonLabel(f.properties);
      if (label && label.length > 4 && label.includes(",")) return label;
    }

    // If no multi-part label, use the best available single-feature label
    const best = sorted[0];
    const label = buildPhotonLabel(best.properties);
    return label.length > 2 ? label : null;
  } catch {
    return null;
  }
}

async function photonSearch(
  q: string,
  limit = 8,
  bias?: { lat: number; lng: number },
): Promise<GeoResult[]> {
  try {
    const biasParams = bias && validCoordinate(bias.lat, bias.lng)
      ? `&lat=${bias.lat}&lon=${bias.lng}`
      : "";
    const url =
      `${PHOTON_BASE_URL}/api` +
      `?q=${encodeURIComponent(q)}` +
      `&countrycodes=pk&limit=${limit}&lang=en${biasParams}`;
    const res = await fetchWithTimeout(url, { headers: PHOTON_HEADERS });
    if (!res.ok) return [];
    const data = (await res.json()) as PhotonResponse;
    if (!Array.isArray(data.features)) return [];
    return data.features
      .map(photonResult)
      .filter((result): result is GeoResult => Boolean(result));
  } catch {
    return [];
  }
}

// ─── Mapbox helpers ────────────────────────────────────────────────────────────

function mapboxPrecision(type: string | undefined): GeoResult["precision"] {
  if (type === "address") return "building";
  if (type === "street") return "street";
  if (["neighborhood", "locality", "district"].includes(type || "")) return "area";
  if (type === "place") return "city";
  return "region";
}

function mapboxResult(feature: MapboxFeature): GeoResult | null {
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
    precision: mapboxPrecision(properties.feature_type),
    source: "mapbox",
  };
}

async function mapboxSearch(
  q: string,
  limit = 8,
  bias?: { lat: number; lng: number },
): Promise<GeoResult[]> {
  const config = getMapProviderConfiguration();
  if (!MAPBOX_ACCESS_TOKEN || !config.mapbox.tokenConfigured) return [];
  try {
    const params = new URLSearchParams({
      q,
      access_token: MAPBOX_ACCESS_TOKEN,
      country: config.mapbox.countryCodes,
      language: config.mapbox.language,
      limit: String(Math.min(10, Math.max(1, limit))),
      autocomplete: "true",
      permanent: config.mapbox.geocodingPermanent ? "true" : "false",
    });
    if (bias && validCoordinate(bias.lat, bias.lng)) {
      params.set("proximity", `${bias.lng},${bias.lat}`);
    }
    const res = await fetchWithTimeout(`${config.mapbox.geocodingBaseUrl}/forward?${params.toString()}`, {
      headers: { Accept: "application/geo+json,application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as MapboxGeocodingResponse;
    return Array.isArray(data.features)
      ? data.features.map(mapboxResult).filter((result): result is GeoResult => Boolean(result))
      : [];
  } catch {
    return [];
  }
}

async function mapboxReverse(lat: number, lng: number): Promise<string | null> {
  const config = getMapProviderConfiguration();
  if (!MAPBOX_ACCESS_TOKEN || !config.mapbox.tokenConfigured) return null;
  try {
    const params = new URLSearchParams({
      longitude: String(lng),
      latitude: String(lat),
      access_token: MAPBOX_ACCESS_TOKEN,
      country: config.mapbox.countryCodes,
      language: config.mapbox.language,
      permanent: config.mapbox.geocodingPermanent ? "true" : "false",
    });
    const res = await fetchWithTimeout(`${config.mapbox.geocodingBaseUrl}/reverse?${params.toString()}`, {
      headers: { Accept: "application/geo+json,application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as MapboxGeocodingResponse;
    const first = Array.isArray(data.features) ? data.features.map(mapboxResult).find(Boolean) : null;
    return first?.label || null;
  } catch {
    return null;
  }
}

async function mapboxDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<{ polyline: { latitude: number; longitude: number }[]; distanceKm: number | null; durationMin: number | null; source: "mapbox" } | null> {
  const config = getMapProviderConfiguration();
  if (!MAPBOX_ACCESS_TOKEN || !config.mapbox.tokenConfigured) return null;
  try {
    const profile = config.mapbox.directionsProfile.replace(/^\/+|\/+$/g, "");
    const coordinates = `${originLng},${originLat};${destLng},${destLat}`;
    const params = new URLSearchParams({
      access_token: MAPBOX_ACCESS_TOKEN,
      overview: "full",
      geometries: "geojson",
      steps: "false",
    });
    const url = `${config.mapbox.directionsBaseUrl}/${profile}/${coordinates}?${params.toString()}`;
    const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data = (await response.json()) as MapboxDirectionsResponse;
    const route = data.routes?.[0];
    const coordinatesList = route?.geometry?.coordinates || [];
    if (!route || !Array.isArray(coordinatesList) || coordinatesList.length < 2) return null;
    return {
      polyline: coordinatesList
        .filter((coordinate): coordinate is [number, number] => Array.isArray(coordinate) && coordinate.length >= 2)
        .map(([longitude, latitude]) => ({ latitude: Number(latitude), longitude: Number(longitude) }))
        .filter((coordinate) => validCoordinate(coordinate.latitude, coordinate.longitude)),
      distanceKm: Number.isFinite(route.distance) ? Number(route.distance) / 1000 : null,
      durationMin: Number.isFinite(route.duration) ? Math.ceil(Number(route.duration) / 60) : null,
      source: "mapbox",
    };
  } catch {
    return null;
  }
}

// ─── Nominatim helpers ─────────────────────────────────────────────────────────

interface NominatimItem {
  place_id?: number | string;
  name?: string;
  display_name: string;
  type?: string;
  category?: string;
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    city_district?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
  };
}

function cleanNominatimLabel(item: NominatimItem): string {
  const addr = item.address || {};
  const parts: string[] = [];

  if (item.name && !/^\d/.test(item.name)) parts.push(item.name);
  if (addr.house_number && addr.road) parts.push(`${addr.house_number} ${addr.road}`);
  else if (addr.road) parts.push(addr.road);

  const area = addr.neighbourhood || addr.suburb || addr.quarter || addr.city_district;
  if (area && area !== item.name) parts.push(area);

  const city = addr.city || addr.town || addr.village || addr.county;
  if (city) parts.push(city);

  const unique = parts.filter((p, i) => p && p !== parts[i - 1]);
  if (unique.length > 0) return unique.join(", ");
  return item.display_name.split(",").slice(0, 4).join(",").trim();
}

function nominatimPrecision(item: NominatimItem): GeoResult["precision"] {
  const type = String(item.type || "").toLowerCase();
  if (["house", "building", "apartments", "commercial"].includes(type)) return "building";
  if (["road", "street", "residential", "service"].includes(type)) return "street";
  if (["neighbourhood", "suburb", "quarter", "village", "town"].includes(type)) return "area";
  if (["city", "municipality", "county"].includes(type)) return "city";
  return "region";
}

function nominatimResult(item: NominatimItem): GeoResult | null {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  if (!validCoordinate(lat, lng)) return null;
  const address = item.address || {};
  const label = cleanNominatimLabel(item);
  if (label.length < 3) return null;
  const primary = item.name || (address.house_number && address.road ? `${address.house_number} ${address.road}` : address.road) || label.split(",")[0] || label;
  const city = address.city || address.town || address.village || address.county;
  const secondary = [address.neighbourhood, address.suburb, address.quarter, address.city_district, city, address.state, address.postcode]
    .filter((value, index, values): value is string => Boolean(value) && value !== primary && values.indexOf(value) === index)
    .join(", ");
  return {
    placeId: `nominatim:${item.place_id || `${lat.toFixed(6)}:${lng.toFixed(6)}`}`,
    label,
    primary,
    secondary,
    lat,
    lng,
    city,
    province: address.state,
    postcode: address.postcode,
    precision: nominatimPrecision(item),
    source: "nominatim",
  };
}

async function nominatimSearch(
  q: string,
  limit = 8,
  bias?: { lat: number; lng: number },
): Promise<GeoResult[]> {
  try {
    const delta = 1.25;
    const viewbox = bias && validCoordinate(bias.lat, bias.lng)
      ? `&viewbox=${bias.lng - delta},${bias.lat + delta},${bias.lng + delta},${bias.lat - delta}`
      : "";
    const url =
      `${NOMINATIM_BASE_URL}/search` +
      `?q=${encodeURIComponent(q)}&countrycodes=pk&format=jsonv2` +
      `&limit=${limit}&addressdetails=1&namedetails=1&dedupe=1&accept-language=en${viewbox}`;
    const res = await fetchWithTimeout(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return (data as NominatimItem[])
      .map(nominatimResult)
      .filter((result): result is GeoResult => Boolean(result));
  } catch {
    return [];
  }
}

async function nominatimReverse(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `${NOMINATIM_BASE_URL}/reverse` +
      `?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1&namedetails=1&zoom=18&accept-language=en`;
    const res = await fetchWithTimeout(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimItem;
    const addr = data.address || {};

    if (addr.road || addr.neighbourhood || addr.suburb || data.name) {
      return cleanNominatimLabel(data);
    }

    // Admin-boundary only — try nearby named places
    const delta = 0.005;
    const nearUrl =
      `${NOMINATIM_BASE_URL}/search` +
      `?format=jsonv2&addressdetails=1&limit=5` +
      `&viewbox=${lng - delta},${lat - delta},${lng + delta},${lat + delta}` +
      `&bounded=1&accept-language=en`;
    const nearRes = await fetchWithTimeout(nearUrl, { headers: NOMINATIM_HEADERS });
    if (!nearRes.ok) return null;
    const items = (await nearRes.json()) as NominatimItem[];
    if (Array.isArray(items) && items.length > 0) {
      const named = items.find((i) => i.name && i.name.length > 1);
      if (named) return cleanNominatimLabel(named);
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Merge helpers ─────────────────────────────────────────────────────────────

function mergeResults(primary: GeoResult[], ...rest: GeoResult[][]): GeoResult[] {
  const seen = new Set<string>();
  const out: GeoResult[] = [];
  for (const result of [primary, ...rest].flat()) {
    const key = `${Math.round(result.lat * 100000)},${Math.round(result.lng * 100000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(result);
  }
  return out;
}

function precisionRank(value: GeoResult["precision"]): number {
  return { building: 0, street: 1, area: 2, city: 3, region: 4 }[value];
}

function rankSearchResults(results: GeoResult[], bias?: { lat: number; lng: number }): GeoResult[] {
  return results
    .map((result) => {
      const distanceKm = bias && validCoordinate(bias.lat, bias.lng)
        ? haversineKm(bias.lat, bias.lng, result.lat, result.lng)
        : undefined;
      return { ...result, ...(distanceKm == null ? {} : { distanceKm: Math.round(distanceKm * 10) / 10 }) };
    })
    .sort((a, b) => {
      const precisionDifference = precisionRank(a.precision) - precisionRank(b.precision);
      if (precisionDifference !== 0) return precisionDifference;
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      if (a.source !== b.source) return a.source === "photon" ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
}

// ── GET /api/geo/search?q=... ──────────────────────────────────────────────────
router.get("/search", requireAuth, async (req: AuthRequest, res: Response) => {
  const q = String(req.query.q || "").replace(/\s+/g, " ").trim();
  const biasLat = Number(req.query.lat);
  const biasLng = Number(req.query.lng);
  const bias = validCoordinate(biasLat, biasLng) ? { lat: biasLat, lng: biasLng } : undefined;
  const requestedLimit = Number(req.query.limit || 10);
  const limit = Math.min(15, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 10));

  if (q.length < 3 || q.length > 160) {
    res.json({ results: [], source: "validation" });
    return;
  }

  try {
    const config = getMapProviderConfiguration();
    const biasKey = bias ? `${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : "pk";
    const cacheable = config.searchProvider !== "mapbox" || config.mapbox.geocodingPermanent;
    const cacheKey = `search:${config.searchProvider}:${q.toLowerCase()}:${biasKey}:${limit}`;
    const cached = cacheable ? getCached<GeoResult[]>(cacheKey) : null;
    if (cached) {
      res.json({ results: cached, source: `${config.searchProvider}-cache`, cacheable: true });
      return;
    }

    let primaryResults: GeoResult[] = [];
    if (config.searchProvider === "mapbox") {
      primaryResults = await mapboxSearch(q, limit, bias);
    } else if (config.searchProvider === "nominatim") {
      primaryResults = await nominatimSearch(q, Math.min(limit, 10), bias);
    } else if (config.searchProvider === "photon") {
      primaryResults = await photonSearch(q, Math.min(limit, 12), bias);
    }

    let fallbackResults: GeoResult[] = [];
    if (config.fallbackEnabled && primaryResults.length < Math.min(4, limit)) {
      if (config.searchProvider === "mapbox" || config.searchProvider === "nominatim") {
        fallbackResults = await photonSearch(q, Math.min(limit, 8), bias);
      } else if (config.searchProvider === "photon" && NOMINATIM_SEARCH_FALLBACK) {
        fallbackResults = await nominatimSearch(q, Math.min(5, limit), bias);
      }
    }

    const results = rankSearchResults(mergeResults(primaryResults, fallbackResults), bias).slice(0, limit);
    if (cacheable) setCached(cacheKey, results, 5 * 60 * 1000);
    res.json({
      results,
      source: results.length ? config.searchProvider : "unavailable",
      cacheable,
    });
  } catch (error) {
    logger.warn({ err: error }, "geo search upstream unavailable");
    res.json({ results: [], source: "unavailable", cacheable: false });
  }
});

// ── GET /api/geo/reverse?lat=...&lng=... ──────────────────────────────────────
router.get("/reverse", requireAuth, async (req: AuthRequest, res: Response) => {
  const lat = parseFloat(String(req.query.lat || ""));
  const lng = parseFloat(String(req.query.lng || ""));

  if (!validCoordinate(lat, lng)) {
    res.status(400).json({ error: "Invalid coordinates" });
    return;
  }

  const config = getMapProviderConfiguration();
  const cacheable = config.reverseProvider !== "mapbox" || config.mapbox.geocodingPermanent;
  const cacheKey = `reverse:${config.reverseProvider}:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = cacheable ? getCached<{ address: string; source: string }>(cacheKey) : null;
  if (cached) {
    res.json({ ...cached, source: `${cached.source}-cache`, cacheable: true });
    return;
  }

  try {
    let address: string | null = null;
    let source = config.reverseProvider;
    if (config.reverseProvider === "mapbox") address = await mapboxReverse(lat, lng);
    else if (config.reverseProvider === "nominatim") address = await nominatimReverse(lat, lng);
    else if (config.reverseProvider === "photon") address = await photonReverse(lat, lng);

    if (!address && config.fallbackEnabled) {
      if (config.reverseProvider === "mapbox" || config.reverseProvider === "nominatim") {
        address = await photonReverse(lat, lng);
        if (address) source = "photon";
      } else if (config.reverseProvider === "photon") {
        address = await nominatimReverse(lat, lng);
        if (address) source = "nominatim";
      }
    }

    const result = address && address.length > 4
      ? { address, source, cacheable }
      : { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: "coords", cacheable: true };

    if (result.cacheable) {
      setCached(cacheKey, result, result.source === "coords" ? 60_000 : 24 * 60 * 60 * 1000);
    }
    res.json(result);
  } catch (e) {
    logger.warn({ err: e }, "geo reverse upstream unavailable");
    res.json({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: "coords", cacheable: true });
  }
});

// ── GET /api/geo/directions?originLat=&originLng=&destLat=&destLng= ──────────
// Returns a road polyline, distance (km), and ETA (minutes) for provider navigation.
// Uses the configured routing provider (Mapbox or OSRM) with a safe straight-line fallback.
// Provider credentials remain server-side; the mobile map plots the returned `polyline`.
router.get("/directions", requireAuth, async (req: AuthRequest, res: Response) => {
  const originLat = parseFloat(String(req.query.originLat || ""));
  const originLng = parseFloat(String(req.query.originLng || ""));
  const destLat = parseFloat(String(req.query.destLat || ""));
  const destLng = parseFloat(String(req.query.destLng || ""));

  if (!validCoordinate(originLat, originLng) || !validCoordinate(destLat, destLng)) {
    res.status(400).json({ error: "Valid origin and destination coordinates are required" });
    return;
  }

  const config = getMapProviderConfiguration();
  const cacheKey = `directions:${config.directionsProvider}:${originLat.toFixed(4)},${originLng.toFixed(4)}:${destLat.toFixed(4)},${destLng.toFixed(4)}`;
  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached) {
    res.json({ ...cached, source: `${String(cached.source || config.directionsProvider)}-cache` });
    return;
  }

  try {
    let result: {
      polyline: { latitude: number; longitude: number }[];
      distanceKm: number | null;
      durationMin: number | null;
      source: "mapbox" | "osrm";
    } | null = null;

    if (config.directionsProvider === "mapbox") {
      result = await mapboxDirections(originLat, originLng, destLat, destLng);
    }

    if (!result && (config.directionsProvider === "osrm" || config.fallbackEnabled)) {
      const osrmUrl =
        `${OSRM_BASE_URL}/route/v1/driving` +
        `/${originLng},${originLat};${destLng},${destLat}` +
        `?overview=full&geometries=geojson&steps=false`;
      const osrmRes = await fetchWithTimeout(osrmUrl, {
        headers: { "User-Agent": MAP_USER_AGENT },
      });
      if (osrmRes.ok) {
        const osrmData = (await osrmRes.json()) as OsrmResponse;
        const route = osrmData.code === "Ok" ? osrmData.routes?.[0] : undefined;
        const coords: [number, number][] = route?.geometry?.coordinates ?? [];
        if (route && coords.length >= 2) {
          result = {
            polyline: coords
              .map(([lng, lat]: [number, number]) => ({ latitude: Number(lat), longitude: Number(lng) }))
              .filter((coordinate) => validCoordinate(coordinate.latitude, coordinate.longitude)),
            distanceKm: Number.isFinite(route.distance) ? Number(route.distance) / 1000 : null,
            durationMin: Number.isFinite(route.duration) ? Math.ceil(Number(route.duration) / 60) : null,
            source: "osrm",
          };
        }
      }
    }

    if (result && result.polyline.length >= 2) {
      setCached(cacheKey, result, 5 * 60 * 1000);
      res.json(result);
      return;
    }

    res.json({
      polyline: [
        { latitude: originLat, longitude: originLng },
        { latitude: destLat, longitude: destLng },
      ],
      distanceKm: haversineKm(originLat, originLng, destLat, destLng),
      durationMin: null,
      source: "straight_line",
    });
  } catch (e) {
    logger.warn({ err: e }, "geo directions upstream unavailable");
    res.json({
      polyline: [
        { latitude: originLat, longitude: originLng },
        { latitude: destLat, longitude: destLng },
      ],
      distanceKm: haversineKm(originLat, originLng, destLat, destLng),
      durationMin: null,
      source: "straight_line",
    });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Haversine distance in km between two lat/lng points. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


export default router;

/**
 * OpenStreetMap-based geocoding and routing proxy for Athoo.
 *
 * Search uses Photon and Nominatim, reverse geocoding uses Photon then
 * Nominatim, and road directions use OSRM. No commercial map key is required
 * by the API or mobile app. Every upstream request is bounded by a timeout and
 * successful results are cached briefly to reduce latency and provider load.
 */

import { Router, type Response } from "express";
import { logger } from "../lib/logger";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

const PHOTON_BASE_URL = String(process.env.PHOTON_BASE_URL || "https://photon.komoot.io").replace(/\/$/, "");
const NOMINATIM_BASE_URL = String(process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const OSRM_BASE_URL = String(process.env.OSRM_BASE_URL || "https://router.project-osrm.org").replace(/\/$/, "");

const NOMINATIM_HEADERS = {
  "User-Agent": "AthooApp/1.0 (Pakistan home services; contact: admin@athoo.com)",
  "Accept-Language": "en",
  Accept: "application/json",
};

// ─── Shared types ─────────────────────────────────────────────────────────────

interface GeoResult {
  label: string;
  lat: number;
  lng: number;
  useAsTyped?: boolean;
}

const GEO_UPSTREAM_TIMEOUT_MS = Number(process.env.GEO_UPSTREAM_TIMEOUT_MS || 6_000);
const GEO_CACHE_MAX_ITEMS = Number(process.env.GEO_CACHE_MAX_ITEMS || 500);
type GeoCacheEntry = { value: unknown; expiresAt: number };
const geoCache = new Map<string, GeoCacheEntry>();

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

async function photonReverse(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${PHOTON_BASE_URL}/reverse?lat=${lat}&lon=${lng}&limit=5&lang=en`;
    const res = await fetchWithTimeout(url, { headers: PHOTON_HEADERS });
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

async function photonSearch(q: string, limit = 8): Promise<GeoResult[]> {
  try {
    const url =
      `${PHOTON_BASE_URL}/api` +
      `?q=${encodeURIComponent(q)}` +
      `&countrycodes=pk&limit=${limit}&lang=en`;
    const res = await fetchWithTimeout(url, { headers: PHOTON_HEADERS });
    const data = (await res.json()) as PhotonResponse;
    if (!data.features?.length) return [];

    return data.features
      .map((f) => ({
        label: buildPhotonLabel(f.properties),
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      }))
      .filter((r) => !isNaN(r.lat) && !isNaN(r.lng) && r.label.length > 2);
  } catch {
    return [];
  }
}

// ─── Nominatim helpers ─────────────────────────────────────────────────────────

interface NominatimItem {
  name?: string;
  display_name: string;
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

async function nominatimSearch(q: string, limit = 8): Promise<GeoResult[]> {
  try {
    const url =
      `${NOMINATIM_BASE_URL}/search` +
      `?q=${encodeURIComponent(q)}&countrycodes=pk&format=jsonv2` +
      `&limit=${limit}&addressdetails=1&namedetails=1&dedupe=1&accept-language=en`;
    const res = await fetchWithTimeout(url, { headers: NOMINATIM_HEADERS });
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .map((item: NominatimItem) => ({
        label: cleanNominatimLabel(item),
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }))
      .filter((r) => !isNaN(r.lat) && !isNaN(r.lng));
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
  const seen = new Set<string>(
    primary.map((r) => `${Math.round(r.lat * 10000)},${Math.round(r.lng * 10000)}`),
  );
  const out = [...primary];
  for (const list of rest) {
    for (const r of list) {
      const key = `${Math.round(r.lat * 10000)},${Math.round(r.lng * 10000)}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(r);
      }
    }
  }
  return out;
}

// ── GET /api/geo/search?q=... ──────────────────────────────────────────────────
router.get("/search", requireAuth, async (req: AuthRequest, res: Response) => {
  const q = String(req.query.q || "").trim();
  if (!q || q.length < 2) {
    res.json({ results: [] });
    return;
  }

  try {
    const cacheKey = `search:${q.toLowerCase()}`;
    const cached = getCached<GeoResult[]>(cacheKey);
    if (cached) {
      res.json({ results: cached, source: "cache" });
      return;
    }

    const [photonResults, nominatimResults] = await Promise.all([
      photonSearch(q, 6),
      nominatimSearch(q, 6),
    ]);

    let results = mergeResults(photonResults, nominatimResults).slice(0, 8);
    const useAsTyped: GeoResult = {
      label: q,
      lat: results.length > 0 ? results[0].lat : 0,
      lng: results.length > 0 ? results[0].lng : 0,
      useAsTyped: true,
    };
    results = [...results, useAsTyped];
    setCached(cacheKey, results, 5 * 60 * 1000);
    res.json({ results, source: "openstreetmap" });
  } catch (e) {
    logger.warn({ err: e }, "geo search upstream unavailable");
    res.json({ results: [{ label: q, lat: 0, lng: 0, useAsTyped: true }], source: "manual" });
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

  const cacheKey = `reverse:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = getCached<{ address: string; source: string }>(cacheKey);
  if (cached) {
    res.json({ ...cached, source: `${cached.source}-cache` });
    return;
  }

  try {
    const [photon, nominatim] = await Promise.all([
      photonReverse(lat, lng),
      nominatimReverse(lat, lng),
    ]);

    const result = photon && photon.length > 4
      ? { address: photon, source: "photon" }
      : nominatim
        ? { address: nominatim, source: "nominatim" }
        : { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: "coords" };

    setCached(cacheKey, result, result.source === "coords" ? 60_000 : 24 * 60 * 60 * 1000);
    res.json(result);
  } catch (e) {
    logger.warn({ err: e }, "geo reverse upstream unavailable");
    res.json({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: "coords" });
  }
});

// ── GET /api/geo/directions?originLat=&originLng=&destLat=&destLng= ──────────
// Returns a road polyline, distance (km), and ETA (minutes) for provider navigation.
// Uses OSRM road routing with a straight-line fallback; no map key is required.
// The mobile map component plots the returned `polyline` array as a road route.
router.get("/directions", requireAuth, async (req: AuthRequest, res: Response) => {
  const originLat = parseFloat(String(req.query.originLat || ""));
  const originLng = parseFloat(String(req.query.originLng || ""));
  const destLat = parseFloat(String(req.query.destLat || ""));
  const destLng = parseFloat(String(req.query.destLng || ""));

  if (!validCoordinate(originLat, originLng) || !validCoordinate(destLat, destLng)) {
    res.status(400).json({ error: "Valid origin and destination coordinates are required" });
    return;
  }

  const cacheKey = `directions:${originLat.toFixed(4)},${originLng.toFixed(4)}:${destLat.toFixed(4)},${destLng.toFixed(4)}`;
  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached) {
    res.json({ ...cached, source: "osrm-cache" });
    return;
  }

  try {
    // ── OSRM (OpenStreetMap-based routing, no API key) ───────────────
    const osrmUrl =
      `${OSRM_BASE_URL}/route/v1/driving` +
      `/${originLng},${originLat};${destLng},${destLat}` +
      `?overview=full&geometries=geojson&steps=false`;
    const osrmRes = await fetchWithTimeout(osrmUrl, {
      headers: { "User-Agent": "AthooApp/1.0 (Pakistan home services)" },
    });
    const osrmData = (await osrmRes.json()) as OsrmResponse;

    if (osrmData.code === "Ok" && osrmData.routes?.length) {
      const route = osrmData.routes[0];
      const coords: [number, number][] = route.geometry?.coordinates ?? [];
      // OSRM returns [lng, lat] — convert to { latitude, longitude }
      const polyline = coords.map(([lng, lat]: [number, number]) => ({ latitude: lat, longitude: lng }));
      const result = {
        polyline,
        distanceKm: route.distance ? route.distance / 1000 : null,
        durationMin: route.duration ? Math.ceil(route.duration / 60) : null,
        source: "osrm",
      };
      setCached(cacheKey, result, 5 * 60 * 1000);
      res.json(result);
      return;
    }

    // ── 3. Straight-line fallback (always works, no road following) ───────────
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

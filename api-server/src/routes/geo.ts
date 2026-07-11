/**
 * Geocoding proxy routes for ATHOO.
 *
 * Reverse geocoding priority:
 *   1. Google Geocoding API — best Pakistan street/neighbourhood data.
 *      Requires "Geocoding API" enabled in Google Cloud Console for your project.
 *      Once enabled, set GOOGLE_MAPS_API_KEY env var (or it uses the default key).
 *   2. Photon (Komoot) — free, no API key, indexes OSM with better ranking than
 *      plain Nominatim; returns real street names / landmarks in Pakistan.
 *   3. Nominatim (OpenStreetMap) — final fallback.
 *
 * Forward search priority:
 *   1. Google Places API (New) — when enabled.
 *   2. Photon search — free, finds sectors / chowks / roads / landmarks.
 *   3. Nominatim — final fallback.
 */

import { Router, type Response } from "express";
import { logger } from "../lib/logger";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

// Google Maps key — already embedded in the mobile app.
// IMPORTANT: Enable "Geocoding API" and "Places API (New)" in Google Cloud
// Console for this key to work server-side.
// https://console.cloud.google.com/apis/library
const GOOGLE_KEY =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

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

// ─── Google Geocoding helpers ─────────────────────────────────────────────────

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}
interface GoogleGeoResult {
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
  address_components: GoogleAddressComponent[];
}
interface GoogleGeoResponse {
  status: string;
  error_message?: string;
  results: GoogleGeoResult[];
}

// Cache to avoid logging the same API-disabled warning on every request
let googleApiLogged = false;

function getComponent(
  components: GoogleAddressComponent[],
  ...types: string[]
): string | undefined {
  for (const type of types) {
    const c = components.find((c) => c.types.includes(type));
    if (c) return c.long_name;
  }
  return undefined;
}

function buildGoogleLabel(components: GoogleAddressComponent[]): string {
  const houseNum = getComponent(components, "street_number", "premise");
  const route = getComponent(components, "route");
  const neighbourhood = getComponent(
    components,
    "neighborhood",
    "sublocality_level_2",
    "sublocality_level_1",
    "sublocality",
  );
  const city = getComponent(components, "locality", "administrative_area_level_2");

  const parts: string[] = [];
  if (houseNum && route) parts.push(`${houseNum} ${route}`);
  else if (route) parts.push(route);
  if (neighbourhood && neighbourhood !== city) parts.push(neighbourhood);
  if (city) parts.push(city);

  return parts.filter(Boolean).join(", ");
}

async function googleReverseGeocode(
  lat: number,
  lng: number,
): Promise<{ label: string; components: GoogleAddressComponent[] } | null> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?latlng=${lat},${lng}&key=${GOOGLE_KEY}&language=en&region=pk`;
    const res = await (fetch as any)(url);
    const data: GoogleGeoResponse = await res.json();
    if (data.status === "REQUEST_DENIED") {
      if (!googleApiLogged) {
        logger.warn("Google Geocoding API not enabled — falling back to Photon/Nominatim. Enable via: https://console.cloud.google.com/apis/library");
        googleApiLogged = true;
      }
      return null;
    }
    if (data.status !== "OK" || !data.results.length) return null;
    const best = data.results[0];
    const label = buildGoogleLabel(best.address_components);
    if (!label || label.length < 4) return null;
    return { label, components: best.address_components };
  } catch {
    return null;
  }
}

async function googleSearch(q: string, limit = 8): Promise<GeoResult[]> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(q + " Pakistan")}` +
      `&key=${GOOGLE_KEY}&language=en&region=pk&components=country:PK`;
    const res = await (fetch as any)(url);
    const data: GoogleGeoResponse = await res.json();
    if (data.status === "REQUEST_DENIED") return [];
    if (!data.results?.length) return [];
    return data.results.slice(0, limit).map((r) => {
      const label =
        buildGoogleLabel(r.address_components) ||
        r.formatted_address.split(",").slice(0, 3).join(",").trim();
      return { label, lat: r.geometry.location.lat, lng: r.geometry.location.lng };
    }).filter((r) => !isNaN(r.lat) && !isNaN(r.lng) && r.label.length > 2);
  } catch {
    return [];
  }
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
    const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=5&lang=en`;
    const res = await (fetch as any)(url, { headers: PHOTON_HEADERS });
    const data: PhotonResponse = await res.json();
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
      `https://photon.komoot.io/api` +
      `?q=${encodeURIComponent(q)}` +
      `&countrycodes=pk&limit=${limit}&lang=en`;
    const res = await (fetch as any)(url, { headers: PHOTON_HEADERS });
    const data: PhotonResponse = await res.json();
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
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(q)}&countrycodes=pk&format=jsonv2` +
      `&limit=${limit}&addressdetails=1&namedetails=1&dedupe=1&accept-language=en`;
    const res = await (fetch as any)(url, { headers: NOMINATIM_HEADERS });
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
      `https://nominatim.openstreetmap.org/reverse` +
      `?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1&namedetails=1&zoom=18&accept-language=en`;
    const res = await (fetch as any)(url, { headers: NOMINATIM_HEADERS });
    const data: NominatimItem = await res.json();
    const addr = data.address || {};

    if (addr.road || addr.neighbourhood || addr.suburb || data.name) {
      return cleanNominatimLabel(data);
    }

    // Admin-boundary only — try nearby named places
    const delta = 0.005;
    const nearUrl =
      `https://nominatim.openstreetmap.org/search` +
      `?format=jsonv2&addressdetails=1&limit=5` +
      `&viewbox=${lng - delta},${lat - delta},${lng + delta},${lat + delta}` +
      `&bounded=1&accept-language=en`;
    const nearRes = await (fetch as any)(nearUrl, { headers: NOMINATIM_HEADERS });
    const items: NominatimItem[] = await nearRes.json();
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
    // Run Google + Photon + Nominatim in parallel for best coverage
    const [googleResults, photonResults, nominatimResults] = await Promise.all([
      googleSearch(q, 5),
      photonSearch(q, 6),
      nominatimSearch(q, 6),
    ]);

    // Priority: Google (most accurate) → Photon (better landmark coverage) → Nominatim
    let results = mergeResults(googleResults, photonResults, nominatimResults);
    results = results.slice(0, 8);

    // "Use as typed" sentinel so the user can always confirm a manual address
    const useAsTyped: GeoResult = {
      label: q,
      lat: results.length > 0 ? results[0].lat : 0,
      lng: results.length > 0 ? results[0].lng : 0,
      useAsTyped: true,
    };
    results = [...results, useAsTyped];

    res.json({ results });
  } catch (e) {
    logger.error({ err: e }, "geo search error");
    res.json({ results: [] });
  }
});

// ── GET /api/geo/reverse?lat=...&lng=... ──────────────────────────────────────
router.get("/reverse", requireAuth, async (req: AuthRequest, res: Response) => {
  const lat = parseFloat(String(req.query.lat || ""));
  const lng = parseFloat(String(req.query.lng || ""));

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: "Invalid coordinates" });
    return;
  }

  try {
    // Run all three sources in parallel for speed
    const [google, photon, nominatim] = await Promise.all([
      googleReverseGeocode(lat, lng),
      photonReverse(lat, lng),
      nominatimReverse(lat, lng),
    ]);

    // 1. Google — best when enabled
    if (google && google.label.length > 3) {
      const c = google.components;
      res.json({
        address: google.label,
        road: getComponent(c, "route") ?? null,
        neighbourhood: getComponent(c, "neighborhood", "sublocality_level_1", "sublocality") ?? null,
        city: getComponent(c, "locality", "administrative_area_level_2") ?? null,
        district: getComponent(c, "administrative_area_level_2") ?? null,
        province: getComponent(c, "administrative_area_level_1") ?? null,
        postalCode: getComponent(c, "postal_code") ?? null,
        source: "google",
      });
      return;
    }

    // 2. Photon — free, finds real street names (better than plain Nominatim)
    if (photon && photon.length > 4) {
      res.json({ address: photon, source: "photon" });
      return;
    }

    // 3. Nominatim — final fallback
    if (nominatim) {
      res.json({ address: nominatim, source: "nominatim" });
      return;
    }

    // 4. Raw coordinates
    res.json({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: "coords" });
  } catch (e) {
    logger.error({ err: e }, "geo reverse error");
    res.status(500).json({ error: "Reverse geocode failed" });
  }
});

// ── GET /api/geo/directions?originLat=&originLng=&destLat=&destLng= ──────────
// Returns a road polyline, distance (km), and ETA (minutes) for provider navigation.
// Uses Google Directions API when key is available; falls back to OSRM (free, no key).
// The mobile map component plots the returned `polyline` array as a road route.
router.get("/directions", requireAuth, async (req: AuthRequest, res: Response) => {
  const originLat = parseFloat(String(req.query.originLat || ""));
  const originLng = parseFloat(String(req.query.originLng || ""));
  const destLat = parseFloat(String(req.query.destLat || ""));
  const destLng = parseFloat(String(req.query.destLng || ""));

  if ([originLat, originLng, destLat, destLng].some(isNaN)) {
    res.status(400).json({ error: "originLat, originLng, destLat, destLng are required" });
    return;
  }

  try {
    // ── 1. Google Directions API ──────────────────────────────────────────────
    if (GOOGLE_KEY) {
      try {
        const url =
          `https://maps.googleapis.com/maps/api/directions/json` +
          `?origin=${originLat},${originLng}` +
          `&destination=${destLat},${destLng}` +
          `&mode=driving&region=pk&language=en&key=${GOOGLE_KEY}`;
        const gRes = await (fetch as any)(url);
        const gData = await gRes.json();

        if (gData.status === "OK" && gData.routes?.length) {
          const route = gData.routes[0];
          const leg = route.legs[0];
          // Decode Google's encoded polyline into lat/lng pairs
          const encoded: string = route.overview_polyline?.points ?? "";
          const polyline = decodePolyline(encoded);
          res.json({
            polyline,
            distanceKm: leg.distance?.value ? leg.distance.value / 1000 : null,
            durationMin: leg.duration?.value ? Math.ceil(leg.duration.value / 60) : null,
            source: "google",
          });
          return;
        }
      } catch {
        // Fall through to OSRM
      }
    }

    // ── 2. OSRM (free, no API key, OpenStreetMap-based routing) ──────────────
    const osrmUrl =
      `https://router.project-osrm.org/route/v1/driving` +
      `/${originLng},${originLat};${destLng},${destLat}` +
      `?overview=full&geometries=geojson&steps=false`;
    const osrmRes = await (fetch as any)(osrmUrl, {
      headers: { "User-Agent": "AthooApp/1.0 (Pakistan home services)" },
    });
    const osrmData = await osrmRes.json();

    if (osrmData.code === "Ok" && osrmData.routes?.length) {
      const route = osrmData.routes[0];
      const coords: [number, number][] = route.geometry?.coordinates ?? [];
      // OSRM returns [lng, lat] — convert to { latitude, longitude }
      const polyline = coords.map(([lng, lat]: [number, number]) => ({ latitude: lat, longitude: lng }));
      res.json({
        polyline,
        distanceKm: route.distance ? route.distance / 1000 : null,
        durationMin: route.duration ? Math.ceil(route.duration / 60) : null,
        source: "osrm",
      });
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
    logger.error({ err: e }, "geo directions error");
    res.status(500).json({ error: "Failed to fetch directions" });
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

/** Decode a Google Maps encoded polyline string into lat/lng pairs. */
function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

export default router;

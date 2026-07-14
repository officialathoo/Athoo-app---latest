/**
 * Geocoding helpers for ATHOO.
 *
 * All geocoding is proxied through our own API server (/api/geo/*) so we are
 * not dependent on any third-party API key being present on the device.
 * The server uses Nominatim (OpenStreetMap) with proper English locale headers.
 */

import { api, getToken } from "./api";

function getApiBase(): string {
  return api.baseUrl;
}

export interface PlaceSuggestion {
  placeId: string;
  label: string;
}

export interface PlaceCoords {
  lat: number;
  lng: number;
  formattedAddress: string;
}

// ─── Address Search ────────────────────────────────────────────────────────────

/**
 * Search for Pakistani addresses and places via our server-side proxy.
 * Returns up to 8 results with clean English labels and coordinates.
 */
export async function searchAddressGoogle(
  query: string,
): Promise<{ label: string; lat: number; lng: number; useAsTyped?: boolean }[]> {
  if (!query.trim() || query.length < 2) return [];

  try {
    const base = getApiBase();
    const url = `${base}/api/geo/search?q=${encodeURIComponent(query)}`;
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

// ─── Reverse Geocoding ────────────────────────────────────────────────────────

/**
 * Convert lat/lng to a human-readable Pakistani address via our server proxy.
 * Falls back to the device's built-in reverse geocoder if the server fails.
 */
export async function reverseGeocodeGoogle(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const base = getApiBase();
    const url = `${base}/api/geo/reverse?lat=${lat}&lng=${lng}`;
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.address === "string" && data.address ? data.address : null;
  } catch {
    return null;
  }
}

// ─── Google Places (kept for any callers that still need placeId resolution) ──

const MAPS_API_KEY =
  (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined) || "";

/**
 * Get lat/lng for a Google Place ID (only used if Google Places is separately enabled).
 */
export async function getPlaceCoords(placeId: string): Promise<PlaceCoords> {
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&key=${MAPS_API_KEY}` +
    `&fields=geometry,formatted_address`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK") throw new Error(data.status);

  const loc = data.result.geometry.location;
  return {
    lat: loc.lat,
    lng: loc.lng,
    formattedAddress: data.result.formatted_address || "",
  };
}

// ─── Road Directions (polyline + ETA) ────────────────────────────────────────

export interface DirectionsResult {
  polyline: { latitude: number; longitude: number }[];
  distanceKm: number | null;
  durationMin: number | null;
  source: "google" | "osrm" | "straight_line";
}

/**
 * Fetch a road-following polyline between two points, proxied through the
 * Athoo API server. Uses Google Directions API when key is set; falls back
 * to OSRM (free, no API key required). Always returns at least a straight-
 * line polyline so the map is never blank.
 */
export async function getDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<DirectionsResult> {
  try {
    const base = getApiBase();
    const url =
      `${base}/api/geo/directions` +
      `?originLat=${originLat}&originLng=${originLng}` +
      `&destLat=${destLat}&destLng=${destLng}`;
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      polyline: Array.isArray(data.polyline) ? data.polyline : [],
      distanceKm: data.distanceKm ?? null,
      durationMin: data.durationMin ?? null,
      source: data.source ?? "straight_line",
    };
  } catch {
    // Always return a safe fallback — straight line between the two points
    return {
      polyline: [
        { latitude: originLat, longitude: originLng },
        { latitude: destLat, longitude: destLng },
      ],
      distanceKm: null,
      durationMin: null,
      source: "straight_line",
    };
  }
}

/**
 * Build a Google Static Map URL for embedding as an <Image> src.
 */
export function getStaticMapUrl(
  lat: number,
  lng: number,
  options: { zoom?: number; width?: number; height?: number; marker?: boolean } = {},
): string {
  const { zoom = 15, width = 400, height = 200, marker = true } = options;
  let url =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=${zoom}` +
    `&size=${width}x${height}` +
    `&scale=2` +
    `&key=${MAPS_API_KEY}`;
  if (marker) {
    url += `&markers=color:blue%7C${lat},${lng}`;
  }
  return url;
}

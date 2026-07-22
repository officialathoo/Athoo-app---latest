/**
 * Open mapping and geocoding helpers for Athoo.
 *
 * Mobile clients never carry map-provider credentials. Address search,
 * reverse geocoding, tiles, and directions are proxied through the Athoo API.
 * The backend can switch between Mapbox and open/custom providers through
 * deployment configuration without changing mobile screens.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

export type AddressPrecision = "building" | "street" | "area" | "city" | "region";

export interface PlaceSuggestion {
  placeId: string;
  label: string;
  primary: string;
  secondary: string;
  lat: number;
  lng: number;
  city?: string;
  province?: string;
  postcode?: string;
  precision: AddressPrecision;
  source: string;
  distanceKm?: number;
}

export interface PlaceCoords {
  lat: number;
  lng: number;
  formattedAddress: string;
}

const REVERSE_CACHE_KEY = "athoo:reverse-geocode-cache:v2";
const REVERSE_CACHE_MAX = 40;
const REVERSE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type ReverseCacheEntry = { key: string; address: string; storedAt: number };

function reverseCacheId(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

async function readReverseCache(id: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(REVERSE_CACHE_KEY);
    if (!raw) return null;
    const entries = JSON.parse(raw) as ReverseCacheEntry[];
    const found = entries.find((entry) => entry.key === id && Date.now() - entry.storedAt <= REVERSE_CACHE_TTL_MS);
    return found?.address || null;
  } catch {
    return null;
  }
}

async function writeReverseCache(id: string, address: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(REVERSE_CACHE_KEY);
    const existing = raw ? (JSON.parse(raw) as ReverseCacheEntry[]) : [];
    const next = [
      { key: id, address, storedAt: Date.now() },
      ...existing.filter((entry) => entry.key !== id && Date.now() - entry.storedAt <= REVERSE_CACHE_TTL_MS),
    ].slice(0, REVERSE_CACHE_MAX);
    await AsyncStorage.setItem(REVERSE_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Cache failure must never prevent address selection.
  }
}

export async function searchAddress(
  query: string,
  bias?: { latitude: number; longitude: number } | null,
  limit = 10,
): Promise<PlaceSuggestion[]> {
  const trimmed = query.replace(/\s+/g, " ").trim();
  if (trimmed.length < 3) return [];
  const data = await api.request<{ results?: PlaceSuggestion[] }>(
    "/api/geo/search",
    {
      method: "GET",
      auth: true,
      params: {
        q: trimmed,
        limit,
        ...(bias && Number.isFinite(bias.latitude) && Number.isFinite(bias.longitude)
          ? { lat: bias.latitude, lng: bias.longitude }
          : {}),
      },
      timeoutMs: 9_000,
    },
  );
  return Array.isArray(data.results)
    ? data.results
        .filter((result) =>
          typeof result?.label === "string" &&
          typeof result?.primary === "string" &&
          Number.isFinite(Number(result?.lat)) &&
          Number.isFinite(Number(result?.lng)),
        )
        .map((result) => ({ ...result, lat: Number(result.lat), lng: Number(result.lng) }))
    : [];
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cacheId = reverseCacheId(lat, lng);
  const cached = await readReverseCache(cacheId);

  try {
    const data = await api.request<{ address?: string; cacheable?: boolean }>("/api/geo/reverse", {
      method: "GET",
      auth: true,
      params: { lat, lng },
      timeoutMs: 8_000,
    });
    const address = typeof data.address === "string" ? data.address.trim() : "";
    if (address) {
      // Mapbox temporary geocoding results must not be persisted. The backend
      // explicitly marks whether the selected provider permits local caching.
      if (data.cacheable !== false) void writeReverseCache(cacheId, address);
      return address;
    }
  } catch {
    // Cached address is preferable to blocking a slow/offline user flow.
  }

  return cached;
}


export interface RouteMetricDestination {
  id: string;
  lat: number;
  lng: number;
}

export interface RouteMetric {
  id: string;
  distanceKm: number | null;
  durationMin: number | null;
  source: string;
  routed: boolean;
}

export async function getRouteMetricsBatch(
  originLat: number,
  originLng: number,
  destinations: RouteMetricDestination[],
): Promise<RouteMetric[]> {
  const normalized = destinations
    .filter((destination) =>
      Boolean(destination.id) &&
      Number.isFinite(destination.lat) &&
      Number.isFinite(destination.lng) &&
      Math.abs(destination.lat) <= 90 &&
      Math.abs(destination.lng) <= 180,
    )
    .slice(0, 12);

  if (
    !Number.isFinite(originLat) ||
    !Number.isFinite(originLng) ||
    Math.abs(originLat) > 90 ||
    Math.abs(originLng) > 180 ||
    !normalized.length
  ) {
    return [];
  }

  try {
    const data = await api.request<{ routes?: Partial<RouteMetric>[] }>("/api/geo/route-metrics", {
      method: "POST",
      auth: true,
      body: { originLat, originLng, destinations: normalized },
      timeoutMs: 15_000,
    });

    return Array.isArray(data.routes)
      ? data.routes
          .filter((route) => typeof route?.id === "string")
          .map((route) => ({
            id: String(route.id),
            distanceKm:
              route.distanceKm == null || !Number.isFinite(Number(route.distanceKm))
                ? null
                : Number(route.distanceKm),
            durationMin:
              route.durationMin == null || !Number.isFinite(Number(route.durationMin))
                ? null
                : Number(route.durationMin),
            source:
              typeof route.source === "string" && route.source.trim()
                ? route.source.replace(/-cache$/, "")
                : "unavailable",
            routed: route.routed === true,
          }))
      : [];
  } catch {
    return [];
  }
}

export interface DirectionsResult {
  polyline: { latitude: number; longitude: number }[];
  distanceKm: number | null;
  durationMin: number | null;
  source: string;
}

type DirectionsApiResponse = Omit<DirectionsResult, "source"> & {
  source?: string;
};

export async function getDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<DirectionsResult> {
  try {
    const data = await api.request<Partial<DirectionsApiResponse>>("/api/geo/directions", {
      method: "GET",
      auth: true,
      params: { originLat, originLng, destLat, destLng },
      timeoutMs: 10_000,
    });
    return {
      polyline: Array.isArray(data.polyline) ? data.polyline : [],
      distanceKm: data.distanceKm ?? null,
      durationMin: data.durationMin ?? null,
      source:
        typeof data.source === "string" && data.source.trim()
          ? data.source.replace(/-cache$/, "")
          : "straight_line",
    };
  } catch {
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

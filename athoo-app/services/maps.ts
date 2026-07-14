/**
 * Open mapping and geocoding helpers for Athoo.
 *
 * Mobile clients never carry a commercial maps key. Address search, reverse
 * geocoding, and directions are proxied through the Athoo API, which uses
 * OpenStreetMap data providers (Photon, Nominatim, and OSRM) with bounded
 * timeouts and server-side caching.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

export interface PlaceSuggestion {
  placeId: string;
  label: string;
}

export interface PlaceCoords {
  lat: number;
  lng: number;
  formattedAddress: string;
}

const REVERSE_CACHE_KEY = "athoo:reverse-geocode-cache:v1";
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
): Promise<{ label: string; lat: number; lng: number; useAsTyped?: boolean }[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  try {
    const data = await api.request<{ results?: Array<{ label: string; lat: number; lng: number; useAsTyped?: boolean }> }>(
      "/api/geo/search",
      { method: "GET", auth: true, params: { q: trimmed }, timeoutMs: 8_000 },
    );
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cacheId = reverseCacheId(lat, lng);
  const cached = await readReverseCache(cacheId);

  try {
    const data = await api.request<{ address?: string }>("/api/geo/reverse", {
      method: "GET",
      auth: true,
      params: { lat, lng },
      timeoutMs: 8_000,
    });
    const address = typeof data.address === "string" ? data.address.trim() : "";
    if (address) {
      void writeReverseCache(cacheId, address);
      return address;
    }
  } catch {
    // Cached address is preferable to blocking a slow/offline user flow.
  }

  return cached;
}


export interface DirectionsResult {
  polyline: { latitude: number; longitude: number }[];
  distanceKm: number | null;
  durationMin: number | null;
  source: "osrm" | "straight_line";
}

type DirectionsApiResponse = Omit<DirectionsResult, "source"> & {
  source?: "osrm" | "osrm-cache" | "straight_line";
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
      source: data.source === "osrm" || data.source === "osrm-cache" ? "osrm" : "straight_line",
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

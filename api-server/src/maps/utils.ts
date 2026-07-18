import type { GeoPrecision } from "./types.ts";

export function normalized(value: unknown): string {
  return String(value || "").trim();
}

export function envBool(name: string, fallback = false): boolean {
  const value = normalized(process.env[name]).toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

export function envInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(normalized(process.env[name]));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : fallback;
}

export function baseUrl(name: string, fallback: string): string {
  return normalized(process.env[name] || fallback).replace(/\/+$/, "");
}

export function validCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = Number(process.env.GEO_UPSTREAM_TIMEOUT_MS || 6_000),
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function precisionFromText(value: unknown, fallback: GeoPrecision = "area"): GeoPrecision {
  const type = normalized(value).toLowerCase();
  if (["point address", "address", "house", "building", "apartments", "commercial"].includes(type)) return "building";
  if (["street", "road", "residential", "service", "address range", "cross street"].includes(type)) return "street";
  if (["poi", "neighborhood", "neighbourhood", "locality", "district", "suburb", "quarter", "village", "town", "other"].includes(type)) return "area";
  if (["city", "place", "municipality", "county"].includes(type)) return "city";
  if (["state", "region", "country", "geography"].includes(type)) return "region";
  return fallback;
}

export function getPath(value: unknown, path: string): unknown {
  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  let current: unknown = value;
  for (const segment of segments) {
    if (current == null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function stringAt(value: unknown, path: string): string {
  return normalized(getPath(value, path));
}

export function numberAt(value: unknown, path: string): number {
  return Number(getPath(value, path));
}

export function replaceTemplate(
  template: string,
  values: Record<string, string | number | boolean | undefined>,
): string {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    const encoded = encodeURIComponent(value == null ? "" : String(value));
    output = output.replaceAll(`{${key}}`, encoded);
  }
  return output;
}

export function appendQueryParameter(url: string, name: string, value: string): string {
  if (!name || !value) return url;
  const parsed = new URL(url);
  if (!parsed.searchParams.has(name)) parsed.searchParams.set(name, value);
  return parsed.toString();
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

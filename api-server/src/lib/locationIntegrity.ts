import { db } from "@workspace/db";
import { serviceAreasTable } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";

const DEFAULT_MIN_LAT = 23.0;
const DEFAULT_MAX_LAT = 38.0;
const DEFAULT_MIN_LNG = 60.0;
const DEFAULT_MAX_LNG = 78.5;
const DEFAULT_MAX_ACCURACY_METERS = 500;
const DEFAULT_CONFIRMATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const LOCATION_SOURCES = new Set([
  "search",
  "current",
  "saved",
  "recent",
  "map",
  "pin",
  "repeat_booking",
]);

export type CanonicalLocation = {
  formattedAddress: string;
  city: string;
  area: string;
  province: string | null;
  countryCode: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  source: string;
  confirmedAt: Date;
};

export class LocationIntegrityError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function normalizedText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function normalizedComparable(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized
    .replace(/\bkpk\b|\bnwfp\b/g, "khyber pakhtunkhwa")
    .replace(/\bict\b|\bfederal capital\b/g, "islamabad capital territory")
    .replace(/\bajk\b/g, "azad jammu and kashmir")
    .replace(/\bgb\b/g, "gilgit baltistan")
    .replace(/\bbaluchistan\b/g, "balochistan");
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseConfirmation(value: unknown): Date | null {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function valueFrom(payload: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") return payload[key];
  }
  return undefined;
}

export function parseCanonicalLocation(
  payload: Record<string, unknown>,
  options: { requireFresh?: boolean; allowSavedAge?: boolean } = {},
): CanonicalLocation {
  const formattedAddress = normalizedText(
    valueFrom(payload, "formattedAddress", "address"),
    300,
  );
  const city = normalizedText(valueFrom(payload, "locationCity", "city"), 100);
  const area = normalizedText(valueFrom(payload, "locationArea", "area", "locality"), 120);
  const province = normalizedText(valueFrom(payload, "locationProvince", "province"), 100) || null;
  const countryCode = normalizedText(valueFrom(payload, "locationCountryCode", "countryCode", "isoCountryCode"), 2).toUpperCase();
  const source = normalizedText(valueFrom(payload, "locationSource", "source"), 40).toLowerCase();
  const latitude = boundedNumber(valueFrom(payload, "latitude", "pickedLat", "customerLat"), -90, 90);
  const longitude = boundedNumber(valueFrom(payload, "longitude", "pickedLng", "customerLng"), -180, 180);
  const accuracy = valueFrom(payload, "locationAccuracy", "accuracy") == null
    ? null
    : boundedNumber(valueFrom(payload, "locationAccuracy", "accuracy"), 0, 100_000);
  const confirmedAt = parseConfirmation(valueFrom(payload, "locationConfirmedAt", "confirmedAt"));

  if (formattedAddress.length < 6 || /^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(formattedAddress)) {
    throw new LocationIntegrityError(400, "LOCATION_ADDRESS_REQUIRED", "Choose and confirm a complete service address.");
  }
  if (!city || city.length < 2) {
    throw new LocationIntegrityError(400, "LOCATION_CITY_REQUIRED", "Choose a location that includes a city.");
  }
  if (!area || area.length < 2) {
    throw new LocationIntegrityError(400, "LOCATION_AREA_REQUIRED", "Choose a location that includes an area or locality.");
  }
  const expectedCountryCode = normalizedText(process.env.SERVICE_COUNTRY_CODE || "PK", 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode) || countryCode !== expectedCountryCode) {
    throw new LocationIntegrityError(400, "LOCATION_COUNTRY_INVALID", `The selected location must be inside ${expectedCountryCode}.`);
  }
  if (latitude == null || longitude == null) {
    throw new LocationIntegrityError(400, "LOCATION_COORDINATES_REQUIRED", "Confirm the service location pin before continuing.");
  }

  const minLat = envNumber("SERVICE_COUNTRY_MIN_LAT", DEFAULT_MIN_LAT);
  const maxLat = envNumber("SERVICE_COUNTRY_MAX_LAT", DEFAULT_MAX_LAT);
  const minLng = envNumber("SERVICE_COUNTRY_MIN_LNG", DEFAULT_MIN_LNG);
  const maxLng = envNumber("SERVICE_COUNTRY_MAX_LNG", DEFAULT_MAX_LNG);
  if (latitude < minLat || latitude > maxLat || longitude < minLng || longitude > maxLng) {
    throw new LocationIntegrityError(400, "LOCATION_OUTSIDE_SERVICE_COUNTRY", "The selected location is outside Athoo's configured service country.");
  }

  if (!LOCATION_SOURCES.has(source)) {
    throw new LocationIntegrityError(400, "LOCATION_SOURCE_INVALID", "Choose the location again using Athoo search, GPS, saved address, or map pin.");
  }

  const maxAccuracy = envNumber("LOCATION_MAX_ACCURACY_METERS", DEFAULT_MAX_ACCURACY_METERS);
  if (accuracy != null && accuracy > maxAccuracy) {
    throw new LocationIntegrityError(400, "LOCATION_ACCURACY_TOO_LOW", `Location accuracy must be within ${Math.round(maxAccuracy)} metres.`);
  }

  if (!confirmedAt) {
    throw new LocationIntegrityError(400, "LOCATION_CONFIRMATION_REQUIRED", "Confirm the service location again before continuing.");
  }
  if (confirmedAt.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new LocationIntegrityError(400, "LOCATION_CONFIRMATION_INVALID", "The location confirmation time is invalid.");
  }
  if (options.requireFresh !== false && !options.allowSavedAge) {
    const maxAgeMs = envNumber("LOCATION_CONFIRMATION_MAX_AGE_MS", DEFAULT_CONFIRMATION_MAX_AGE_MS);
    if (Date.now() - confirmedAt.getTime() > maxAgeMs) {
      throw new LocationIntegrityError(400, "LOCATION_CONFIRMATION_EXPIRED", "Confirm the service location again before continuing.");
    }
  }

  return {
    formattedAddress,
    city,
    area,
    province,
    countryCode,
    latitude,
    longitude,
    accuracy,
    source,
    confirmedAt,
  };
}

export async function assertLocationInActiveServiceArea(location: CanonicalLocation): Promise<void> {
  const configured = await db
    .select({ name: serviceAreasTable.name, province: serviceAreasTable.province })
    .from(serviceAreasTable)
    .where(eq(serviceAreasTable.isActive, true))
    .orderBy(asc(serviceAreasTable.sortOrder))
    .limit(1000);

  // An empty table means the installation has not yet enabled geographic
  // restrictions. Production readiness requires service areas to be seeded.
  if (!configured.length) return;

  const haystack = normalizedComparable([
    location.area,
    location.city,
    location.province || "",
    location.formattedAddress,
  ].join(" "));
  const matched = configured.some((entry) => {
    const name = normalizedComparable(String(entry.name || ""));
    const province = normalizedComparable(String(entry.province || ""));
    if (!name || !haystack.includes(name)) return false;
    return !province || haystack.includes(province) || normalizedComparable(location.province || "") === province;
  });

  if (!matched) {
    throw new LocationIntegrityError(
      400,
      "LOCATION_OUTSIDE_ACTIVE_SERVICE_AREA",
      "Athoo is not currently accepting jobs in the selected city or area.",
    );
  }
}

export function locationColumns(location: CanonicalLocation) {
  return {
    address: location.formattedAddress,
    locationCity: location.city,
    locationArea: location.area,
    locationProvince: location.province,
    locationCountryCode: location.countryCode,
    locationSource: location.source,
    locationAccuracy: location.accuracy,
    locationConfirmedAt: location.confirmedAt,
    locationVerifiedAt: new Date(),
  };
}

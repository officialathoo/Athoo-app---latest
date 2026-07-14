import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { ensureForegroundLocation, type PermissionResult } from "@/lib/permissions";

const LOCATION_CACHE_KEY = "athoo:last-known-location:v1";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_AGE_MS = 10 * 60 * 1000;

export type AthooLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
  source: "device-cache" | "app-cache" | "fresh";
};

type CachedLocation = Omit<AthooLocation, "source">;

type Options = {
  timeoutMs?: number;
  maxCacheAgeMs?: number;
  requiredAccuracy?: number;
  requestPermission?: boolean;
  rationaleTitle?: string;
  rationaleBody?: string;
};

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function fromLocationObject(location: Location.LocationObject, source: AthooLocation["source"]): AthooLocation | null {
  const { latitude, longitude, accuracy } = location.coords;
  if (!isValidCoordinate(latitude, longitude)) return null;
  return {
    latitude,
    longitude,
    accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
    timestamp: Number(location.timestamp) || Date.now(),
    source,
  };
}

async function readAppCache(maxAgeMs: number): Promise<AthooLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedLocation;
    if (!isValidCoordinate(parsed.latitude, parsed.longitude)) return null;
    if (!Number.isFinite(parsed.timestamp) || Date.now() - parsed.timestamp > maxAgeMs) return null;
    return { ...parsed, source: "app-cache" };
  } catch {
    return null;
  }
}

async function writeAppCache(location: AthooLocation): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify({
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      timestamp: location.timestamp,
    }));
  } catch {
    // Location caching is an optimization; never fail a user flow because storage is unavailable.
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("LOCATION_TIMEOUT")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Resolve a usable foreground location quickly.
 *
 * Order:
 * 1. verify foreground permission and GPS services;
 * 2. use Expo's last-known device location immediately when recent;
 * 3. use Athoo's own persisted location cache when the OS cache is empty;
 * 4. request a bounded balanced-accuracy fix;
 * 5. fall back to the best cached location instead of blocking indefinitely.
 */
export async function getFastForegroundLocation(options: Options = {}): Promise<{
  permission: PermissionResult;
  location: AthooLocation | null;
  stale: boolean;
}> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxCacheAgeMs = options.maxCacheAgeMs ?? DEFAULT_CACHE_AGE_MS;
  const requiredAccuracy = options.requiredAccuracy ?? 1_500;

  let permission: PermissionResult = "granted";
  if (options.requestPermission !== false) {
    permission = await ensureForegroundLocation({
      rationaleTitle: options.rationaleTitle,
      rationaleBody: options.rationaleBody,
    });
    if (permission !== "granted") return { permission, location: null, stale: false };
  }

  const [deviceLastKnown, appCached] = await Promise.all([
    Location.getLastKnownPositionAsync({ maxAge: maxCacheAgeMs, requiredAccuracy }).catch(() => null),
    readAppCache(maxCacheAgeMs),
  ]);

  const deviceCached = deviceLastKnown ? fromLocationObject(deviceLastKnown, "device-cache") : null;
  const bestCached = [deviceCached, appCached]
    .filter((item): item is AthooLocation => Boolean(item))
    .sort((a, b) => {
      const accuracyA = a.accuracy ?? Number.MAX_SAFE_INTEGER;
      const accuracyB = b.accuracy ?? Number.MAX_SAFE_INTEGER;
      if (accuracyA !== accuracyB) return accuracyA - accuracyB;
      return b.timestamp - a.timestamp;
    })[0] ?? null;

  // A recent, reasonably accurate device fix is immediately good enough for map previews and discovery.
  if (bestCached && (bestCached.accuracy == null || bestCached.accuracy <= 250)) {
    void writeAppCache(bestCached);
    return { permission, location: bestCached, stale: false };
  }

  try {
    const freshObject = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeoutMs,
    );
    const fresh = fromLocationObject(freshObject, "fresh");
    if (fresh) {
      await writeAppCache(fresh);
      return { permission, location: fresh, stale: false };
    }
  } catch {
    // Fall through to cached coordinates; callers can still allow manual address selection.
  }

  return { permission, location: bestCached, stale: Boolean(bestCached) };
}

export async function cacheForegroundLocation(location: Location.LocationObject): Promise<void> {
  const normalized = fromLocationObject(location, "fresh");
  if (normalized) await writeAppCache(normalized);
}

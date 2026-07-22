import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { ensureForegroundLocation, type PermissionResult } from "@/lib/permissions";

const LOCATION_CACHE_KEY = "athoo:last-known-location:v2";
const DEFAULT_TIMEOUT_MS = 15_000;
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
  freshAccuracy?: "balanced" | "high" | "highest" | "navigation";
  requestPermission?: boolean;
  rationaleTitle?: string;
  rationaleBody?: string;
  /** Skip the early cached-location return and actively request a new GPS fix. */
  preferFresh?: boolean;
  /** Require a newly acquired GPS fix; never return device or application cache. */
  requireFresh?: boolean;
  /** Try to observe multiple stable fresh readings before accepting the fix. */
  minimumFreshSamples?: number;
  /** Reject a fresh result whose reported accuracy radius exceeds this value. */
  maximumAcceptedAccuracy?: number;
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


function resolveExpoAccuracy(value: Options["freshAccuracy"]): Location.Accuracy {
  if (value === "navigation") return Location.Accuracy.BestForNavigation;
  if (value === "highest") return Location.Accuracy.Highest;
  if (value === "high") return Location.Accuracy.High;
  return Location.Accuracy.Balanced;
}

function betterLocation(a: AthooLocation | null, b: AthooLocation | null): AthooLocation | null {
  if (!a) return b;
  if (!b) return a;
  const accuracyA = a.accuracy ?? Number.MAX_SAFE_INTEGER;
  const accuracyB = b.accuracy ?? Number.MAX_SAFE_INTEGER;
  if (accuracyA !== accuracyB) return accuracyA < accuracyB ? a : b;
  return a.timestamp >= b.timestamp ? a : b;
}

/**
 * A current GPS fix must not be replaced by an older cached point merely
 * because the cached point reported a slightly smaller accuracy radius. That
 * behaviour kept providers pinned to a previous street after moving. A fresh
 * fix wins whenever it is usable for the requested flow; cache remains a safe
 * fallback for timeouts and very poor fixes.
 */
function preferUsableFreshLocation(
  fresh: AthooLocation | null,
  cached: AthooLocation | null,
  requiredAccuracy: number,
): AthooLocation | null {
  if (!fresh) return cached;
  if (!cached) return fresh;
  const usableFreshAccuracy = Math.min(150, Math.max(60, requiredAccuracy * 2));
  if (fresh.accuracy == null || fresh.accuracy <= usableFreshAccuracy) return fresh;
  return betterLocation(fresh, cached);
}

function distanceMeters(a: AthooLocation, b: AthooLocation): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const radius = 6_371_000;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function watchForBetterLocation(
  timeoutMs: number,
  requiredAccuracy: number,
  accuracy: Location.Accuracy,
  initial: AthooLocation | null,
  minimumFreshSamples: number,
): Promise<AthooLocation | null> {
  if (timeoutMs <= 0) return initial;
  return await new Promise<AthooLocation | null>((resolve) => {
    let settled = false;
    let best = initial;
    let subscription: Location.LocationSubscription | null = null;
    let lastAcceptable =
      initial?.accuracy != null && initial.accuracy <= requiredAccuracy ? initial : null;
    let acceptableSamples = lastAcceptable ? 1 : 0;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.remove();
      resolve(best);
    };

    const timer = setTimeout(finish, timeoutMs);
    void Location.watchPositionAsync(
      { accuracy, timeInterval: 700, distanceInterval: 0 },
      (value) => {
        const candidate = fromLocationObject(value, "fresh");
        best = betterLocation(best, candidate);
        if (!candidate || candidate.accuracy == null || candidate.accuracy > requiredAccuracy) return;

        const stabilityRadius = Math.max(
          20,
          candidate.accuracy,
          lastAcceptable?.accuracy ?? requiredAccuracy,
        );
        const stable = !lastAcceptable || distanceMeters(lastAcceptable, candidate) <= stabilityRadius;
        acceptableSamples = stable ? acceptableSamples + 1 : 1;
        lastAcceptable = candidate;

        const excellentAccuracy = Math.max(8, Math.min(15, requiredAccuracy / 2));
        if (candidate.accuracy <= excellentAccuracy || acceptableSamples >= minimumFreshSamples) {
          finish();
        }
      },
    ).then((value) => {
      subscription = value;
      if (settled) value.remove();
    }).catch(() => finish());
  });
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
  // 80 metres is a realistic foreground target for marketplace matching.
  // Callers can request stricter accuracy for live-job screens.
  const requiredAccuracy = options.requiredAccuracy ?? 50;
  const minimumFreshSamples = Math.max(
    1,
    Math.min(4, Math.trunc(options.minimumFreshSamples ?? 1)),
  );

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

  // Use cached coordinates only when they satisfy this flow's accuracy requirement.
  const cachedAccuracyThreshold = Math.min(75, Math.max(20, requiredAccuracy));
  if (!options.preferFresh && !options.requireFresh && bestCached?.accuracy != null && bestCached.accuracy <= cachedAccuracyThreshold) {
    void writeAppCache(bestCached);
    return { permission, location: bestCached, stale: false };
  }

  const startedAt = Date.now();
  const requestedAccuracy = resolveExpoAccuracy(options.freshAccuracy ?? "highest");
  let fresh: AthooLocation | null = null;
  try {
    const firstAttemptMs = Math.max(3_000, Math.min(timeoutMs, Math.round(timeoutMs * 0.65)));
    const freshObject = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: requestedAccuracy,
        mayShowUserSettingsDialog: true,
      }),
      firstAttemptMs,
    );
    fresh = fromLocationObject(freshObject, "fresh");
  } catch {
    // Continue with a short watcher or cached coordinates.
  }

  const elapsed = Date.now() - startedAt;
  const remainingMs = Math.max(0, timeoutMs - elapsed);
  if (
    remainingMs >= 1_000 &&
    (
      minimumFreshSamples > 1 ||
      !fresh ||
      fresh.accuracy == null ||
      fresh.accuracy > requiredAccuracy
    )
  ) {
    fresh = await watchForBetterLocation(
      remainingMs,
      requiredAccuracy,
      requestedAccuracy === Location.Accuracy.Balanced ? Location.Accuracy.High : requestedAccuracy,
      fresh,
      minimumFreshSamples,
    );
  }

  // Current-location, booking and provider-live-location workflows must never
  // silently substitute an old device or application cache for a new GPS fix.
  const requestedMaximumAccuracy = Number(options.maximumAcceptedAccuracy);
  const maximumAcceptedAccuracy = Number.isFinite(requestedMaximumAccuracy)
    ? Math.max(requiredAccuracy, Math.min(200, requestedMaximumAccuracy))
    : Math.min(200, Math.max(75, requiredAccuracy * 2));

  if (options.requireFresh) {
    if (!fresh || fresh.accuracy == null || fresh.accuracy > maximumAcceptedAccuracy) {
      return { permission, location: null, stale: Boolean(fresh) };
    }

    await writeAppCache(fresh);
    return {
      permission,
      location: fresh,
      stale: fresh.accuracy > requiredAccuracy,
    };
  }

  const best = preferUsableFreshLocation(fresh, bestCached, requiredAccuracy);
  if (best?.accuracy != null && best.accuracy > maximumAcceptedAccuracy) {
    return { permission, location: null, stale: true };
  }

  if (best) {
    await writeAppCache(best);
    return {
      permission,
      location: best,
      stale: best.source !== "fresh" || (best.accuracy != null && best.accuracy > requiredAccuracy),
    };
  }

  return { permission, location: null, stale: false };
}

export async function cacheForegroundLocation(location: Location.LocationObject): Promise<void> {
  const normalized = fromLocationObject(location, "fresh");
  if (normalized) await writeAppCache(normalized);
}

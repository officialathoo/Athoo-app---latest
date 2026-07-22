/**
 * Provider-neutral geocoding, map-tile, and routing proxy for Athoo.
 *
 * The mobile app talks only to Athoo APIs. Runtime provider selection is
 * resolved through the map provider registry and deployment configuration.
 */

import { Router, type Response } from "express";
import { logger } from "../lib/logger";
import { getRuntimeMapOverrides } from "../lib/mapRuntime";
import { isInProcessCacheEnabled } from "../lib/infrastructureConfiguration";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import {
  buildMapTileUpstreamCandidates,
  getMapConfigurationStatus,
  getMapProviderConfiguration,
} from "../lib/mapConfiguration";
import { getMapOperationProvider } from "../maps/providerRegistry.ts";
import type { DirectionsResult, GeoResult } from "../maps/types.ts";
import { fetchWithTimeout, haversineKm, validCoordinate } from "../maps/utils.ts";

const router = Router();

type GeoCacheEntry = { value: unknown; expiresAt: number; touchedAt: number };
const geoCache = new Map<string, GeoCacheEntry>();
const GEO_CACHE_MAX_ITEMS = Math.max(10, Number(process.env.GEO_CACHE_MAX_ITEMS || 500));

const MAP_TILE_TIMEOUT_MS = Number(process.env.MAP_TILE_TIMEOUT_MS || 8_000);
const MAP_TILE_BROWSER_CACHE_SECONDS = Math.max(60, Number(process.env.MAP_TILE_BROWSER_CACHE_SECONDS || 86_400));
const MAP_TILE_CDN_CACHE_SECONDS = Math.max(
  MAP_TILE_BROWSER_CACHE_SECONDS,
  Number(process.env.MAP_TILE_CDN_CACHE_SECONDS || 604_800),
);
const MAP_TILE_MAX_BYTES = Math.max(64 * 1024, Number(process.env.MAP_TILE_MAX_BYTES || 2 * 1024 * 1024));
const configuredMapTileMaxZoom = Number(process.env.MAP_TILE_MAX_ZOOM || 20);
const MAP_TILE_MAX_ZOOM = Number.isFinite(configuredMapTileMaxZoom)
  ? Math.max(1, Math.min(22, Math.trunc(configuredMapTileMaxZoom)))
  : 20;
const MAP_TILE_RESPECT_UPSTREAM_CACHE = String(process.env.MAP_TILE_RESPECT_UPSTREAM_CACHE || "true").toLowerCase() !== "false";
const configuredMapTileSuspiciousBytes = Number(process.env.MAP_TILE_SUSPICIOUS_BYTES || 1_500);
const MAP_TILE_SUSPICIOUS_BYTES = Number.isFinite(configuredMapTileSuspiciousBytes)
  ? Math.min(MAP_TILE_MAX_BYTES, Math.max(256, Math.trunc(configuredMapTileSuspiciousBytes)))
  : 1_500;

function validTileCoordinate(z: number, x: number, y: number): boolean {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > MAP_TILE_MAX_ZOOM) return false;
  const max = 2 ** z;
  return x >= 0 && y >= 0 && x < max && y < max;
}

function getCached<T>(key: string): T | null {
  if (!isInProcessCacheEnabled()) return null;
  const entry = geoCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    geoCache.delete(key);
    return null;
  }
  entry.touchedAt = Date.now();
  return entry.value as T;
}

function setCached(key: string, value: unknown, ttlMs: number): void {
  if (!isInProcessCacheEnabled()) return;
  const now = Date.now();
  for (const [cacheKey, entry] of geoCache) {
    if (entry.expiresAt <= now) geoCache.delete(cacheKey);
  }
  while (geoCache.size >= GEO_CACHE_MAX_ITEMS) {
    const oldest = [...geoCache.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0]?.[0];
    if (!oldest) break;
    geoCache.delete(oldest);
  }
  geoCache.set(key, { value, expiresAt: now + ttlMs, touchedAt: now });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, Math.max(1, Math.trunc(concurrency)));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await mapper(item, index);
    }
  }));

  return results;
}

function mergeResults(...groups: GeoResult[][]): GeoResult[] {
  const seen = new Set<string>();
  const output: GeoResult[] = [];
  for (const result of groups.flat()) {
    const key = `${Math.round(result.lat * 100000)},${Math.round(result.lng * 100000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(result);
  }
  return output;
}

function precisionRank(value: GeoResult["precision"]): number {
  return { building: 0, street: 1, area: 2, city: 3, region: 4 }[value];
}

function rankSearchResults(
  results: GeoResult[],
  bias: { lat: number; lng: number } | undefined,
  primaryProvider: string,
): GeoResult[] {
  return results
    .map((result) => {
      const distanceKm = bias && validCoordinate(bias.lat, bias.lng)
        ? haversineKm(bias.lat, bias.lng, result.lat, result.lng)
        : result.distanceKm;
      return {
        ...result,
        ...(distanceKm == null ? {} : { distanceKm: Math.round(distanceKm * 10) / 10 }),
      };
    })
    .sort((a, b) => {
      const precisionDifference = precisionRank(a.precision) - precisionRank(b.precision);
      if (precisionDifference !== 0) return precisionDifference;
      if (a.distanceKm != null && b.distanceKm != null && a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      if (a.source !== b.source) {
        if (a.source === primaryProvider) return -1;
        if (b.source === primaryProvider) return 1;
      }
      return a.label.localeCompare(b.label);
    });
}

// Public and cacheable. Provider credentials remain server-side.
router.get("/tiles/:z/:x/:y.png", async (req, res) => {
  const z = Number(req.params.z);
  const x = Number(req.params.x);
  const y = Number(req.params.y);
  if (!validTileCoordinate(z, x, y)) {
    res.status(400).json({ error: "Invalid map tile coordinates" });
    return;
  }

  const runtimeOverrides = await getRuntimeMapOverrides();
  const config = getMapProviderConfiguration(runtimeOverrides);
  const status = getMapConfigurationStatus(runtimeOverrides);
  if (!status.configured) {
    logger.warn({ provider: status.provider, error: status.error, z, x, y }, "map tile provider is not configured");
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      error: "Map preview is temporarily unavailable",
      code: "MAP_TILE_PROVIDER_NOT_CONFIGURED",
    });
    return;
  }

  type TileResult = {
    body: Buffer;
    contentType: string;
    cacheControl: string;
    etag: string | null;
    candidateId: string;
  };

  const failures: Array<{ candidateId: string; status?: number; contentType?: string; reason: string }> = [];

  try {
    const candidates = buildMapTileUpstreamCandidates(z, x, y, runtimeOverrides);
    for (const candidate of candidates) {
      let upstream: globalThis.Response;
      try {
        upstream = await fetchWithTimeout(
          candidate.url,
          {
            headers: {
              Accept: "image/png,image/jpeg;q=0.9,*/*;q=0.1",
              "Accept-Language": config.tileProvider === "tomtom" ? config.tomtom.language : "en",
              "User-Agent": String(process.env.MAP_TILE_USER_AGENT || "AthooApp/1.0 (+https://athoo.pk)"),
            },
          },
          MAP_TILE_TIMEOUT_MS,
        );
      } catch (error) {
        failures.push({ candidateId: candidate.id, reason: error instanceof Error ? error.message : "network failure" });
        continue;
      }

      const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
      if (!upstream.ok || !contentType.startsWith("image/")) {
        failures.push({ candidateId: candidate.id, status: upstream.status, contentType, reason: "upstream rejected tile" });
        continue;
      }

      const body = Buffer.from(await upstream.arrayBuffer());
      if (!body.length) {
        failures.push({ candidateId: candidate.id, status: upstream.status, contentType, reason: "empty tile" });
        continue;
      }
      if (body.length > MAP_TILE_MAX_BYTES) {
        failures.push({ candidateId: candidate.id, status: upstream.status, contentType, reason: "tile exceeded size limit" });
        continue;
      }

      // A tiny PNG at a city-level zoom is commonly a transparent/no-data tile.
      // Try every configured raster generation, but never return or cache a
      // known-suspicious image as a successful map. The mobile client can then
      // show its honest retry state instead of a blank grey panel.
      const suspicious = config.tileProvider === "tomtom" && z >= 8 && body.length < MAP_TILE_SUSPICIOUS_BYTES;
      if (suspicious) {
        failures.push({ candidateId: candidate.id, status: upstream.status, contentType, reason: `suspiciously small tile (${body.length} bytes)` });
        continue;
      }
      const tile: TileResult = {
        body,
        contentType,
        cacheControl: String(upstream.headers.get("cache-control") || "").trim(),
        etag: upstream.headers.get("etag"),
        candidateId: candidate.id,
      };

      res.setHeader("Content-Type", tile.contentType);
      res.setHeader(
        "Cache-Control",
        MAP_TILE_RESPECT_UPSTREAM_CACHE && tile.cacheControl
          ? tile.cacheControl
          : `public, max-age=${MAP_TILE_BROWSER_CACHE_SECONDS}, s-maxage=${MAP_TILE_CDN_CACHE_SECONDS}, stale-while-revalidate=86400, stale-if-error=604800`,
      );
      res.setHeader("X-Map-Provider", status.provider);
      res.setHeader("X-Map-Upstream", tile.candidateId);
      res.setHeader("X-Map-Tile-Bytes", String(tile.body.length));
      if (tile.etag) res.setHeader("ETag", tile.etag);
      res.status(200).send(tile.body);
      return;
    }

    logger.warn({ provider: status.provider, operation: "tile", z, x, y, failures }, "map tile upstream rejected request");
    const responseTooLarge = failures.length > 0 && failures.every((failure) => failure.reason === "tile exceeded size limit");
    const responseNoData = failures.length > 0 && failures.every((failure) => failure.reason.startsWith("suspiciously small tile"));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Map-Provider", status.provider);
    res.setHeader("X-Map-Tile-Suspect", responseNoData ? "true" : "false");
    res.status(502).json({
      error: responseNoData ? "Map provider returned no usable map image" : "Map preview could not be loaded",
      code: responseTooLarge
        ? "MAP_TILE_RESPONSE_TOO_LARGE"
        : responseNoData
          ? "MAP_TILE_NO_USABLE_IMAGE"
          : "MAP_TILE_UPSTREAM_FAILED",
    });
  } catch (error) {
    logger.warn({ err: error, provider: status.provider, operation: "tile", z, x, y }, "map tile proxy unavailable");
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ error: "Map preview is temporarily unavailable", code: "MAP_TILE_TEMPORARILY_UNAVAILABLE" });
  }
});

router.get("/search", requireAuth, async (req: AuthRequest, res: Response) => {
  const query = String(req.query.q || "").replace(/\s+/g, " ").trim();
  const biasLat = Number(req.query.lat);
  const biasLng = Number(req.query.lng);
  const bias = validCoordinate(biasLat, biasLng) ? { lat: biasLat, lng: biasLng } : undefined;
  const requestedLimit = Number(req.query.limit || 10);
  const limit = Math.min(15, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 10));

  if (query.length < 3 || query.length > 160) {
    res.json({ results: [], source: "validation" });
    return;
  }

  const runtimeOverrides = await getRuntimeMapOverrides();
  const config = getMapProviderConfiguration(runtimeOverrides);
  const status = getMapConfigurationStatus(runtimeOverrides);
  const cacheable = status.searchCacheable;
  const biasKey = bias ? `${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : "pk";
  const cacheKey = `search:${config.searchProvider}:${query.toLowerCase()}:${biasKey}:${limit}`;
  const cached = cacheable ? getCached<GeoResult[]>(cacheKey) : null;
  if (cached) {
    res.json({ results: cached, source: `${config.searchProvider}-cache`, cacheable: true });
    return;
  }

  try {
    const primary = getMapOperationProvider(config.searchProvider);
    const primaryResults = primary?.search ? await primary.search({ query, limit, bias }) : [];
    let fallbackResults: GeoResult[] = [];
    if (config.fallbackEnabled && primaryResults.length < Math.min(4, limit)) {
      const fallback = getMapOperationProvider(config.searchFallbackProvider);
      if (fallback?.search && config.searchFallbackProvider !== config.searchProvider) {
        fallbackResults = await fallback.search({ query, limit: Math.min(8, limit), bias });
      }
    }
    const results = rankSearchResults(mergeResults(primaryResults, fallbackResults), bias, config.searchProvider).slice(0, limit);
    if (cacheable) setCached(cacheKey, results, 5 * 60 * 1000);
    res.json({ results, source: results.length ? config.searchProvider : "unavailable", cacheable });
  } catch (error) {
    logger.warn({ err: error, provider: config.searchProvider, operation: "search" }, "geo search upstream unavailable");
    res.json({ results: [], source: "unavailable", cacheable: false });
  }
});

router.get("/reverse", requireAuth, async (req: AuthRequest, res: Response) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!validCoordinate(lat, lng)) {
    res.status(400).json({ error: "Invalid coordinates" });
    return;
  }

  const runtimeOverrides = await getRuntimeMapOverrides();
  const config = getMapProviderConfiguration(runtimeOverrides);
  const status = getMapConfigurationStatus(runtimeOverrides);
  const cacheable = status.reverseCacheable;
  const cacheKey = `reverse:${config.reverseProvider}:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = cacheable ? getCached<{ address: string; source: string }>(cacheKey) : null;
  if (cached) {
    res.json({ ...cached, source: `${cached.source}-cache`, cacheable: true });
    return;
  }

  try {
    let source = config.reverseProvider;
    const primary = getMapOperationProvider(config.reverseProvider);
    let address = primary?.reverse ? await primary.reverse({ lat, lng }) : null;
    if (!address && config.fallbackEnabled && config.reverseFallbackProvider !== config.reverseProvider) {
      const fallback = getMapOperationProvider(config.reverseFallbackProvider);
      if (fallback?.reverse) {
        address = await fallback.reverse({ lat, lng });
        if (address) source = config.reverseFallbackProvider;
      }
    }
    const result = address && address.length > 4
      ? { address, source, cacheable }
      : { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: "coords", cacheable: true };
    if (result.cacheable) setCached(cacheKey, result, result.source === "coords" ? 60_000 : 24 * 60 * 60 * 1000);
    res.json(result);
  } catch (error) {
    logger.warn({ err: error, provider: config.reverseProvider, operation: "reverse" }, "geo reverse upstream unavailable");
    res.json({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: "coords", cacheable: true });
  }
});

router.post("/route-metrics", requireAuth, async (req: AuthRequest, res: Response) => {
  const originLat = Number(req.body?.originLat);
  const originLng = Number(req.body?.originLng);
  if (!validCoordinate(originLat, originLng)) {
    res.status(400).json({ error: "Valid origin coordinates are required" });
    return;
  }

  const maximumDestinations = Math.max(
    1,
    Math.min(20, Math.trunc(Number(process.env.GEO_ROUTE_METRICS_MAX_DESTINATIONS || 12))),
  );
  const concurrency = Math.max(
    1,
    Math.min(6, Math.trunc(Number(process.env.GEO_ROUTE_METRICS_CONCURRENCY || 3))),
  );
  const rawDestinations = Array.isArray(req.body?.destinations) ? req.body.destinations : [];

  if (!rawDestinations.length) {
    res.json({ routes: [], source: "empty" });
    return;
  }
  if (rawDestinations.length > maximumDestinations) {
    res.status(400).json({
      error: `A maximum of ${maximumDestinations} route destinations is allowed`,
      code: "ROUTE_METRICS_LIMIT_EXCEEDED",
    });
    return;
  }

  const seen = new Set<string>();
  const destinations: Array<{ id: string; lat: number; lng: number }> = [];
  for (const raw of rawDestinations) {
    const id = String(raw?.id || "").trim().slice(0, 120);
    const lat = Number(raw?.lat);
    const lng = Number(raw?.lng);
    if (!id || !validCoordinate(lat, lng)) {
      res.status(400).json({ error: "Every destination requires a valid id, lat, and lng" });
      return;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    destinations.push({ id, lat, lng });
  }

  const runtimeOverrides = await getRuntimeMapOverrides();
  const config = getMapProviderConfiguration(runtimeOverrides);

  const routes = await mapWithConcurrency(destinations, concurrency, async (destination) => {
    const cacheKey =
      `route-metric:${config.directionsProvider}:` +
      `${originLat.toFixed(4)},${originLng.toFixed(4)}:` +
      `${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
    const cached = getCached<{
      distanceKm: number;
      durationMin: number | null;
      source: string;
      routed: true;
    }>(cacheKey);
    if (cached) return { id: destination.id, ...cached, source: `${cached.source}-cache` };

    const request = {
      originLat,
      originLng,
      destLat: destination.lat,
      destLng: destination.lng,
    };

    try {
      const primary = getMapOperationProvider(config.directionsProvider);
      let result = primary?.directions ? await primary.directions(request) : null;

      if (
        !result &&
        config.fallbackEnabled &&
        config.directionsFallbackProvider !== config.directionsProvider
      ) {
        const fallback = getMapOperationProvider(config.directionsFallbackProvider);
        if (fallback?.directions) result = await fallback.directions(request);
      }

      const distanceKm = Number(result?.distanceKm);
      const durationValue = result?.durationMin == null ? null : Number(result.durationMin);
      const durationMin = durationValue != null && Number.isFinite(durationValue) && durationValue >= 0
        ? durationValue
        : null;
      const isRealRoute =
        result &&
        result.source !== "straight_line" &&
        Number.isFinite(distanceKm) &&
        distanceKm >= 0 &&
        Array.isArray(result.polyline) &&
        result.polyline.length >= 2;

      if (isRealRoute && result) {
        const metric = {
          distanceKm: Math.round(distanceKm * 10) / 10,
          durationMin: durationMin == null ? null : Math.max(1, Math.round(durationMin)),
          source: result.source,
          routed: true as const,
        };
        setCached(cacheKey, metric, 5 * 60 * 1000);
        return { id: destination.id, ...metric };
      }
    } catch (error) {
      logger.warn({
        err: error,
        provider: config.directionsProvider,
        operation: "route-metrics",
        destinationId: destination.id,
      }, "route metric upstream unavailable");
    }

    return {
      id: destination.id,
      distanceKm: null,
      durationMin: null,
      source: "unavailable",
      routed: false as const,
    };
  });

  res.json({
    routes,
    source: config.directionsProvider,
    maximumDestinations,
  });
});

router.get("/directions", requireAuth, async (req: AuthRequest, res: Response) => {
  const originLat = Number(req.query.originLat);
  const originLng = Number(req.query.originLng);
  const destLat = Number(req.query.destLat);
  const destLng = Number(req.query.destLng);
  if (!validCoordinate(originLat, originLng) || !validCoordinate(destLat, destLng)) {
    res.status(400).json({ error: "Valid origin and destination coordinates are required" });
    return;
  }

  const runtimeOverrides = await getRuntimeMapOverrides();
  const config = getMapProviderConfiguration(runtimeOverrides);
  const cacheKey = `directions:${config.directionsProvider}:${originLat.toFixed(4)},${originLng.toFixed(4)}:${destLat.toFixed(4)},${destLng.toFixed(4)}`;
  const cached = getCached<DirectionsResult>(cacheKey);
  if (cached) {
    res.json({ ...cached, source: `${cached.source}-cache` });
    return;
  }

  const request = { originLat, originLng, destLat, destLng };
  try {
    const primary = getMapOperationProvider(config.directionsProvider);
    let result = primary?.directions ? await primary.directions(request) : null;
    if (!result && config.fallbackEnabled && config.directionsFallbackProvider !== config.directionsProvider) {
      const fallback = getMapOperationProvider(config.directionsFallbackProvider);
      if (fallback?.directions) result = await fallback.directions(request);
    }
    if (result && result.polyline.length >= 2) {
      setCached(cacheKey, result, 5 * 60 * 1000);
      res.json(result);
      return;
    }
  } catch (error) {
    logger.warn({ err: error, provider: config.directionsProvider, operation: "directions" }, "geo directions upstream unavailable");
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
});

export default router;

import { getPlatformSettings, type PlatformSettings } from "./admin";
import type { MapProviderRuntimeOverrides } from "./mapConfiguration";
import { logger } from "./logger";

let lastFallbackWarningAt = 0;
const FALLBACK_WARNING_INTERVAL_MS = 60_000;

export function mapRuntimeOverridesFromSettings(settings: PlatformSettings): MapProviderRuntimeOverrides {
  return {
    enabled: settings.mapRuntimeConfigurationEnabled,
    primaryProvider: settings.mapPrimaryProvider,
    tileProvider: settings.mapTileProvider,
    searchProvider: settings.mapSearchProvider,
    reverseProvider: settings.mapReverseProvider,
    directionsProvider: settings.mapDirectionsProvider,
    fallbackEnabled: settings.mapProviderFallbackEnabled,
    searchFallbackProvider: settings.mapSearchFallbackProvider,
    reverseFallbackProvider: settings.mapReverseFallbackProvider,
    directionsFallbackProvider: settings.mapDirectionsFallbackProvider,
  };
}

/**
 * Runtime configuration is an operational override, not a single point of
 * failure. If the settings store is temporarily unavailable, map operations
 * safely continue with the deployment environment configuration.
 */
export async function getRuntimeMapOverrides(): Promise<MapProviderRuntimeOverrides> {
  try {
    return mapRuntimeOverridesFromSettings(await getPlatformSettings());
  } catch (error) {
    const now = Date.now();
    if (now - lastFallbackWarningAt >= FALLBACK_WARNING_INTERVAL_MS) {
      lastFallbackWarningAt = now;
      logger.warn({ err: error }, "runtime map settings unavailable; using deployment environment");
    }
    return { enabled: false };
  }
}

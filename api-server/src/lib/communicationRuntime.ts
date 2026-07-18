import { getPlatformSettings, type PlatformSettings } from "./admin";
import { logger } from "./logger";

export type CommunicationProviderRuntimeOverrides = {
  enabled?: boolean;
  emailProvider?: string;
  pushProvider?: string;
};

let lastFallbackWarningAt = 0;
const FALLBACK_WARNING_INTERVAL_MS = 60_000;

export function communicationRuntimeOverridesFromSettings(
  settings: PlatformSettings,
): CommunicationProviderRuntimeOverrides {
  return {
    enabled: settings.communicationRuntimeConfigurationEnabled,
    emailProvider: settings.emailProvider,
    pushProvider: settings.pushProvider,
  };
}

/**
 * Communication runtime settings are optional operational overrides. Provider
 * secrets stay in the deployment secret manager. If the settings store cannot
 * be read, delivery safely falls back to the environment configuration.
 */
export async function getRuntimeCommunicationOverrides(): Promise<CommunicationProviderRuntimeOverrides> {
  try {
    return communicationRuntimeOverridesFromSettings(await getPlatformSettings());
  } catch (error) {
    const now = Date.now();
    if (now - lastFallbackWarningAt >= FALLBACK_WARNING_INTERVAL_MS) {
      lastFallbackWarningAt = now;
      logger.warn({ err: error }, "runtime communication settings unavailable; using deployment environment");
    }
    return { enabled: false };
  }
}

export function runtimeProviderValue(enabled: boolean | undefined, value: unknown): string {
  if (!enabled) return "";
  const normalized = String(value || "").trim().toLowerCase();
  return normalized && normalized !== "environment" ? normalized : "";
}

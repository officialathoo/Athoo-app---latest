import Constants from "expo-constants";

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function asHttpsUrl(value: unknown): string | undefined {
  const normalized = asOptionalString(value);
  if (!normalized) return undefined;
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function asEmail(value: unknown): string | undefined {
  const normalized = asOptionalString(value)?.toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return undefined;
  return normalized;
}


function asBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function asMapTileSize(value: unknown): 256 | 512 | undefined {
  const parsed = Number(value);
  return parsed === 256 || parsed === 512 ? parsed : undefined;
}

const extra = (Constants.expoConfig?.extra || {}) as Record<string, unknown>;

/**
 * Public, non-secret runtime configuration exposed to the mobile app.
 *
 * Changeable provider URLs and support destinations are intentionally kept
 * outside screen components so builds can be moved between deployments
 * without editing UI code. Secrets must never be added here.
 */
export const runtimeConfig = Object.freeze({
  support: Object.freeze({
    whatsappUrl: asHttpsUrl(process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP_URL)
      || asHttpsUrl(extra.SUPPORT_WHATSAPP_URL),
    instagramUrl: asHttpsUrl(process.env.EXPO_PUBLIC_SUPPORT_INSTAGRAM_URL)
      || asHttpsUrl(extra.SUPPORT_INSTAGRAM_URL),
    facebookUrl: asHttpsUrl(process.env.EXPO_PUBLIC_SUPPORT_FACEBOOK_URL)
      || asHttpsUrl(extra.SUPPORT_FACEBOOK_URL),
    email: asEmail(process.env.EXPO_PUBLIC_SUPPORT_EMAIL)
      || asEmail(extra.SUPPORT_EMAIL),
    phoneDisplay: asOptionalString(process.env.EXPO_PUBLIC_SUPPORT_PHONE_DISPLAY)
      || asOptionalString(extra.SUPPORT_PHONE_DISPLAY),
    socialHandle: asOptionalString(process.env.EXPO_PUBLIC_SUPPORT_SOCIAL_HANDLE)
      || asOptionalString(extra.SUPPORT_SOCIAL_HANDLE),
  }),
  app: Object.freeze({
    downloadUrl: asHttpsUrl(process.env.EXPO_PUBLIC_APP_DOWNLOAD_URL)
      || asHttpsUrl(extra.APP_DOWNLOAD_URL),
  }),
  location: Object.freeze({
    providerForegroundSyncIntervalMs: asBoundedInteger(
      process.env.EXPO_PUBLIC_PROVIDER_LOCATION_SYNC_INTERVAL_MS
        || extra.PROVIDER_LOCATION_SYNC_INTERVAL_MS,
      120_000,
      60_000,
      10 * 60_000,
    ),
  }),
  notifications: Object.freeze({
    pushTokenSyncIntervalMs: asBoundedInteger(
      process.env.EXPO_PUBLIC_PUSH_TOKEN_SYNC_INTERVAL_MS
        || extra.PUSH_TOKEN_SYNC_INTERVAL_MS,
      15 * 60_000,
      5 * 60_000,
      6 * 60 * 60_000,
    ),
  }),
  maps: Object.freeze({
    tileUrl: asOptionalString(process.env.EXPO_PUBLIC_MAP_TILE_URL)
      || asOptionalString(extra.MAP_TILE_URL),
    tileSize: asMapTileSize(process.env.EXPO_PUBLIC_MAP_TILE_SIZE)
      || asMapTileSize(extra.MAP_TILE_SIZE)
      || 256,
    attribution: asOptionalString(process.env.EXPO_PUBLIC_MAP_ATTRIBUTION)
      || asOptionalString(extra.MAP_ATTRIBUTION)
      || "© OpenStreetMap contributors",
    externalAndroidUrlTemplate: asOptionalString(process.env.EXPO_PUBLIC_MAP_EXTERNAL_ANDROID_URL_TEMPLATE)
      || asOptionalString(extra.MAP_EXTERNAL_ANDROID_URL_TEMPLATE)
      || "geo:{lat},{lng}?q={lat},{lng}({label})",
    externalIosUrlTemplate: asOptionalString(process.env.EXPO_PUBLIC_MAP_EXTERNAL_IOS_URL_TEMPLATE)
      || asOptionalString(extra.MAP_EXTERNAL_IOS_URL_TEMPLATE)
      || "https://maps.apple.com/?ll={lat},{lng}&q={label}",
    externalWebUrlTemplate: asOptionalString(process.env.EXPO_PUBLIC_MAP_EXTERNAL_WEB_URL_TEMPLATE)
      || asOptionalString(extra.MAP_EXTERNAL_WEB_URL_TEMPLATE),
    externalAndroidSearchUrlTemplate: asOptionalString(process.env.EXPO_PUBLIC_MAP_EXTERNAL_ANDROID_SEARCH_URL_TEMPLATE)
      || asOptionalString(extra.MAP_EXTERNAL_ANDROID_SEARCH_URL_TEMPLATE)
      || "geo:0,0?q={query}",
    externalIosSearchUrlTemplate: asOptionalString(process.env.EXPO_PUBLIC_MAP_EXTERNAL_IOS_SEARCH_URL_TEMPLATE)
      || asOptionalString(extra.MAP_EXTERNAL_IOS_SEARCH_URL_TEMPLATE)
      || "https://maps.apple.com/?q={query}",
    externalWebSearchUrlTemplate: asOptionalString(process.env.EXPO_PUBLIC_MAP_EXTERNAL_WEB_SEARCH_URL_TEMPLATE)
      || asOptionalString(extra.MAP_EXTERNAL_WEB_SEARCH_URL_TEMPLATE),
  }),
  legal: Object.freeze({
    termsUrl: asHttpsUrl(process.env.EXPO_PUBLIC_TERMS_URL)
      || asHttpsUrl(extra.TERMS_URL),
    privacyUrl: asHttpsUrl(process.env.EXPO_PUBLIC_PRIVACY_URL)
      || asHttpsUrl(extra.PRIVACY_URL),
  }),
});

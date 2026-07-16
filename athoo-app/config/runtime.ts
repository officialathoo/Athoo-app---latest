import Constants from "expo-constants";

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
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
    whatsappUrl: asOptionalString(process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP_URL)
      || asOptionalString(extra.SUPPORT_WHATSAPP_URL),
    instagramUrl: asOptionalString(process.env.EXPO_PUBLIC_SUPPORT_INSTAGRAM_URL)
      || asOptionalString(extra.SUPPORT_INSTAGRAM_URL),
    facebookUrl: asOptionalString(process.env.EXPO_PUBLIC_SUPPORT_FACEBOOK_URL)
      || asOptionalString(extra.SUPPORT_FACEBOOK_URL),
    email: asOptionalString(process.env.EXPO_PUBLIC_SUPPORT_EMAIL)
      || asOptionalString(extra.SUPPORT_EMAIL),
    phoneDisplay: asOptionalString(process.env.EXPO_PUBLIC_SUPPORT_PHONE_DISPLAY)
      || asOptionalString(extra.SUPPORT_PHONE_DISPLAY),
    socialHandle: asOptionalString(process.env.EXPO_PUBLIC_SUPPORT_SOCIAL_HANDLE)
      || asOptionalString(extra.SUPPORT_SOCIAL_HANDLE),
  }),
  app: Object.freeze({
    downloadUrl: asOptionalString(process.env.EXPO_PUBLIC_APP_DOWNLOAD_URL)
      || asOptionalString(extra.APP_DOWNLOAD_URL),
  }),
  maps: Object.freeze({
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
    termsUrl: asOptionalString(process.env.EXPO_PUBLIC_TERMS_URL)
      || asOptionalString(extra.TERMS_URL),
    privacyUrl: asOptionalString(process.env.EXPO_PUBLIC_PRIVACY_URL)
      || asOptionalString(extra.PRIVACY_URL),
  }),
});

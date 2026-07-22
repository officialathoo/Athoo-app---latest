/**
 * Athoo Expo configuration
 *
 * Configuration rules:
 * - Deployment-specific values come from environment variables.
 * - Expo/EAS loads .env files automatically.
 * - EAS Remote Versioning controls Android versionCode and iOS buildNumber.
 * - No direct dotenv dependency is required.
 * - Provider URLs, branding, notifications and map settings remain configurable.
 */

const readEnv = (name, fallback = "") => {
  const value = process.env[name];

  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized || fallback;
};

const readBoolean = (name, fallback = false) => {
  const value = process.env[name];

  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const readInteger = (name, fallback, allowedValues = null) => {
  const parsed = Number.parseInt(
    readEnv(name, String(fallback)),
    10,
  );

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  if (
    Array.isArray(allowedValues) &&
    !allowedValues.includes(parsed)
  ) {
    return fallback;
  }

  return parsed;
};

const parseCsv = (value, fallback = []) => {
  const parsed = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : fallback;
};

const parseVibrationPattern = (value, fallback) => {
  const parsed = String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(
      (item) =>
        Number.isFinite(item) &&
        item >= 0 &&
        item <= 10000,
    )
    .slice(0, 12);

  return parsed.length >= 2 ? parsed : fallback;
};

const normalizeBaseUrl = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const uniqueValues = (values) =>
  [...new Set(values.filter(Boolean))];

/* -------------------------------------------------------------------------- */
/* Application identity                                                        */
/* -------------------------------------------------------------------------- */

const appEnvironment = readEnv(
  "APP_ENV",
  "development",
);

const isProduction =
  appEnvironment === "production";

const isStaging =
  appEnvironment === "staging";

const brandDisplayName = readEnv(
  "APP_DISPLAY_NAME",
  "Athoo",
);

const brandDescriptor = readEnv(
  "BRAND_DESCRIPTOR",
  "Home Services",
);

const appSlug = readEnv(
  "APP_SLUG",
  "athoo-app",
);

const appScheme = readEnv(
  "APP_SCHEME",
  "athoo",
);

const appVersion = readEnv(
  "APP_VERSION",
  "1.0.0",
);

const expoOwner = readEnv(
  "EXPO_OWNER",
  "athoo26436",
);

/*
 * Android package name and iOS bundle identifier are permanent application
 * identities. Changing them creates a different application in the stores.
 */
const androidPackage = readEnv(
  "ANDROID_PACKAGE",
  "com.athoo26436.athooapp",
);

const iosBundleIdentifier = readEnv(
  "IOS_BUNDLE_IDENTIFIER",
  "com.athoo26436.athooapp",
);

/*
 * EAS project identity is deployment-specific. Supply it through an ignored
 * local environment file or the selected EAS environment; never commit it into
 * this portable source package.
 */
const easProjectId = readEnv(
  "EAS_PROJECT_ID",
);

/* -------------------------------------------------------------------------- */
/* API and runtime configuration                                               */
/* -------------------------------------------------------------------------- */

const apiBaseUrl = normalizeBaseUrl(
  readEnv(
    "EXPO_PUBLIC_API_BASE_URL",
    readEnv("API_BASE_URL"),
  ),
);

const releaseVersion = readEnv(
  "EXPO_PUBLIC_RELEASE_VERSION",
  readEnv("RELEASE_VERSION", appVersion),
);

const releaseCommitSha = readEnv(
  "EXPO_PUBLIC_RELEASE_COMMIT_SHA",
  readEnv(
    "RELEASE_COMMIT_SHA",
    readEnv("EAS_BUILD_GIT_COMMIT_HASH"),
  ),
);

const releaseBuildId = readEnv(
  "EXPO_PUBLIC_RELEASE_BUILD_ID",
  readEnv(
    "RELEASE_BUILD_ID",
    readEnv("EAS_BUILD_ID"),
  ),
);

/* -------------------------------------------------------------------------- */
/* Brand colors                                                                */
/* -------------------------------------------------------------------------- */

const brandPrimaryColor = readEnv(
  "BRAND_PRIMARY_COLOR",
  "#1A6EE0",
);

const brandPrimaryPressedColor = readEnv(
  "BRAND_PRIMARY_PRESSED_COLOR",
  "#1558B4",
);

const brandPrimaryDarkColor = readEnv(
  "BRAND_PRIMARY_DARK_COLOR",
  "#60A5FA",
);

const brandPrimaryPressedDarkColor = readEnv(
  "BRAND_PRIMARY_PRESSED_DARK_COLOR",
  "#3B82F6",
);

const brandSecondaryColor = readEnv(
  "BRAND_SECONDARY_COLOR",
  "#F97316",
);

const brandSecondaryPressedColor = readEnv(
  "BRAND_SECONDARY_PRESSED_COLOR",
  "#C4510B",
);

const brandSecondaryDarkColor = readEnv(
  "BRAND_SECONDARY_DARK_COLOR",
  "#F97316",
);

const brandSecondaryPressedDarkColor = readEnv(
  "BRAND_SECONDARY_PRESSED_DARK_COLOR",
  "#EA580C",
);

/* -------------------------------------------------------------------------- */
/* Application assets                                                          */
/* -------------------------------------------------------------------------- */

const appIconPath = readEnv(
  "APP_ICON_PATH",
  "./assets/images/icon.png",
);

const adaptiveIconPath = readEnv(
  "ADAPTIVE_ICON_PATH",
  "./assets/images/adaptive-icon.png",
);

const splashImagePath = readEnv(
  "SPLASH_IMAGE_PATH",
  "./assets/images/splash.png",
);

const notificationIconPath = readEnv(
  "NOTIFICATION_ICON_PATH",
  "./assets/images/notification-icon.png",
);

const splashBackgroundLight = readEnv(
  "SPLASH_BACKGROUND_LIGHT",
  "#FFFFFF",
);

const splashBackgroundDark = readEnv(
  "SPLASH_BACKGROUND_DARK",
  "#08111F",
);

const adaptiveIconBackground = readEnv(
  "ADAPTIVE_ICON_BACKGROUND",
  splashBackgroundLight,
);

/* -------------------------------------------------------------------------- */
/* Notification configuration                                                  */
/* -------------------------------------------------------------------------- */

const notificationChannelVersion = readEnv(
  "NOTIFICATION_CHANNEL_VERSION",
  "4",
);

const notificationJobSound = readEnv(
  "NOTIFICATION_JOB_SOUND",
  "athoo_job.wav",
);

const notificationMessageSound = readEnv(
  "NOTIFICATION_MESSAGE_SOUND",
  "athoo_message.wav",
);

const notificationGeneralSound = readEnv(
  "NOTIFICATION_GENERAL_SOUND",
  "athoo_general.wav",
);

const notificationCallSound = readEnv(
  "NOTIFICATION_CALL_SOUND",
  "athoo_call.wav",
);

const notificationJobSoundAsset = readEnv(
  "NOTIFICATION_JOB_SOUND_ASSET",
  `./assets/sounds/${notificationJobSound}`,
);

const notificationMessageSoundAsset = readEnv(
  "NOTIFICATION_MESSAGE_SOUND_ASSET",
  `./assets/sounds/${notificationMessageSound}`,
);

const notificationGeneralSoundAsset = readEnv(
  "NOTIFICATION_GENERAL_SOUND_ASSET",
  `./assets/sounds/${notificationGeneralSound}`,
);

const notificationCallSoundAsset = readEnv(
  "NOTIFICATION_CALL_SOUND_ASSET",
  `./assets/sounds/${notificationCallSound}`,
);

const notificationConfiguration = {
  cleanupDeprecatedChannels: readBoolean(
    "NOTIFICATION_CLEANUP_DEPRECATED_CHANNELS",
    true,
  ),

  deprecatedChannelIds: parseCsv(
    readEnv(
      "NOTIFICATION_DEPRECATED_CHANNEL_IDS",
    ),
    [
      "jobs-v2",
      "messages-v2",
      "general-v2",
      "calls-v2",
      "jobs-v3",
      "messages-v3",
      "general-v3",
      "calls-v3",
    ],
  ),

  policies: {
    job: {
      channelId: readEnv(
        "NOTIFICATION_JOB_CHANNEL_ID",
        `jobs-v${notificationChannelVersion}`,
      ),

      channelName: readEnv(
        "NOTIFICATION_JOB_CHANNEL_NAME",
        "Jobs and Booking Alerts",
      ),

      sound: notificationJobSound,
      importance: "max",

      vibrationPattern: parseVibrationPattern(
        readEnv(
          "NOTIFICATION_JOB_VIBRATION",
        ),
        [0, 500, 180, 500, 180, 500],
      ),

      lightColor: readEnv(
        "NOTIFICATION_JOB_LIGHT_COLOR",
        brandSecondaryColor,
      ),
    },

    message: {
      channelId: readEnv(
        "NOTIFICATION_MESSAGE_CHANNEL_ID",
        `messages-v${notificationChannelVersion}`,
      ),

      channelName: readEnv(
        "NOTIFICATION_MESSAGE_CHANNEL_NAME",
        "Chat Messages",
      ),

      sound: notificationMessageSound,
      importance: "high",

      vibrationPattern: parseVibrationPattern(
        readEnv(
          "NOTIFICATION_MESSAGE_VIBRATION",
        ),
        [0, 220, 120, 220],
      ),

      lightColor: readEnv(
        "NOTIFICATION_MESSAGE_LIGHT_COLOR",
        "#8B5CF6",
      ),
    },

    general: {
      channelId: readEnv(
        "NOTIFICATION_GENERAL_CHANNEL_ID",
        `general-v${notificationChannelVersion}`,
      ),

      channelName: readEnv(
        "NOTIFICATION_GENERAL_CHANNEL_NAME",
        "General Updates",
      ),

      sound: notificationGeneralSound,
      importance: "high",

      vibrationPattern: parseVibrationPattern(
        readEnv(
          "NOTIFICATION_GENERAL_VIBRATION",
        ),
        [0, 300, 120, 300],
      ),

      lightColor: readEnv(
        "NOTIFICATION_GENERAL_LIGHT_COLOR",
        brandPrimaryColor,
      ),
    },

    call: {
      channelId: readEnv(
        "NOTIFICATION_CALL_CHANNEL_ID",
        `calls-v${notificationChannelVersion}`,
      ),

      channelName: readEnv(
        "NOTIFICATION_CALL_CHANNEL_NAME",
        "Incoming Calls",
      ),

      sound: notificationCallSound,
      importance: "max",

      vibrationPattern: parseVibrationPattern(
        readEnv(
          "NOTIFICATION_CALL_VIBRATION",
        ),
        [0, 700, 250, 700, 250, 700],
      ),

      lightColor: readEnv(
        "NOTIFICATION_CALL_LIGHT_COLOR",
        "#22C55E",
      ),
    },
  },
};

/* -------------------------------------------------------------------------- */
/* Map configuration                                                           */
/* -------------------------------------------------------------------------- */

const mapTileUrl = readEnv(
  "EXPO_PUBLIC_MAP_TILE_URL",
  apiBaseUrl
    ? `${apiBaseUrl}/api/geo/tiles/{z}/{x}/{y}.png?v=2`
    : "",
);

const mapAttribution = readEnv(
  "EXPO_PUBLIC_MAP_ATTRIBUTION",
  "© OpenStreetMap contributors",
);

const mapTileSize = readInteger(
  "EXPO_PUBLIC_MAP_TILE_SIZE",
  256,
  [256, 512],
);

const providerLocationSyncIntervalMs = Math.min(
  10 * 60 * 1000,
  Math.max(
    60 * 1000,
    readInteger(
      "EXPO_PUBLIC_PROVIDER_LOCATION_SYNC_INTERVAL_MS",
      120 * 1000,
    ),
  ),
);

const pushTokenSyncIntervalMs = Math.min(
  6 * 60 * 60 * 1000,
  Math.max(
    5 * 60 * 1000,
    readInteger(
      "EXPO_PUBLIC_PUSH_TOKEN_SYNC_INTERVAL_MS",
      15 * 60 * 1000,
    ),
  ),
);

/* -------------------------------------------------------------------------- */
/* Runtime values exposed through Expo Constants                               */
/* -------------------------------------------------------------------------- */

const extra = {
  appEnvironment,

  RELEASE_IDENTITY: {
    version: releaseVersion,
    environment: appEnvironment,
    ...(typeof releaseCommitSha === "string" && releaseCommitSha.trim()
      ? { commitSha: releaseCommitSha.trim() }
      : {}),
    ...(typeof releaseBuildId === "string" && releaseBuildId.trim()
      ? { buildId: releaseBuildId.trim() }
      : {}),
  },

  API_BASE_URL: apiBaseUrl,

  MAP_TILE_URL: mapTileUrl,
  MAP_ATTRIBUTION: mapAttribution,
  MAP_TILE_SIZE: mapTileSize,
  PROVIDER_LOCATION_SYNC_INTERVAL_MS: providerLocationSyncIntervalMs,
  PUSH_TOKEN_SYNC_INTERVAL_MS: pushTokenSyncIntervalMs,

  SUPPORT_WHATSAPP_URL: readEnv(
    "EXPO_PUBLIC_SUPPORT_WHATSAPP_URL",
  ),

  SUPPORT_INSTAGRAM_URL: readEnv(
    "EXPO_PUBLIC_SUPPORT_INSTAGRAM_URL",
  ),

  SUPPORT_FACEBOOK_URL: readEnv(
    "EXPO_PUBLIC_SUPPORT_FACEBOOK_URL",
  ),

  SUPPORT_EMAIL: readEnv(
    "EXPO_PUBLIC_SUPPORT_EMAIL",
  ),

  SUPPORT_PHONE_DISPLAY: readEnv(
    "EXPO_PUBLIC_SUPPORT_PHONE_DISPLAY",
  ),

  SUPPORT_SOCIAL_HANDLE: readEnv(
    "EXPO_PUBLIC_SUPPORT_SOCIAL_HANDLE",
  ),

  APP_DOWNLOAD_URL: readEnv(
    "EXPO_PUBLIC_APP_DOWNLOAD_URL",
  ),

  MAP_EXTERNAL_ANDROID_URL_TEMPLATE: readEnv(
    "EXPO_PUBLIC_MAP_EXTERNAL_ANDROID_URL_TEMPLATE",
    "geo:{lat},{lng}?q={lat},{lng}({label})",
  ),

  MAP_EXTERNAL_IOS_URL_TEMPLATE: readEnv(
    "EXPO_PUBLIC_MAP_EXTERNAL_IOS_URL_TEMPLATE",
    "https://maps.apple.com/?ll={lat},{lng}&q={label}",
  ),

  MAP_EXTERNAL_WEB_URL_TEMPLATE: readEnv(
    "EXPO_PUBLIC_MAP_EXTERNAL_WEB_URL_TEMPLATE",
  ),

  MAP_EXTERNAL_ANDROID_SEARCH_URL_TEMPLATE:
    readEnv(
      "EXPO_PUBLIC_MAP_EXTERNAL_ANDROID_SEARCH_URL_TEMPLATE",
      "geo:0,0?q={query}",
    ),

  MAP_EXTERNAL_IOS_SEARCH_URL_TEMPLATE:
    readEnv(
      "EXPO_PUBLIC_MAP_EXTERNAL_IOS_SEARCH_URL_TEMPLATE",
      "https://maps.apple.com/?q={query}",
    ),

  MAP_EXTERNAL_WEB_SEARCH_URL_TEMPLATE:
    readEnv(
      "EXPO_PUBLIC_MAP_EXTERNAL_WEB_SEARCH_URL_TEMPLATE",
    ),

  TERMS_URL: readEnv(
    "EXPO_PUBLIC_TERMS_URL",
  ),

  PRIVACY_URL: readEnv(
    "EXPO_PUBLIC_PRIVACY_URL",
  ),

  BRAND_DISPLAY_NAME: brandDisplayName,
  BRAND_DESCRIPTOR: brandDescriptor,

  BRAND_PRIMARY_COLOR: brandPrimaryColor,
  BRAND_PRIMARY_PRESSED_COLOR:
    brandPrimaryPressedColor,

  BRAND_PRIMARY_DARK_COLOR:
    brandPrimaryDarkColor,

  BRAND_PRIMARY_PRESSED_DARK_COLOR:
    brandPrimaryPressedDarkColor,

  BRAND_SECONDARY_COLOR:
    brandSecondaryColor,

  BRAND_SECONDARY_PRESSED_COLOR:
    brandSecondaryPressedColor,

  BRAND_SECONDARY_DARK_COLOR:
    brandSecondaryDarkColor,

  BRAND_SECONDARY_PRESSED_DARK_COLOR:
    brandSecondaryPressedDarkColor,

  NOTIFICATION_CONFIG:
    notificationConfiguration,

  ...(easProjectId
    ? {
      eas: {
        projectId: easProjectId,
      },
    }
    : {}),
};

/* -------------------------------------------------------------------------- */
/* Display name by environment                                                 */
/* -------------------------------------------------------------------------- */

const displayName = isProduction
  ? brandDisplayName
  : `${brandDisplayName} ${isStaging ? "Beta" : "Dev"
  }`;

/* -------------------------------------------------------------------------- */
/* Expo application configuration                                              */
/* -------------------------------------------------------------------------- */

module.exports = {
  expo: {
    name: displayName,
    slug: appSlug,
    owner: expoOwner,
    version: appVersion,
    // MapLibre React Native v11 requires React Native's New Architecture.
    // Expo SDK 54 defaults to it, but keeping this explicit prevents a future
    // deployment override from silently producing an incompatible native build.
    newArchEnabled: true,

    orientation: "portrait",
    icon: appIconPath,
    scheme: appScheme,
    userInterfaceStyle: "automatic",

    runtimeVersion: {
      policy: "appVersion",
    },

    ...(easProjectId
      ? {
        updates: {
          url: `https://u.expo.dev/${easProjectId}`,
        },
      }
      : {}),

    ios: {
      supportsTablet: false,
      bundleIdentifier: iosBundleIdentifier,

      infoPlist: {
        NSCameraUsageDescription:
          `${brandDisplayName} uses your camera to upload profile photos, booking evidence, and documents.`,

        NSLocationWhenInUseUsageDescription:
          `${brandDisplayName} uses your location to find nearby service providers and track active jobs.`,

        NSMicrophoneUsageDescription:
          `${brandDisplayName} uses the microphone for secure in-app voice and video calls.`,

        NSFaceIDUsageDescription:
          `${brandDisplayName} uses Face ID for quick, secure sign-in.`,

        NSPhotoLibraryUsageDescription:
          `${brandDisplayName} accesses your photo library when you choose media to upload.`,

        NSPhotoLibraryAddUsageDescription:
          `${brandDisplayName} saves media to your photo library only when you request it.`,
      },
    },

    androidStatusBar: {
      backgroundColor:
        splashBackgroundLight,

      translucent: false,
      barStyle: "dark-content",
    },

    android: {
      package: androidPackage,

      adaptiveIcon: {
        foregroundImage:
          adaptiveIconPath,

        backgroundColor:
          adaptiveIconBackground,
      },

      permissions: uniqueValues([
        "android.permission.USE_BIOMETRIC",
        "android.permission.USE_FINGERPRINT",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.VIBRATE",
      ]),
    },

    web: {
      favicon:
        "./assets/images/favicon.png",
    },

    plugins: [
      "expo-router",
      "expo-font",
      "expo-web-browser",
      "@maplibre/maplibre-react-native",

      [
        "expo-splash-screen",
        {
          image: splashImagePath,
          imageWidth: 220,
          resizeMode: "contain",

          backgroundColor:
            splashBackgroundLight,

          dark: {
            image: splashImagePath,

            backgroundColor:
              splashBackgroundDark,
          },
        },
      ],

      [
        "@config-plugins/react-native-webrtc",
        {
          cameraPermission:
            `${brandDisplayName} uses the camera for secure in-app video calls.`,

          microphonePermission:
            `${brandDisplayName} uses the microphone for secure in-app voice and video calls.`,
        },
      ],

      [
        "expo-notifications",
        {
          icon: notificationIconPath,
          color: brandPrimaryColor,

          defaultChannel:
            notificationConfiguration
              .policies
              .general
              .channelId,

          sounds: uniqueValues([
            notificationJobSoundAsset,
            notificationMessageSoundAsset,
            notificationGeneralSoundAsset,
            notificationCallSoundAsset,
          ]),
        },
      ],

      [
        "expo-image-picker",
        {
          photosPermission:
            `${brandDisplayName} needs photo-library access so you can choose booking media, payment screenshots, and documents.`,

          cameraPermission:
            `${brandDisplayName} needs camera access so you can capture booking media and documents.`,
        },
      ],

      "expo-secure-store",

      [
        "expo-location",
        {
          locationWhenInUsePermission:
            `${brandDisplayName} uses your location to find nearby providers and share live job progress while the app is open.`,

          isAndroidBackgroundLocationEnabled:
            false,

          isIosBackgroundLocationEnabled:
            false,
        },
      ],

      [
        "expo-local-authentication",
        {
          faceIDPermission:
            `Allow ${brandDisplayName} to use Face ID for secure sign-in.`,
        },
      ],
    ],

    experiments: {
      typedRoutes: true,
    },

    extra,
  },
};
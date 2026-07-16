import "dotenv/config";

const appEnvironment = process.env.APP_ENV || "development";
const brandDisplayName = process.env.APP_DISPLAY_NAME || "Athoo";
const appSlug = process.env.APP_SLUG || "athoo-app";
const appScheme = process.env.APP_SCHEME || "athoo";
const brandPrimaryColor = process.env.BRAND_PRIMARY_COLOR || "#1A6EE0";
const brandPrimaryPressedColor = process.env.BRAND_PRIMARY_PRESSED_COLOR || "#1558B4";
const brandPrimaryDarkColor = process.env.BRAND_PRIMARY_DARK_COLOR || "#60A5FA";
const brandPrimaryPressedDarkColor = process.env.BRAND_PRIMARY_PRESSED_DARK_COLOR || "#3B82F6";
const brandSecondaryColor = process.env.BRAND_SECONDARY_COLOR || "#F97316";
const brandSecondaryPressedColor = process.env.BRAND_SECONDARY_PRESSED_COLOR || "#C4510B";
const brandSecondaryDarkColor = process.env.BRAND_SECONDARY_DARK_COLOR || "#F97316";
const brandSecondaryPressedDarkColor = process.env.BRAND_SECONDARY_PRESSED_DARK_COLOR || "#EA580C";
const appIconPath = process.env.APP_ICON_PATH || "./assets/images/icon.png";
const adaptiveIconPath = process.env.ADAPTIVE_ICON_PATH || "./assets/images/adaptive-icon.png";
const splashImagePath = process.env.SPLASH_IMAGE_PATH || "./assets/images/splash.png";
const splashBackgroundLight = process.env.SPLASH_BACKGROUND_LIGHT || "#FFFFFF";
const splashBackgroundDark = process.env.SPLASH_BACKGROUND_DARK || "#08111F";
const adaptiveIconBackground = process.env.ADAPTIVE_ICON_BACKGROUND || "#FFFFFF";
const notificationIconPath = process.env.NOTIFICATION_ICON_PATH || "./assets/images/notification-icon.png";
const notificationChannelVersion = process.env.NOTIFICATION_CHANNEL_VERSION || "3";
const notificationJobSound = process.env.NOTIFICATION_JOB_SOUND || "athoo_job.wav";
const notificationMessageSound = process.env.NOTIFICATION_MESSAGE_SOUND || "athoo_message.wav";
const notificationGeneralSound = process.env.NOTIFICATION_GENERAL_SOUND || "athoo_general.wav";
const notificationCallSound = process.env.NOTIFICATION_CALL_SOUND || "athoo_call.wav";
const notificationJobSoundAsset = process.env.NOTIFICATION_JOB_SOUND_ASSET || `./assets/sounds/${notificationJobSound}`;
const notificationMessageSoundAsset = process.env.NOTIFICATION_MESSAGE_SOUND_ASSET || `./assets/sounds/${notificationMessageSound}`;
const notificationGeneralSoundAsset = process.env.NOTIFICATION_GENERAL_SOUND_ASSET || `./assets/sounds/${notificationGeneralSound}`;
const notificationCallSoundAsset = process.env.NOTIFICATION_CALL_SOUND_ASSET || `./assets/sounds/${notificationCallSound}`;

function parseVibrationPattern(value, fallback) {
  const parsed = String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0 && item <= 10000)
    .slice(0, 12);
  return parsed.length >= 2 ? parsed : fallback;
}

const notificationConfig = {
  cleanupDeprecatedChannels: process.env.NOTIFICATION_CLEANUP_DEPRECATED_CHANNELS !== "false",
  deprecatedChannelIds: String(
    process.env.NOTIFICATION_DEPRECATED_CHANNEL_IDS || "jobs-v2,messages-v2,general-v2,calls-v2",
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  policies: {
    job: {
      channelId: process.env.NOTIFICATION_JOB_CHANNEL_ID || `jobs-v${notificationChannelVersion}`,
      channelName: process.env.NOTIFICATION_JOB_CHANNEL_NAME || "Jobs and Booking Alerts",
      sound: notificationJobSound,
      importance: "max",
      vibrationPattern: parseVibrationPattern(process.env.NOTIFICATION_JOB_VIBRATION, [0, 500, 180, 500, 180, 500]),
      lightColor: process.env.NOTIFICATION_JOB_LIGHT_COLOR || brandSecondaryColor,
    },
    message: {
      channelId: process.env.NOTIFICATION_MESSAGE_CHANNEL_ID || `messages-v${notificationChannelVersion}`,
      channelName: process.env.NOTIFICATION_MESSAGE_CHANNEL_NAME || "Chat Messages",
      sound: notificationMessageSound,
      importance: "high",
      vibrationPattern: parseVibrationPattern(process.env.NOTIFICATION_MESSAGE_VIBRATION, [0, 220, 120, 220]),
      lightColor: process.env.NOTIFICATION_MESSAGE_LIGHT_COLOR || "#8B5CF6",
    },
    general: {
      channelId: process.env.NOTIFICATION_GENERAL_CHANNEL_ID || `general-v${notificationChannelVersion}`,
      channelName: process.env.NOTIFICATION_GENERAL_CHANNEL_NAME || "General Updates",
      sound: notificationGeneralSound,
      importance: "high",
      vibrationPattern: parseVibrationPattern(process.env.NOTIFICATION_GENERAL_VIBRATION, [0, 300, 120, 300]),
      lightColor: process.env.NOTIFICATION_GENERAL_LIGHT_COLOR || brandPrimaryColor,
    },
    call: {
      channelId: process.env.NOTIFICATION_CALL_CHANNEL_ID || `calls-v${notificationChannelVersion}`,
      channelName: process.env.NOTIFICATION_CALL_CHANNEL_NAME || "Incoming Calls",
      sound: notificationCallSound,
      importance: "max",
      vibrationPattern: parseVibrationPattern(process.env.NOTIFICATION_CALL_VIBRATION, [0, 700, 250, 700, 250, 700]),
      lightColor: process.env.NOTIFICATION_CALL_LIGHT_COLOR || "#22C55E",
    },
  },
};
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  "";
const normalizedApiBaseUrl = String(apiBaseUrl || "").replace(/\/$/, "");
const mapTileUrl =
  process.env.EXPO_PUBLIC_MAP_TILE_URL ||
  (normalizedApiBaseUrl ? `${normalizedApiBaseUrl}/api/geo/tiles/{z}/{x}/{y}.png` : "");
const mapAttribution =
  process.env.EXPO_PUBLIC_MAP_ATTRIBUTION ||
  "© OpenStreetMap contributors";
const configuredMapTileSize = Number(process.env.EXPO_PUBLIC_MAP_TILE_SIZE || 256);
const mapTileSize = configuredMapTileSize === 512 ? 512 : 256;
const supportWhatsAppUrl = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP_URL || "";
const supportInstagramUrl = process.env.EXPO_PUBLIC_SUPPORT_INSTAGRAM_URL || "";
const supportFacebookUrl = process.env.EXPO_PUBLIC_SUPPORT_FACEBOOK_URL || "";
const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "";
const supportPhoneDisplay = process.env.EXPO_PUBLIC_SUPPORT_PHONE_DISPLAY || "";
const supportSocialHandle = process.env.EXPO_PUBLIC_SUPPORT_SOCIAL_HANDLE || "";
const appDownloadUrl = process.env.EXPO_PUBLIC_APP_DOWNLOAD_URL || "";
const mapExternalAndroidUrlTemplate = process.env.EXPO_PUBLIC_MAP_EXTERNAL_ANDROID_URL_TEMPLATE || "geo:{lat},{lng}?q={lat},{lng}({label})";
const mapExternalIosUrlTemplate = process.env.EXPO_PUBLIC_MAP_EXTERNAL_IOS_URL_TEMPLATE || "https://maps.apple.com/?ll={lat},{lng}&q={label}";
const mapExternalWebUrlTemplate = process.env.EXPO_PUBLIC_MAP_EXTERNAL_WEB_URL_TEMPLATE || "";
const mapExternalAndroidSearchUrlTemplate = process.env.EXPO_PUBLIC_MAP_EXTERNAL_ANDROID_SEARCH_URL_TEMPLATE || "geo:0,0?q={query}";
const mapExternalIosSearchUrlTemplate = process.env.EXPO_PUBLIC_MAP_EXTERNAL_IOS_SEARCH_URL_TEMPLATE || "https://maps.apple.com/?q={query}";
const mapExternalWebSearchUrlTemplate = process.env.EXPO_PUBLIC_MAP_EXTERNAL_WEB_SEARCH_URL_TEMPLATE || "";
const termsUrl = process.env.EXPO_PUBLIC_TERMS_URL || "";
const privacyUrl = process.env.EXPO_PUBLIC_PRIVACY_URL || "";

const easProjectId =
  process.env.EAS_PROJECT_ID ||
  "42a7f8fe-68ea-4422-8f46-0def1f55abb9";
const appVersion = process.env.APP_VERSION || "1.0.0";
const androidVersionCode = Number(process.env.ANDROID_VERSION_CODE || 1);
const iosBuildNumber = process.env.IOS_BUILD_NUMBER || "1";

const extra = {
  appEnvironment,
  API_BASE_URL: apiBaseUrl,
  MAP_TILE_URL: mapTileUrl,
  MAP_ATTRIBUTION: mapAttribution,
  MAP_TILE_SIZE: mapTileSize,
  SUPPORT_WHATSAPP_URL: supportWhatsAppUrl,
  SUPPORT_INSTAGRAM_URL: supportInstagramUrl,
  SUPPORT_FACEBOOK_URL: supportFacebookUrl,
  SUPPORT_EMAIL: supportEmail,
  SUPPORT_PHONE_DISPLAY: supportPhoneDisplay,
  SUPPORT_SOCIAL_HANDLE: supportSocialHandle,
  APP_DOWNLOAD_URL: appDownloadUrl,
  MAP_EXTERNAL_ANDROID_URL_TEMPLATE: mapExternalAndroidUrlTemplate,
  MAP_EXTERNAL_IOS_URL_TEMPLATE: mapExternalIosUrlTemplate,
  MAP_EXTERNAL_WEB_URL_TEMPLATE: mapExternalWebUrlTemplate,
  MAP_EXTERNAL_ANDROID_SEARCH_URL_TEMPLATE: mapExternalAndroidSearchUrlTemplate,
  MAP_EXTERNAL_IOS_SEARCH_URL_TEMPLATE: mapExternalIosSearchUrlTemplate,
  MAP_EXTERNAL_WEB_SEARCH_URL_TEMPLATE: mapExternalWebSearchUrlTemplate,
  TERMS_URL: termsUrl,
  PRIVACY_URL: privacyUrl,
  BRAND_DISPLAY_NAME: brandDisplayName,
  BRAND_DESCRIPTOR: process.env.BRAND_DESCRIPTOR || "Home Services",
  BRAND_PRIMARY_COLOR: brandPrimaryColor,
  BRAND_PRIMARY_PRESSED_COLOR: brandPrimaryPressedColor,
  BRAND_PRIMARY_DARK_COLOR: brandPrimaryDarkColor,
  BRAND_PRIMARY_PRESSED_DARK_COLOR: brandPrimaryPressedDarkColor,
  BRAND_SECONDARY_COLOR: brandSecondaryColor,
  BRAND_SECONDARY_PRESSED_COLOR: brandSecondaryPressedColor,
  BRAND_SECONDARY_DARK_COLOR: brandSecondaryDarkColor,
  BRAND_SECONDARY_PRESSED_DARK_COLOR: brandSecondaryPressedDarkColor,
  NOTIFICATION_CONFIG: notificationConfig,
};

if (easProjectId) {
  extra.eas = {
    projectId: easProjectId,
  };
}

export default {
  expo: {
    name:
      appEnvironment === "production"
        ? brandDisplayName
        : `${brandDisplayName} ${appEnvironment === "staging" ? "Beta" : "Dev"}`,

    slug: appSlug,
    version: appVersion,
    orientation: "portrait",
    icon: appIconPath,
    scheme: appScheme,
    userInterfaceStyle: "automatic",

    runtimeVersion: {
      policy: "appVersion",
    },

    updates: easProjectId ? {
      url: `https://u.expo.dev/${easProjectId}`,
    } : undefined,

    ios: {
      supportsTablet: false,
      bundleIdentifier:
        process.env.IOS_BUNDLE_IDENTIFIER ||
        "com.athoo26436.athooapp",

      buildNumber: iosBuildNumber,

      config: {
            },

      infoPlist: {
        NSCameraUsageDescription:
          `${brandDisplayName} uses your camera to upload your profile photo and documents.`,

        NSLocationWhenInUseUsageDescription:
          `${brandDisplayName} uses your location to find nearby service providers and track jobs.`,

        NSMicrophoneUsageDescription:
          `${brandDisplayName} uses the microphone for in-app voice and video calls with providers.`,

        NSFaceIDUsageDescription:
          `${brandDisplayName} uses Face ID for quick, secure sign-in.`,

        NSPhotoLibraryUsageDescription:
          `${brandDisplayName} accesses your photo library to upload profile and document photos.`,

        NSPhotoLibraryAddUsageDescription:
          `${brandDisplayName} saves photos to your library when requested.`,
      },
    },

    androidStatusBar: {
      backgroundColor: splashBackgroundLight,
      translucent: false,
      barStyle: "dark-content",
    },

    android: {
      package:
        process.env.ANDROID_PACKAGE ||
        "com.athoo26436.athooapp",

      versionCode: androidVersionCode,

      adaptiveIcon: {
        foregroundImage: adaptiveIconPath,
        backgroundColor: adaptiveIconBackground,
      },


      permissions: [
        "android.permission.USE_BIOMETRIC",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.RECORD_AUDIO",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.USE_FINGERPRINT",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.VIBRATE",
        "android.permission.READ_MEDIA_IMAGES",
      ],
    },

    web: {
      favicon: "./assets/images/favicon.png",
    },

    plugins: [
      "expo-router",
      "expo-font",
      "expo-web-browser",
      [
        "expo-splash-screen",
        {
          image: splashImagePath,
          imageWidth: 220,
          resizeMode: "contain",
          backgroundColor: splashBackgroundLight,
          dark: {
            image: splashImagePath,
            backgroundColor: splashBackgroundDark,
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
          defaultChannel: notificationConfig.policies.general.channelId,
          sounds: Array.from(new Set([
            notificationJobSoundAsset,
            notificationMessageSoundAsset,
            notificationGeneralSoundAsset,
            notificationCallSoundAsset,
          ])),
        },
      ],

      [
        "expo-image-picker",
        {
          photosPermission:
            `${brandDisplayName} needs photo library access so you can upload booking videos, payment screenshots, documents, and support ticket media.`,

          cameraPermission:
            `${brandDisplayName} needs camera access so you can take photos and videos for bookings, documents, and support tickets.`,
        },
      ],

      "expo-secure-store",

      [
        "expo-location",
        {
          locationWhenInUsePermission:
            `${brandDisplayName} uses your location to find nearby providers and share live job progress while the app is open.`,

          isAndroidBackgroundLocationEnabled: false,
          isIosBackgroundLocationEnabled: false,
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
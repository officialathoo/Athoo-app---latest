import "dotenv/config";

const appEnvironment = process.env.APP_ENV || "development";
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  "";
const mapTileUrl =
  process.env.EXPO_PUBLIC_MAP_TILE_URL ||
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const easProjectId = process.env.EAS_PROJECT_ID || "";
const appVersion = process.env.APP_VERSION || "1.0.0";
const androidVersionCode = Number(process.env.ANDROID_VERSION_CODE || 1);
const iosBuildNumber = process.env.IOS_BUILD_NUMBER || "1";

const extra = {
  appEnvironment,
  API_BASE_URL: apiBaseUrl,
  MAP_TILE_URL: mapTileUrl,
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
        ? "Athoo"
        : `Athoo ${appEnvironment === "staging" ? "Beta" : "Dev"}`,

    slug: "athoo-app",
    version: appVersion,
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "athoo",
    userInterfaceStyle: "automatic",

    runtimeVersion: {
      policy: "appVersion",
    },

    updates: {
      url: "https://u.expo.dev/42a7f8fe-68ea-4422-8f46-0def1f55abb9",
    },

    splash: {
      image: "./assets/images/splash.png",
      resizeMode: "contain",
      backgroundColor: "#FFFFFF",
    },

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
          "Athoo uses your camera to upload your profile photo and documents.",

        NSLocationWhenInUseUsageDescription:
          "Athoo uses your location to find nearby service providers and track jobs.",

        NSMicrophoneUsageDescription:
          "Athoo uses the microphone for in-app voice and video calls with providers.",

        NSFaceIDUsageDescription:
          "Athoo uses Face ID for quick, secure sign-in.",

        NSPhotoLibraryUsageDescription:
          "Athoo accesses your photo library to upload profile and document photos.",

        NSPhotoLibraryAddUsageDescription:
          "Athoo saves photos to your library when requested.",
      },
    },

    androidStatusBar: {
      backgroundColor: "#00000000",
      translucent: true,
      barStyle: "dark-content",
    },

    android: {
      package:
        process.env.ANDROID_PACKAGE ||
        "com.athoo26436.athooapp",

      versionCode: androidVersionCode,

      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#FFFFFF",
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
        "@config-plugins/react-native-webrtc",
        {
          cameraPermission:
            "Athoo uses the camera for secure in-app video calls.",

          microphonePermission:
            "Athoo uses the microphone for secure in-app voice and video calls.",
        },
      ],

      [
        "expo-notifications",
        {
          icon: "./assets/images/notification-icon.png",
          color: "#1A6EE0",
          defaultChannel: "general-v2",
          sounds: [
            "./assets/sounds/athoo_job.wav",
            "./assets/sounds/athoo_message.wav",
            "./assets/sounds/athoo_general.wav",
            "./assets/sounds/athoo_call.wav",
          ],
        },
      ],

      [
        "expo-image-picker",
        {
          photosPermission:
            "Athoo needs photo library access so you can upload booking videos, payment screenshots, documents, and support ticket media.",

          cameraPermission:
            "Athoo needs camera access so you can take photos and videos for bookings, documents, and support tickets.",
        },
      ],

      "expo-secure-store",

      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Athoo uses your location to find nearby providers and share live job progress while the app is open.",

          isAndroidBackgroundLocationEnabled: false,
          isIosBackgroundLocationEnabled: false,
        },
      ],

      [
        "expo-local-authentication",
        {
          faceIDPermission:
            "Allow Athoo to use Face ID for secure sign-in.",
        },
      ],
    ],

    experiments: {
      typedRoutes: true,
    },

    extra,
  },
};
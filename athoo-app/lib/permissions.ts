import { Alert, Linking, Platform } from "react-native";
import * as Location from "expo-location";
import Constants from "expo-constants";

function isExpoGoRuntime(): boolean {
  const C = Constants as any;
  const owner = String(C?.appOwnership || "").toLowerCase();
  const env = String(C?.executionEnvironment || "").toLowerCase();
  // Expo Go cannot reliably load remote push notification native modules.
  // In production/dev-client builds this becomes false, so real notifications still work.
  return owner === "expo" || owner === "guest" || env.includes("storeclient") || (!!__DEV__ && owner !== "standalone");
}

export type PermissionResult = "granted" | "denied" | "blocked" | "services_disabled";

/** Open the OS-level app settings page so the user can flip a permission toggle. */
export function openAppSettings(): Promise<void> {
  if (Platform.OS === "ios") {
    return Linking.openURL("app-settings:");
  }
  return Linking.openSettings();
}

function showBlockedAlert(featureName: string, reason: string) {
  Alert.alert(
    `${featureName} permission is blocked`,
    `${reason}\n\nPlease enable it in your device Settings → Athoo.`,
    [
      { text: "Not Now", style: "cancel" },
      { text: "Open Settings", onPress: () => openAppSettings().catch(() => {}) },
    ],
  );
}

/**
 * Request foreground location with branded fallback if the user previously denied.
 *
 * Flow:
 *  1. Check `getForegroundPermissionsAsync()` — if already granted, return immediately.
 *  2. Verify Location services (GPS) are on. If not, show "GPS off" prompt with Open Settings.
 *  3. Call `requestForegroundPermissionsAsync()`.
 *  4. If the result is denied AND `canAskAgain` is false (system-level "never ask again"),
 *     show a branded "permission blocked" alert with an Open Settings button.
 */
export async function ensureForegroundLocation(opts?: {
  rationaleTitle?: string;
  rationaleBody?: string;
}): Promise<PermissionResult> {
  const title = opts?.rationaleTitle || "Location permission";
  const body = opts?.rationaleBody || "Athoo uses your location to find nearby providers and route them to you.";

  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === "granted") {
    const services = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!services) {
      Alert.alert(
        "GPS is turned off",
        "Please turn on Location/GPS in your device settings so we can find your address.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => openAppSettings().catch(() => {}) },
        ],
      );
      return "services_disabled";
    }
    return "granted";
  }

  const result = await Location.requestForegroundPermissionsAsync();
  if (result.status === "granted") {
    const services = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!services) {
      Alert.alert(
        "GPS is turned off",
        "Please turn on Location/GPS in your device settings so we can find your address.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => openAppSettings().catch(() => {}) },
        ],
      );
      return "services_disabled";
    }
    return "granted";
  }

  if (result.canAskAgain === false) {
    showBlockedAlert(title, body);
    return "blocked";
  }

  Alert.alert(title, body);
  return "denied";
}

/**
 * Request background ("Always") location for live job tracking. Only relevant on
 * native — web has no equivalent. Always call `ensureForegroundLocation` first;
 * the OS will reject background requests without it.
 */
export async function ensureBackgroundLocation(): Promise<PermissionResult> {
  if (Platform.OS === "web" || isExpoGoRuntime()) return "denied";
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    const r = await ensureForegroundLocation({
      rationaleTitle: "Always-on location",
      rationaleBody: "Live job tracking needs background location so customers can see the provider on the way, even when the app is in the background.",
    });
    if (r !== "granted") return r;
  }
  const result = await Location.requestBackgroundPermissionsAsync();
  if (result.status === "granted") return "granted";
  if (result.canAskAgain === false) {
    showBlockedAlert(
      "Always-on location",
      "Please set Location to 'Always allow' in your device Settings to keep the customer updated during a job.",
    );
    return "blocked";
  }
  return "denied";
}

/**
 * Request microphone access for in-app voice calls.
 * Must be called BEFORE placing or accepting a call so the OS popup appears
 * at the right moment (not mid-call when the user is already in the call screen).
 */
export async function ensureMicrophonePermission(opts?: {
  rationaleTitle?: string;
  rationaleBody?: string;
}): Promise<PermissionResult> {
  if (Platform.OS === "web" || isExpoGoRuntime()) return "denied";

  const title = opts?.rationaleTitle || "Microphone required";
  const body = opts?.rationaleBody || "Athoo needs microphone access to make voice calls with providers and customers.";

  try {
    const { Audio } = await import("expo-av");
    const { granted, canAskAgain } = await Audio.requestPermissionsAsync();

    if (granted) return "granted";

    if (canAskAgain === false) {
      showBlockedAlert(title, body);
      return "blocked";
    }

    Alert.alert(title, body, [{ text: "OK" }]);
    return "denied";
  } catch {
    return "denied";
  }
}

/**
 * Request camera access. Shows a branded prompt if permanently denied.
 */
export async function ensureCameraPermission(opts?: {
  rationaleTitle?: string;
  rationaleBody?: string;
}): Promise<PermissionResult> {
  // Camera and media picker work in Expo Go and development builds.
  // Do not block them behind the Expo Go guard; only remote push/background services need that guard.
  if (Platform.OS === "web") return "denied";

  const title = opts?.rationaleTitle || "Camera required";
  const body = opts?.rationaleBody || "Athoo needs camera access so you can take photos for bookings, documents, and support tickets.";

  try {
    const { ImagePicker } = await import("expo-image-picker").then((m) => ({ ImagePicker: m }));
    const existing = await (ImagePicker as any).getCameraPermissionsAsync?.();
    if (existing?.status === "granted") return "granted";

    const { status, canAskAgain } = await (ImagePicker as any).requestCameraPermissionsAsync();

    if (status === "granted") return "granted";

    if (canAskAgain === false) {
      showBlockedAlert(title, body);
      return "blocked";
    }

    Alert.alert(title, body, [{ text: "OK" }]);
    return "denied";
  } catch {
    return "denied";
  }
}

/**
 * Request photo library access. Shows a branded prompt if permanently denied.
 */
export async function ensurePhotoLibraryPermission(opts?: {
  rationaleTitle?: string;
  rationaleBody?: string;
}): Promise<PermissionResult> {
  // Gallery/media library access works in Expo Go. Keep this available for testing and production builds.
  if (Platform.OS === "web") return "denied";

  const title = opts?.rationaleTitle || "Photo library access required";
  const body = opts?.rationaleBody || "Athoo needs access to your photo library to upload profile photos, booking documents, and support media.";

  try {
    const { ImagePicker } = await import("expo-image-picker").then((m) => ({ ImagePicker: m }));
    const existing = await (ImagePicker as any).getMediaLibraryPermissionsAsync?.();
    if (existing?.status === "granted" || existing?.status === "limited") return "granted";

    const { status, canAskAgain } = await (ImagePicker as any).requestMediaLibraryPermissionsAsync();

    if (status === "granted" || status === "limited") return "granted";

    if (canAskAgain === false) {
      showBlockedAlert(title, body);
      return "blocked";
    }

    Alert.alert(title, body, [{ text: "OK" }]);
    return "denied";
  } catch {
    return "denied";
  }
}

/**
 * Request push notification permissions (iOS gate + Android 13+ gate).
 * Safe to call multiple times — returns "granted" immediately if already approved.
 * Shows a "go to Settings" alert if the user permanently denied.
 */
export async function ensurePushNotifications(): Promise<PermissionResult> {
  if (Platform.OS === "web" || isExpoGoRuntime()) return "denied";

  try {
    const Notifications = await import("expo-notifications");

    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return "granted";

    const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
    if (status === "granted") return "granted";

    if (canAskAgain === false) {
      showBlockedAlert(
        "Notifications",
        "Enable notifications to receive job alerts, booking updates, and chat messages.",
      );
      return "blocked";
    }

    return "denied";
  } catch {
    return "denied";
  }
}

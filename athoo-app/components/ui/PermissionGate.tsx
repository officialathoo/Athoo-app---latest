import React from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

/**
 * Pre-prompt UI shown BEFORE the OS permission dialog. Apple/Google guidance:
 * explain why the permission is needed first so the OS prompt has context.
 *
 * The caller controls when to show it (e.g. before the first call to
 * `Location.requestForegroundPermissionsAsync()` or `Camera.requestCameraPermissionsAsync()`).
 *
 * When the OS permission is permanently denied, render this same component with
 * `denied` to surface "Open Settings".
 */
export type PermissionKind =
  | "location"
  | "background-location"
  | "notifications"
  | "camera"
  | "microphone"
  | "photos"
  | "gps-disabled";

const COPY: Record<PermissionKind, { icon: keyof typeof Feather.glyphMap; title: string; body: string; cta: string }> = {
  location: {
    icon: "map-pin",
    title: "Location access",
    body: "ATHOO needs your location to find nearby providers and route them to your address.",
    cta: "Allow location",
  },
  "background-location": {
    icon: "navigation",
    title: "Always-on location",
    body: "Live job tracking needs background location so customers can see the provider on the way, even when the app is in the background.",
    cta: "Enable always-on",
  },
  notifications: {
    icon: "bell",
    title: "Stay in the loop",
    body: "Notifications let you know when your booking is accepted, when a provider is on the way, and when chat messages arrive.",
    cta: "Allow notifications",
  },
  camera: {
    icon: "camera",
    title: "Camera access",
    body: "Used to take live selfies for verification, capture proof photos at job sites, and send photos in chat.",
    cta: "Allow camera",
  },
  microphone: {
    icon: "mic",
    title: "Microphone access",
    body: "Required for in-app voice and video calls between you and the provider.",
    cta: "Allow microphone",
  },
  photos: {
    icon: "image",
    title: "Photo library access",
    body: "Used to upload your CNIC, profile photo, and evidence images for refund or complaint requests.",
    cta: "Allow photos",
  },
  "gps-disabled": {
    icon: "alert-triangle",
    title: "GPS is turned off",
    body: "Please turn on Location/GPS in your device settings so we can find your address.",
    cta: "Open Settings",
  },
};

interface Props {
  kind: PermissionKind;
  /** True after the OS dialog returned "denied" (especially "never ask again"). */
  denied?: boolean;
  onAllow?: () => void;
  onDismiss?: () => void;
}

/** Opens the app-specific OS settings page so the user can flip the toggle. */
export function openAppSettings(): Promise<void> {
  if (Platform.OS === "ios") {
    return Linking.openURL("app-settings:");
  }
  return Linking.openSettings();
}

export function PermissionGate({ kind, denied, onAllow, onDismiss }: Props) {
  const copy = COPY[kind];
  const isDenied = denied || kind === "gps-disabled";

  return (
    <View style={styles.card}>
      <View style={styles.iconBox}>
        <Feather name={copy.icon} size={24} color={Colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{isDenied ? `${copy.body}\n\nIt looks like access was denied. You can enable it in your device Settings.` : copy.body}</Text>
        <View style={styles.row}>
          <Pressable
            onPress={isDenied ? () => openAppSettings().catch(() => {}) : onAllow}
            style={styles.allowBtn}
            accessibilityRole="button"
          >
            <Text style={styles.allowBtnText}>{isDenied ? "Open Settings" : copy.cta}</Text>
          </Pressable>
          {onDismiss ? (
            <Pressable onPress={onDismiss} style={styles.dismissBtn} accessibilityRole="button">
              <Text style={styles.dismissBtnText}>Not now</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
    borderRadius: 16,
    padding: 16,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 15, fontWeight: "800", color: Colors.text },
  body: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  row: { flexDirection: "row", gap: 8, marginTop: 10 },
  allowBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 11,
  },
  allowBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  dismissBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dismissBtnText: { color: Colors.textSecondary, fontSize: 13, fontWeight: "600" },
});

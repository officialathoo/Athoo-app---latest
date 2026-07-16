import React, { useMemo } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";

export type PermissionKind =
  | "location"
  | "background-location"
  | "notifications"
  | "camera"
  | "microphone"
  | "photos"
  | "gps-disabled";

const COPY: Record<PermissionKind, { icon: keyof typeof Feather.glyphMap; title: string; body: string; cta: string }> = {
  location: { icon: "map-pin", title: "Location access", body: "Athoo needs your location to find nearby providers and route them to your address.", cta: "Allow location" },
  "background-location": { icon: "navigation", title: "Always-on location", body: "Live job tracking needs background location so customers can see the provider on the way while the app is in the background.", cta: "Enable always-on" },
  notifications: { icon: "bell", title: "Stay in the loop", body: "Notifications tell you when bookings change, providers are on the way, and messages arrive.", cta: "Allow notifications" },
  camera: { icon: "camera", title: "Camera access", body: "Used for verification, job evidence, profile photos, documents, and chat media.", cta: "Allow camera" },
  microphone: { icon: "mic", title: "Microphone access", body: "Required for secure in-app voice and video calls.", cta: "Allow microphone" },
  photos: { icon: "image", title: "Photo library access", body: "Used to upload profile photos, documents, booking media, and support evidence.", cta: "Allow photos" },
  "gps-disabled": { icon: "alert-triangle", title: "GPS is turned off", body: "Turn on Location/GPS in device settings so Athoo can find your address.", cta: "Open Settings" },
};

interface Props {
  kind: PermissionKind;
  denied?: boolean;
  onAllow?: () => void;
  onDismiss?: () => void;
}

export function openAppSettings(): Promise<void> {
  if (Platform.OS === "ios") return Linking.openURL("app-settings:");
  return Linking.openSettings();
}

export function PermissionGate({ kind, denied, onAllow, onDismiss }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const copy = COPY[kind];
  const isDenied = denied || kind === "gps-disabled";

  return (
    <View style={styles.card}>
      <View style={styles.iconBox}>
        <Feather name={copy.icon} size={24} color={theme.colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>
          {isDenied ? `${copy.body}\n\nAccess is currently disabled. You can enable it in device Settings.` : copy.body}
        </Text>
        <View style={styles.row}>
          <Pressable
            onPress={isDenied ? () => void openAppSettings().catch(() => undefined) : onAllow}
            style={({ pressed }) => [styles.allowButton, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.allowButtonText}>{isDenied ? "Open Settings" : copy.cta}</Text>
          </Pressable>
          {onDismiss ? (
            <Pressable
              onPress={onDismiss}
              style={({ pressed }) => [styles.dismissButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.dismissButtonText}>Not now</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      gap: 14,
      backgroundColor: theme.colors.elevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      padding: 16,
    },
    iconBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: theme.colors.infoSoft, alignItems: "center", justifyContent: "center" },
    copy: { flex: 1, gap: 4 },
    title: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
    body: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 19 },
    row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    allowButton: { backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 11 },
    allowButtonText: { color: theme.colors.white, fontSize: 13, fontWeight: "700" },
    dismissButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
    dismissButtonText: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: "600" },
    pressed: { opacity: 0.76 },
  });
}

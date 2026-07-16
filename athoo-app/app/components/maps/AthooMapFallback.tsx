import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";

type AthooMapFallbackProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

/** Backward-compatible empty/error map state for legacy route imports. */
export function AthooMapFallback({
  title = "Map unavailable",
  message = "You can continue by entering the address manually. Athoo will retry the map when connectivity returns.",
  onRetry,
}: AthooMapFallbackProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container} accessibilityRole="summary">
      <View style={styles.iconWrap}>
        <Icon name="map-pin" size={26} color={theme.colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]} onPress={onRetry}>
          <Icon name="refresh-cw" size={16} color={theme.colors.white} />
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default AthooMapFallback;

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    container: {
      minHeight: 220,
      borderRadius: 18,
      backgroundColor: theme.colors.elevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    iconWrap: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.infoSoft, marginBottom: 14 },
    title: { fontSize: 17, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
    message: { maxWidth: 340, fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary, textAlign: "center", marginTop: 7 },
    retryButton: { marginTop: 16, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18, borderRadius: 12, backgroundColor: theme.colors.primary },
    retryText: { color: theme.colors.white, fontSize: 14, fontWeight: "700" },
    pressed: { opacity: 0.75 },
  });
}

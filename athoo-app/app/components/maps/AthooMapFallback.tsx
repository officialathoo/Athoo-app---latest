import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { Colors } from "@/constants/colors";

type AthooMapFallbackProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

export function AthooMapFallback({
  title = "Map unavailable",
  message = "You can continue by entering the address manually. Athoo will retry the map when connectivity returns.",
  onRetry,
}: AthooMapFallbackProps) {
  return (
    <View style={styles.container} accessibilityRole="summary">
      <View style={styles.iconWrap}>
        <Icon name="map-pin" size={26} color={Colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]} onPress={onRetry}>
          <Icon name="refresh-cw" size={16} color="#FFFFFF" />
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default AthooMapFallback;

const styles = StyleSheet.create({
  container: {
    minHeight: 220,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${Colors.primary}12`,
    marginBottom: 14,
  },
  title: { fontSize: 17, fontWeight: "800", color: Colors.text, textAlign: "center" },
  message: { maxWidth: 340, fontSize: 13, lineHeight: 20, color: Colors.textSecondary, textAlign: "center", marginTop: 7 },
  retryButton: {
    marginTop: 16,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  retryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.75 },
});

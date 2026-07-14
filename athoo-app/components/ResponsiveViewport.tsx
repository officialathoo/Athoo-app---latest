import React, { PropsWithChildren } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";

/**
 * Keeps the phone experience edge-to-edge while preventing stretched,
 * unprofessional layouts on wide web and desktop-sized preview surfaces.
 */
export function ResponsiveViewport({ children }: PropsWithChildren) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const constrainWideSurface = Platform.OS === "web" && width > 1280;

  return (
    <View style={[styles.shell, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.viewport,
          constrainWideSurface && {
            maxWidth: 1280,
            borderLeftColor: theme.colors.border,
            borderRightColor: theme.colors.border,
            borderLeftWidth: StyleSheet.hairlineWidth,
            borderRightWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, width: "100%", alignItems: "center" },
  viewport: { flex: 1, width: "100%" },
});

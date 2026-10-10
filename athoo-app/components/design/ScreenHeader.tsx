import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/Icon";
import { AppText } from "./AppText";
import { useTheme } from "@/context/ThemeContext";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  accessibilityLabel?: string;
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  accessibilityLabel,
}: ScreenHeaderProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View
      style={[
        styles.shell,
        {
          paddingTop: topPadding + theme.spacing.sm,
          paddingBottom: theme.spacing.sm,
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.divider,
        },
      ]}
    >
      <View style={styles.inner}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel || "Go back"}
          hitSlop={8}
          onPress={onBack || (() => router.back())}
          style={({ pressed }) => [
            styles.back,
            {
              backgroundColor: pressed ? theme.colors.infoSoft : theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Icon name="arrow-left" size={19} color={theme.colors.text} strokeWidth={2.2} />
        </Pressable>

        <View style={styles.copy}>
          <AppText variant="h3" numberOfLines={1}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
        </View>

        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );
}

export const responsiveContent = {
  width: "100%" as const,
  maxWidth: 760,
  alignSelf: "center" as const,
};

const styles = StyleSheet.create({
  shell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  inner: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  back: {
    width: 44, height: 44,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  right: {
    minWidth: 42,
    minHeight: 42,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
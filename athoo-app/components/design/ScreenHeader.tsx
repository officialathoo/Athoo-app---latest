import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/Icon";
import { AppText } from "./AppText";
import { useTheme } from "@/context/ThemeContext";
import { redesign } from "@/design/redesign";
import { radius } from "@/design/tokens";

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
  maxWidth: redesign.layout.maxContentWidth,
  alignSelf: "center" as const,
};

const styles = StyleSheet.create({
  shell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: redesign.layout.compactHorizontalPadding,
  },
  inner: {
    width: "100%",
    maxWidth: redesign.layout.maxContentWidth,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  back: {
    width: redesign.control.iconButtonSize,
    height: redesign.control.iconButtonSize,
    borderRadius: radius.sm,
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
    minWidth: redesign.control.iconButtonSize,
    minHeight: redesign.control.iconButtonSize,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
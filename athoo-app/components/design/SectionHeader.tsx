import React from "react";
import { Pressable, StyleProp, View, ViewStyle } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/context/ThemeContext";
import { AppText } from "./AppText";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction, style }: SectionHeaderProps) {
  const { theme } = useTheme();

  return (
    <View style={[{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: theme.spacing.lg }, style]}>
      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        <AppText variant="h3">{title}</AppText>
        {subtitle ? <AppText variant="caption" tone="secondary">{subtitle}</AppText> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.xs,
            opacity: pressed ? 0.65 : 1,
            paddingVertical: theme.spacing.xs,
          })}
        >
          <AppText variant="label" style={{ color: theme.colors.primary }}>{actionLabel}</AppText>
          <Icon name="chevron-right" size={15} color={theme.colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

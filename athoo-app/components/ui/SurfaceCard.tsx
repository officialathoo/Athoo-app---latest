import React, { type ReactNode } from "react";
import { Pressable, type StyleProp, View, type ViewStyle } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { redesign } from "@/design/redesign";

type SurfaceCardProps = {
  children: ReactNode;
  onPress?: () => void;
  elevated?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function SurfaceCard({
  children,
  onPress,
  elevated = false,
  padding = "md",
  style,
  accessibilityLabel,
}: SurfaceCardProps) {
  const { theme } = useTheme();
  const paddingValue = {
    none: 0,
    sm: theme.spacing.md,
    md: theme.spacing.lg,
    lg: theme.spacing.xl,
  }[padding];

  const baseStyle: StyleProp<ViewStyle> = [
    {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
      padding: paddingValue,
    },
    elevated ? theme.shadows.sm : undefined,
    style,
  ];

  if (!onPress) return <View style={baseStyle}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        baseStyle,
        pressed ? { opacity: 0.92, transform: [{ scale: redesign.visual.pressedScale }] } : undefined,
      ]}
    >
      {children}
    </Pressable>
  );
}
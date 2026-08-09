import React from "react";
import { Pressable, StyleProp, View, ViewStyle } from "react-native";
import { useTheme } from "@/context/ThemeContext";

interface AppCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  padding?: "none" | "sm" | "md" | "lg";
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function AppCard({
  children,
  onPress,
  padding = "md",
  elevated = false,
  style,
  testID,
}: AppCardProps) {
  const { theme } = useTheme();

  const resolvedPadding =
    padding === "none"
      ? 0
      : padding === "sm"
        ? theme.spacing.sm
        : padding === "md"
          ? theme.spacing.lg
          : theme.spacing.xl;

  const cardStyle: StyleProp<ViewStyle> = [
    {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      padding: resolvedPadding,
    },
    elevated && theme.shadows.sm,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          cardStyle,
          pressed && {
            opacity: 0.96,
            transform: [{ scale: 0.997 }],
            backgroundColor: theme.colors.surfaceAlt,
          },
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={cardStyle}>
      {children}
    </View>
  );
}
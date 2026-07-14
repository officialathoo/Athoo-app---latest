import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleProp,
  Text,
  ViewStyle,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useOptionalLang } from "@/context/LanguageContext";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  style,
  fullWidth = false,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const { theme } = useTheme();
  const language = useOptionalLang();
  const isInactive = disabled || loading;

  const handlePress = () => {
    if (isInactive) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress();
  };

  const backgroundColor = {
    primary: theme.colors.primary,
    secondary: theme.colors.secondary,
    outline: "transparent",
    ghost: theme.colors.surfaceAlt,
    danger: theme.colors.danger,
  }[variant];

  const foregroundColor =
    variant === "outline" || variant === "ghost" ? theme.colors.primary : theme.colors.white;

  const padding = {
    sm: { paddingHorizontal: theme.spacing.lg, minHeight: 38 },
    md: { paddingHorizontal: theme.spacing.xl, minHeight: 48 },
    lg: { paddingHorizontal: theme.spacing.xl, minHeight: 56 },
  }[size];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      onPress={handlePress}
      disabled={isInactive}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: theme.radius.md,
          gap: theme.spacing.sm,
          backgroundColor,
          borderWidth: variant === "outline" ? 1.5 : 0,
          borderColor: theme.colors.primary,
          width: fullWidth ? "100%" : undefined,
          opacity: isInactive ? 0.5 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed && !isInactive ? 0.985 : 1 }],
          ...padding,
        },
        variant === "primary" && theme.shadows.sm,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foregroundColor} size="small" />
      ) : (
        <Text
          style={{
            color: foregroundColor,
            fontFamily: theme.typography.label.fontFamily,
            fontSize: size === "sm" ? theme.typography.caption.fontSize : size === "lg" ? theme.typography.bodyLg.fontSize : 15,
            lineHeight: size === "sm" ? theme.typography.caption.lineHeight : theme.typography.bodyStrong.lineHeight,
            writingDirection: language?.writingDirection ?? "ltr",
            textAlign: "center",
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

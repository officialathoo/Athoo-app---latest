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
import { redesign } from "@/design/redesign";

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

  const metrics = {
    sm: {
      paddingHorizontal: theme.spacing.lg,
      minHeight: redesign.control.compactHeight,
      typography: theme.typography.caption,
    },
    md: {
      paddingHorizontal: theme.spacing.xl,
      minHeight: redesign.control.standardHeight,
      typography: theme.typography.label,
    },
    lg: {
      paddingHorizontal: theme.spacing.xl,
      minHeight: redesign.control.largeHeight,
      typography: theme.typography.bodyStrong,
    },
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
          borderWidth: variant === "outline" ? redesign.visual.focusedBorderWidth : 0,
          borderColor: theme.colors.primary,
          width: fullWidth ? "100%" : undefined,
          opacity: isInactive ? redesign.visual.disabledOpacity : pressed ? 0.88 : 1,
          transform: [{ scale: pressed && !isInactive ? redesign.visual.pressedScale : 1 }],
          paddingHorizontal: metrics.paddingHorizontal,
          minHeight: metrics.minHeight,
        },
        variant === "primary" && theme.shadows.sm,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foregroundColor} size="small" />
      ) : (
        <Text
          numberOfLines={2}
          ellipsizeMode="tail"
          style={{
            color: foregroundColor,
            ...metrics.typography,
            fontFamily: size === "sm" ? theme.typography.label.fontFamily : metrics.typography.fontFamily,
            writingDirection: language?.writingDirection ?? "ltr",
            textAlign: "center",
            flexShrink: 1,
            maxWidth: "100%",
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

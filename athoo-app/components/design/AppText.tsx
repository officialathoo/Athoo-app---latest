import React from "react";
import { Text, TextProps, TextStyle } from "react-native";
import { useTheme } from "@/context/ThemeContext";

export type AppTextVariant = "display" | "h1" | "h2" | "h3" | "bodyLg" | "body" | "bodyStrong" | "label" | "caption";

interface AppTextProps extends TextProps {
  variant?: AppTextVariant;
  tone?: "primary" | "secondary" | "muted" | "danger" | "success" | "inverse";
  align?: TextStyle["textAlign"];
}

export function AppText({ variant = "body", tone = "primary", align, style, ...props }: AppTextProps) {
  const { theme } = useTheme();
  const toneColor = {
    primary: theme.colors.text,
    secondary: theme.colors.textSecondary,
    muted: theme.colors.textMuted,
    danger: theme.colors.danger,
    success: theme.colors.success,
    inverse: theme.colors.white,
  }[tone];

  return (
    <Text
      {...props}
      style={[theme.typography[variant], { color: toneColor, textAlign: align }, style]}
    />
  );
}

import { useTheme } from "@/context/ThemeContext";

/**
 * Backward-compatible color adapter for legacy screens.
 * New code should prefer `useTheme()`, but existing consumers can migrate
 * incrementally without remaining locked to the light palette.
 */
export function useColors() {
  const { theme } = useTheme();

  return {
    primary: theme.colors.primary,
    primaryDark: theme.colors.primaryPressed,
    gradientStart: theme.colors.primary,
    gradientEnd: theme.colors.primaryPressed,
    secondary: theme.colors.secondary,
    background: theme.colors.background,
    surface: theme.colors.surfaceAlt,
    card: theme.colors.surface,
    white: theme.colors.white,
    text: theme.colors.text,
    textSecondary: theme.colors.textSecondary,
    textMuted: theme.colors.textMuted,
    success: theme.colors.success,
    error: theme.colors.danger,
    warning: theme.colors.warning,
    accent: theme.colors.accent,
    border: theme.colors.border,
    shadow: "#000000",
  } as const;
}

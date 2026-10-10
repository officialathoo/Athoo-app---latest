import type { AthooTheme } from "@/design/theme";

export const createAuthPalette = (theme: AthooTheme) => ({
  background: theme.colors.background,
  backgroundDeep: theme.colors.surfaceAlt,
  panel: theme.colors.surface,
  panelRaised: theme.colors.elevated,
  border: theme.colors.border,
  borderStrong: theme.colors.border,
  text: theme.colors.text,
  muted: theme.colors.textSecondary,
  subtle: theme.colors.textMuted,
  cyan: theme.colors.primary,
  cyanSoft: theme.colors.infoSoft,
  cyanGlow: theme.dark ? "rgba(96,165,250,0.20)" : "rgba(37,99,235,0.12)",
  orange: theme.colors.secondary,
  orangeSoft: theme.colors.premiumSoft,
  success: theme.colors.success,
  danger: theme.colors.danger,

  heroInk: "#07101F",
  heroNavy: "#0B2A59",
  heroBlue: "#0C4EA6",
  heroSky: "#4EA1FF",
  heroAmber: "#FF9A45",
  emberInk: "#17100A",
  emberDeep: "#5B2A09",
  ember: "#A94708",
});

export type AuthPalette = ReturnType<typeof createAuthPalette>;

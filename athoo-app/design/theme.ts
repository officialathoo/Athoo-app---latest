import { brandConfig } from "@/config/brand";
import { iconSize, motion, radius, shadows, spacing, typography } from "./tokens";

export type ThemeMode = "light" | "dark";

const brand = {
  primary: brandConfig.colors.primary,
  primaryPressed: brandConfig.colors.primaryPressed,
  secondary: brandConfig.colors.secondary,
  secondaryPressed: brandConfig.colors.secondaryPressed,
  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",
  info: "#2563EB",
  accent: "#7C3AED",
  premium: "#D97706",
  white: "#FFFFFF",
  onBrand: "#FFFFFF",
  onDanger: "#FFFFFF",
  onSuccess: "#FFFFFF",
  onLight: "#0F172A",
} as const;

const lightColors = {
  ...brand,
  background: "#F6F8FC",
  surface: "#FFFFFF",
  surfaceAlt: "#EEF3FA",
  elevated: "#FFFFFF",
  text: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  border: "#DCE4EF",
  divider: "#E7EDF5",
  overlay: "rgba(15, 23, 42, 0.52)",
  input: "#FFFFFF",
  focusRing: "rgba(26, 110, 224, 0.18)",
  shadow: "rgba(15, 23, 42, 0.18)",
  neutralSoft: "#F1F5F9",
  accentSoft: "#F3E8FF",
  premiumSoft: "#FFF7ED",
  successSoft: "#DCFCE7",
  warningSoft: "#FEF3C7",
  dangerSoft: "#FEE2E2",
  infoSoft: "#DBEAFE",
} as const;

const darkColors = {
  ...brand,
  primary: brandConfig.colors.primaryDark,
  primaryPressed: brandConfig.colors.primaryPressedDark,
  secondary: brandConfig.colors.secondaryDark,
  secondaryPressed: brandConfig.colors.secondaryPressedDark,
  background: "#08111F",
  surface: "#0F1B2D",
  surfaceAlt: "#16243A",
  elevated: "#17263C",
  text: "#F8FAFC",
  textSecondary: "#CBD5E1",
  textMuted: "#8492A6",
  border: "#263852",
  divider: "#21324A",
  overlay: "rgba(2, 6, 23, 0.72)",
  input: "#101D30",
  focusRing: "rgba(96, 165, 250, 0.24)",
  shadow: "rgba(0, 0, 0, 0.55)",
  neutralSoft: "#1E293B",
  accentSoft: "#2F1B4E",
  premiumSoft: "#4A2D14",
  successSoft: "#123D2A",
  warningSoft: "#493211",
  dangerSoft: "#4A1F24",
  infoSoft: "#152F52",
} as const;

export type AthooTheme = {
  mode: ThemeMode;
  dark: boolean;
  colors: typeof lightColors | typeof darkColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadows: typeof shadows;
  motion: typeof motion;
  iconSize: typeof iconSize;
};

export const lightTheme: AthooTheme = {
  mode: "light",
  dark: false,
  colors: lightColors,
  spacing,
  radius,
  typography,
  shadows,
  motion,
  iconSize,
};

export const darkTheme: AthooTheme = {
  mode: "dark",
  dark: true,
  colors: darkColors,
  spacing,
  radius,
  typography,
  shadows,
  motion,
  iconSize,
};

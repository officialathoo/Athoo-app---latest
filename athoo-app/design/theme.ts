import { iconSize, motion, radius, shadows, spacing, typography } from "./tokens";

export type ThemeMode = "light" | "dark";

const brand = {
  primary: "#1A6EE0",
  primaryPressed: "#1558B4",
  secondary: "#F97316",
  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",
  info: "#2563EB",
  accent: "#7C3AED",
  white: "#FFFFFF",
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
  successSoft: "#DCFCE7",
  warningSoft: "#FEF3C7",
  dangerSoft: "#FEE2E2",
  infoSoft: "#DBEAFE",
} as const;

const darkColors = {
  ...brand,
  primary: "#60A5FA",
  primaryPressed: "#3B82F6",
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

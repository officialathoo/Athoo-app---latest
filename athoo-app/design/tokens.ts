export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 39, fontFamily: "Inter_700Bold" },
  h1: { fontSize: 26, lineHeight: 32, fontFamily: "Inter_700Bold" },
  h2: { fontSize: 22, lineHeight: 28, fontFamily: "Inter_700Bold" },
  h3: { fontSize: 18, lineHeight: 24, fontFamily: "Inter_600SemiBold" },
  bodyLg: { fontSize: 16, lineHeight: 24, fontFamily: "Inter_400Regular" },
  body: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular" },
  bodyStrong: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_600SemiBold" },
  label: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_600SemiBold" },
  caption: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
} as const;

export const iconSize = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export const motion = {
  fast: 140,
  normal: 220,
  slow: 360,
} as const;

export const shadows = {
  sm: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  lg: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 12,
  },
} as const;

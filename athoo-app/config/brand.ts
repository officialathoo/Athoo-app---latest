import Constants from "expo-constants";
import type { ImageSourcePropType } from "react-native";

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function asHexColor(value: unknown, fallback: string): string {
  const normalized = asOptionalString(value);
  return normalized && /^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized.toUpperCase() : fallback;
}

const extra = (Constants.expoConfig?.extra || {}) as Record<string, unknown>;

/**
 * Public, non-secret brand configuration used by the mobile UI.
 *
 * Visual identity defaults live in one place so future rebranding does not
 * require editing feature screens. Asset references remain static because
 * Metro must discover them at build time; changing an asset only requires
 * updating this mapping and the native app config.
 */
export const brandConfig = Object.freeze({
  displayName: asOptionalString(process.env.EXPO_PUBLIC_BRAND_DISPLAY_NAME)
    || asOptionalString(extra.BRAND_DISPLAY_NAME)
    || "Athoo",
  descriptor: asOptionalString(process.env.EXPO_PUBLIC_BRAND_DESCRIPTOR)
    || asOptionalString(extra.BRAND_DESCRIPTOR)
    || "Home Services",
  colors: Object.freeze({
    primary: asHexColor(
      process.env.EXPO_PUBLIC_BRAND_PRIMARY_COLOR || extra.BRAND_PRIMARY_COLOR,
      "#1A6EE0",
    ),
    primaryPressed: asHexColor(
      process.env.EXPO_PUBLIC_BRAND_PRIMARY_PRESSED_COLOR || extra.BRAND_PRIMARY_PRESSED_COLOR,
      "#1558B4",
    ),
    primaryDark: asHexColor(
      process.env.EXPO_PUBLIC_BRAND_PRIMARY_DARK_COLOR || extra.BRAND_PRIMARY_DARK_COLOR,
      "#60A5FA",
    ),
    primaryPressedDark: asHexColor(
      process.env.EXPO_PUBLIC_BRAND_PRIMARY_PRESSED_DARK_COLOR || extra.BRAND_PRIMARY_PRESSED_DARK_COLOR,
      "#3B82F6",
    ),
    secondary: asHexColor(
      process.env.EXPO_PUBLIC_BRAND_SECONDARY_COLOR || extra.BRAND_SECONDARY_COLOR,
      "#F97316",
    ),
    secondaryPressed: asHexColor(
      process.env.EXPO_PUBLIC_BRAND_SECONDARY_PRESSED_COLOR || extra.BRAND_SECONDARY_PRESSED_COLOR,
      "#C4510B",
    ),
    secondaryDark: asHexColor(
      process.env.EXPO_PUBLIC_BRAND_SECONDARY_DARK_COLOR || extra.BRAND_SECONDARY_DARK_COLOR,
      "#F97316",
    ),
    secondaryPressedDark: asHexColor(
      process.env.EXPO_PUBLIC_BRAND_SECONDARY_PRESSED_DARK_COLOR || extra.BRAND_SECONDARY_PRESSED_DARK_COLOR,
      "#EA580C",
    ),
  }),
  assets: Object.freeze({
    mark: require("../assets/images/app-icon-approved.png") as ImageSourcePropType,
  }),
});

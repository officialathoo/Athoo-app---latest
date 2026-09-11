import Constants from "expo-constants";

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

const extra = (Constants.expoConfig?.extra || {}) as Record<string, unknown>;
const releaseIdentity =
  extra.RELEASE_IDENTITY &&
  typeof extra.RELEASE_IDENTITY === "object" &&
  !Array.isArray(extra.RELEASE_IDENTITY)
    ? extra.RELEASE_IDENTITY as Record<string, unknown>
    : {};

export const appIdentity = Object.freeze({
  version:
    optionalString(process.env.EXPO_PUBLIC_RELEASE_VERSION)
    || optionalString(releaseIdentity.version)
    || optionalString(Constants.expoConfig?.version)
    || "2.2.0",
});

import Constants from "expo-constants";

/**
 * Expo Go is the store client runtime. Development clients and internal EAS
 * builds are real native apps and must not be treated as Expo Go merely
 * because a development flag is enabled or appOwnership is unavailable.
 */
export function isExpoGoRuntime(): boolean {
  const runtime = Constants as any;
  const owner = String(runtime?.appOwnership || "").trim().toLowerCase();
  const executionEnvironment = String(runtime?.executionEnvironment || "")
    .trim()
    .toLowerCase();

  return (
    owner === "expo" ||
    owner === "guest" ||
    executionEnvironment === "storeclient" ||
    executionEnvironment.includes("storeclient")
  );
}

import type { Href, Router } from "expo-router";
import { Linking } from "react-native";

export function normalizeSafeActionLink(value: unknown): { kind: "internal" | "external"; value: string } | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 500 || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  if (raw.startsWith("/")) {
    if (raw.startsWith("//") || !/^\/[A-Za-z0-9_()\-./?=&%:]*$/.test(raw)) return null;
    return { kind: "internal", value: raw };
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) return null;
    return { kind: "external", value: parsed.toString() };
  } catch {
    return null;
  }
}

export async function openSafeActionLink(router: Router, value: unknown): Promise<boolean> {
  const safe = normalizeSafeActionLink(value);
  if (!safe) return false;
  if (safe.kind === "internal") {
    router.push(safe.value as Href);
    return true;
  }
  const supported = await Linking.canOpenURL(safe.value).catch(() => false);
  if (!supported) return false;
  await Linking.openURL(safe.value);
  return true;
}

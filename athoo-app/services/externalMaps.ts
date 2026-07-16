import { Linking, Platform } from "react-native";
import { runtimeConfig } from "@/config/runtime";

export interface ExternalMapLocation {
  latitude: number;
  longitude: number;
  label?: string;
}

function fillTemplate(template: string, location: ExternalMapLocation): string {
  const label = encodeURIComponent(location.label || `${location.latitude},${location.longitude}`);
  return template
    .replaceAll("{lat}", String(location.latitude))
    .replaceAll("{lng}", String(location.longitude))
    .replaceAll("{label}", label);
}

function configuredTemplate(): string | undefined {
  if (Platform.OS === "android") return runtimeConfig.maps.externalAndroidUrlTemplate;
  if (Platform.OS === "ios") return runtimeConfig.maps.externalIosUrlTemplate;
  return runtimeConfig.maps.externalWebUrlTemplate;
}

function configuredSearchTemplate(): string | undefined {
  if (Platform.OS === "android") return runtimeConfig.maps.externalAndroidSearchUrlTemplate;
  if (Platform.OS === "ios") return runtimeConfig.maps.externalIosSearchUrlTemplate;
  return runtimeConfig.maps.externalWebSearchUrlTemplate;
}

/**
 * Opens the selected coordinates using a deployment-configured external map
 * destination. Feature screens never depend on a specific map vendor.
 */
export async function openExternalMap(location: ExternalMapLocation): Promise<boolean> {
  const template = configuredTemplate();
  if (!template) return false;

  const url = fillTemplate(template, location);
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Opens a text-only address using the deployment-configured map destination. */
export async function openExternalMapSearch(query: string): Promise<boolean> {
  const template = configuredSearchTemplate();
  const normalized = query.trim();
  if (!template || !normalized) return false;
  const url = template.replaceAll("{query}", encodeURIComponent(normalized));
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

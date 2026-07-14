import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const SECURE_PREFIX = "athoo.secure.";

async function loadSecureStore() {
  if (Platform.OS === "web") return null;
  try {
    return await import("expo-secure-store");
  } catch {
    return null;
  }
}

export async function getSecureItem(key: string): Promise<string | null> {
  const secure = await loadSecureStore();
  if (secure) {
    const value = await secure.getItemAsync(`${SECURE_PREFIX}${key}`);
    if (value) return value;

    // One-time migration from older AsyncStorage releases.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy) {
      await secure.setItemAsync(`${SECURE_PREFIX}${key}`, legacy, {
        keychainAccessible: secure.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      await AsyncStorage.removeItem(key);
      return legacy;
    }
    return null;
  }

  return AsyncStorage.getItem(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  const secure = await loadSecureStore();
  if (secure) {
    await secure.setItemAsync(`${SECURE_PREFIX}${key}`, value, {
      keychainAccessible: secure.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    await AsyncStorage.removeItem(key).catch(() => {});
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function removeSecureItem(key: string): Promise<void> {
  const secure = await loadSecureStore();
  if (secure) {
    await secure.deleteItemAsync(`${SECURE_PREFIX}${key}`).catch(() => {});
  }
  await AsyncStorage.removeItem(key).catch(() => {});
}

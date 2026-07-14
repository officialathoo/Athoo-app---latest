import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

const BIOMETRIC_KEY = "athoo_biometric_enabled";
const BIOMETRIC_PHONE_KEY = "athoo_biometric_phone";
const BIOMETRIC_ROLE_KEY = "athoo_biometric_role";

export type BiometricType = "face" | "fingerprint" | "iris" | "none";

export interface BiometricResult {
  success: boolean;
  error?: string;
}

/**
 * Returns the REAL biometric sensor type available on this device.
 * Only Face ID / Touch ID / Fingerprint / Iris count — a device PIN/passcode
 * does NOT count as biometric.
 */
export async function getBiometricType(): Promise<BiometricType> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) return "none";
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "fingerprint";
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return "iris";
    return "none";
  } catch {
    return "none";
  }
}

/**
 * Returns true ONLY if the device has REAL biometric hardware that is enrolled
 * (Face ID / Touch ID / Fingerprint / Iris). A device that only has a PIN /
 * pattern / passcode set up is NOT considered biometric-capable.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return false;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    return (
      types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ||
      types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT) ||
      types.includes(LocalAuthentication.AuthenticationType.IRIS)
    );
  } catch {
    return false;
  }
}

/**
 * Returns a user-friendly label for the real biometric sensor:
 *   - "Face ID"     (iOS + Face recognition)
 *   - "Touch ID"    (iOS + Fingerprint)
 *   - "Fingerprint" (Android + Fingerprint)
 *   - "Biometric"   (anything else / unknown)
 */
export async function getBiometricLabel(): Promise<string> {
  const type = await getBiometricType();
  if (Platform.OS === "ios") {
    if (type === "face") return "Face ID";
    if (type === "fingerprint") return "Touch ID";
    return "Biometric";
  }
  if (type === "face") return "Face Unlock";
  if (type === "fingerprint") return "Fingerprint";
  if (type === "iris") return "Iris";
  return "Biometric";
}

export async function isBiometricEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(BIOMETRIC_KEY);
  return val === "true";
}

export async function getBiometricPhone(): Promise<string | null> {
  return AsyncStorage.getItem(BIOMETRIC_PHONE_KEY);
}

export async function getBiometricRole(): Promise<string> {
  const role = await AsyncStorage.getItem(BIOMETRIC_ROLE_KEY);
  return role || "customer";
}

export async function enableBiometric(phone: string, role?: string): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_KEY, "true");
  await AsyncStorage.setItem(BIOMETRIC_PHONE_KEY, phone);
  if (role) await AsyncStorage.setItem(BIOMETRIC_ROLE_KEY, role);
}

export async function disableBiometric(): Promise<void> {
  await AsyncStorage.removeItem(BIOMETRIC_KEY);
  await AsyncStorage.removeItem(BIOMETRIC_PHONE_KEY);
  await AsyncStorage.removeItem(BIOMETRIC_ROLE_KEY);
}

/**
 * Authenticates using the device's REAL biometric sensor only.
 * `disableDeviceFallback: true` ensures the actual fingerprint/face sensor is
 * triggered and the OS does NOT silently fall back to the device PIN/passcode.
 * If the user cancels or biometric fails, callers should fall back to the normal
 * password / OTP login form.
 */
export async function authenticateWithBiometric(promptMessage?: string): Promise<BiometricResult> {
  try {
    const available = await isBiometricAvailable();
    if (!available) {
      return { success: false, error: "No biometric is enrolled on this device. Please enable Face ID, Touch ID, or Fingerprint in phone settings." };
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || "Confirm your identity",
      disableDeviceFallback: true,
      cancelLabel: "Use password instead",
    });
    if (result.success) return { success: true };
    return { success: false, error: "Face ID / Fingerprint did not match. Please try again or use password." };
  } catch (e: unknown) {
    return { success: false, error: (e as Error)?.message || "Biometric authentication failed" };
  }
}

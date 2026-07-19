import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";
import { getSecureItem, removeSecureItem, setSecureItem } from "@/services/secureSessionStorage";

const BIOMETRIC_KEY = "athoo_biometric_enabled";
const BIOMETRIC_PHONE_KEY = "athoo_biometric_phone";
const BIOMETRIC_ROLE_KEY = "athoo_biometric_role";

export type BiometricType = "face" | "fingerprint" | "iris" | "none";

export interface BiometricResult {
  success: boolean;
  error?: string;
}

/**
 * Returns the real biometric sensor type available on this device.
 * A device PIN, passcode, or pattern by itself is not treated as biometric.
 */
export async function getBiometricType(): Promise<BiometricType> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
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

export async function isBiometricAvailable(): Promise<boolean> {
  return (await getBiometricType()) !== "none";
}

export async function getBiometricLabel(): Promise<string> {
  const type = await getBiometricType();
  if (Platform.OS === "ios") {
    if (type === "face") return "Face ID";
    if (type === "fingerprint") return "Touch ID";
    return "Biometric Login";
  }
  if (type === "face") return "Face Unlock";
  if (type === "fingerprint") return "Fingerprint";
  if (type === "iris") return "Iris Scan";
  return "Biometric Login";
}

/**
 * Biometric preference metadata is kept in Keychain/Keystore through the
 * shared secure-storage adapter. getSecureItem also migrates legacy values
 * from AsyncStorage on first read.
 */
export async function isBiometricEnabled(): Promise<boolean> {
  return (await getSecureItem(BIOMETRIC_KEY)) === "true";
}

export async function getBiometricPhone(): Promise<string | null> {
  return getSecureItem(BIOMETRIC_PHONE_KEY);
}

export async function getBiometricRole(): Promise<string> {
  const role = await getSecureItem(BIOMETRIC_ROLE_KEY);
  return role === "provider" ? "provider" : "customer";
}

export async function enableBiometric(phone: string, role?: string): Promise<void> {
  const normalizedPhone = String(phone || "").trim();
  if (!normalizedPhone) throw new Error("A signed-in account is required to enable biometric login.");

  await Promise.all([
    setSecureItem(BIOMETRIC_KEY, "true"),
    setSecureItem(BIOMETRIC_PHONE_KEY, normalizedPhone),
    setSecureItem(BIOMETRIC_ROLE_KEY, role === "provider" ? "provider" : "customer"),
  ]);
}

export async function disableBiometric(): Promise<void> {
  await Promise.all([
    removeSecureItem(BIOMETRIC_KEY),
    removeSecureItem(BIOMETRIC_PHONE_KEY),
    removeSecureItem(BIOMETRIC_ROLE_KEY),
  ]);
}

/**
 * Authenticates with the enrolled biometric sensor only. Device passcode
 * fallback is intentionally disabled; callers provide normal password/OTP
 * fallback in the Athoo UI.
 */
export async function authenticateWithBiometric(promptMessage?: string): Promise<BiometricResult> {
  try {
    if (!(await isBiometricAvailable())) {
      return {
        success: false,
        error: "No biometric is enrolled on this device. Enable Face ID, Touch ID, Fingerprint, or Iris in your phone settings first.",
      };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || "Confirm your identity",
      disableDeviceFallback: true,
      cancelLabel: "Use password instead",
    });
    if (result.success) return { success: true };

    return {
      success: false,
      error: "Biometric verification was cancelled or did not match. Try again or use your password.",
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Biometric authentication failed",
    };
  }
}

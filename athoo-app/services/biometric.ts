import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";
import { getSecureItem, removeSecureItem, setSecureItem } from "@/services/secureSessionStorage";

const BIOMETRIC_KEY = "athoo_biometric_enabled";
const BIOMETRIC_PHONE_KEY = "athoo_biometric_phone";
const BIOMETRIC_ROLE_KEY = "athoo_biometric_role";

export type BiometricType = "face" | "fingerprint" | "iris" | "biometric" | "none";

export interface DeviceAuthenticationState {
  available: boolean;
  biometricEnrolled: boolean;
  hardwareAvailable: boolean;
  enrolledLevel: LocalAuthentication.SecurityLevel;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  methodLabels: string[];
  type: BiometricType;
  label: string;
}

export interface BiometricResult {
  success: boolean;
  error?: string;
  code?: string;
}

function resolveType(
  supportedTypes: LocalAuthentication.AuthenticationType[],
  biometricEnrolled: boolean,
): BiometricType {
  if (!biometricEnrolled) return "none";
  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "fingerprint";
  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) return "iris";
  return "biometric";
}

function methodLabelsForTypes(
  supportedTypes: LocalAuthentication.AuthenticationType[],
): string[] {
  const labels: string[] = [];
  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    labels.push(Platform.OS === "ios" ? "Face ID" : "Face Unlock");
  }
  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    labels.push(Platform.OS === "ios" ? "Touch ID" : "Fingerprint");
  }
  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    labels.push("Iris Scan");
  }
  return labels;
}

function labelForType(type: BiometricType): string {
  if (Platform.OS === "ios") {
    if (type === "face") return "Face ID";
    if (type === "fingerprint") return "Touch ID";
    if (type === "biometric") return "Biometric Authentication";
    return "Device Authentication";
  }
  return type === "none" ? "Device Authentication" : "Device Biometrics";
}

/**
 * Reads the authentication methods exposed by the operating system. A screen
 * lock by itself is not reported as a biometric capability because
 * expo-local-authentication cannot reliably start a credential-only prompt on
 * every Android version. The native PIN/passcode fallback remains enabled once
 * a supported biometric prompt is active.
 */
export async function getDeviceAuthenticationState(): Promise<DeviceAuthenticationState> {
  try {
    const results = await Promise.allSettled([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);

    const hardwareAvailable = results[0].status === "fulfilled" ? results[0].value : false;
    const supportedTypes = results[1].status === "fulfilled" ? results[1].value : [];
    const biometricEnrolled = results[2].status === "fulfilled" ? results[2].value : false;
    const enrolledLevel = results[3].status === "fulfilled"
      ? results[3].value
      : LocalAuthentication.SecurityLevel.NONE;

    const biometricLevel =
      enrolledLevel === LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK ||
      enrolledLevel === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;

    // Enrollment is the primary signal. Some Android vendors temporarily
    // expose incomplete hardware/type metadata even though authentication
    // remains usable. The native prompt remains the final authority.
    const available = biometricEnrolled || biometricLevel;
    const type = resolveType(supportedTypes, available);
    const methodLabels = methodLabelsForTypes(supportedTypes);
    return {
      available,
      biometricEnrolled,
      hardwareAvailable,
      enrolledLevel,
      supportedTypes,
      methodLabels,
      type,
      label: labelForType(type),
    };
  } catch {
    return {
      available: false,
      biometricEnrolled: false,
      hardwareAvailable: false,
      enrolledLevel: LocalAuthentication.SecurityLevel.NONE,
      supportedTypes: [],
      methodLabels: [],
      type: "none",
      label: labelForType("none"),
    };
  }
}

export async function getBiometricType(): Promise<BiometricType> {
  return (await getDeviceAuthenticationState()).type;
}

// Backward-compatible name used throughout the existing authentication flow.
export async function isBiometricAvailable(): Promise<boolean> {
  return (await getDeviceAuthenticationState()).available;
}

export async function getBiometricLabel(): Promise<string> {
  return (await getDeviceAuthenticationState()).label;
}

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
  if (!normalizedPhone) throw new Error("A signed-in account is required to enable device authentication.");

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

function authenticationError(code: string | undefined): string {
  switch (code) {
    case "not_enrolled":
      return "Set up Face ID, Touch ID, fingerprint, face unlock, or iris authentication in your phone security settings, then try again.";
    case "not_available":
      return "This phone is not exposing an enrolled biometric method to Athoo. Use your Athoo password or OTP instead.";
    case "lockout":
      return "Device authentication is temporarily locked after too many attempts. Unlock your phone normally, then try again.";
    case "user_cancel":
    case "system_cancel":
    case "app_cancel":
      return "Device authentication was cancelled.";
    case "user_fallback":
      return "Use your device passcode when the system prompt offers it, or sign in with your Athoo password or OTP.";
    case "authentication_failed":
      return "Your face, fingerprint, iris, or device credential was not accepted. Please try again.";
    case "passcode_not_set":
      return "A secure phone passcode, PIN, or pattern is required before biometric fallback can be used.";
    default:
      return "Device authentication could not be completed. Try again or use your Athoo password or OTP.";
  }
}

/**
 * Uses the enrolled native biometric and keeps the operating-system credential
 * fallback enabled. Android Class 2 (weak) biometrics are allowed so supported
 * camera-based face unlock implementations are not incorrectly excluded.
 */
export async function authenticateWithBiometric(promptMessage?: string): Promise<BiometricResult> {
  try {
    const state = await getDeviceAuthenticationState();
    if (!state.available) {
      return {
        success: false,
        code: state.biometricEnrolled ? "not_available" : "not_enrolled",
        error: state.biometricEnrolled
          ? "Your phone reports a biometric enrollment, but the native authentication prompt is not available right now. Lock and unlock your phone, then try again."
          : "No supported biometric is enrolled. Set up Face ID, Touch ID, fingerprint, face unlock, or iris authentication first.",
      };
    }

    const methodSummary = state.methodLabels.length > 0
      ? state.methodLabels.join(", ")
      : "an enrolled biometric";
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || "Confirm your identity",
      promptSubtitle: Platform.OS === "android"
        ? `Use ${methodSummary} or your phone unlock fallback`
        : undefined,
      promptDescription: Platform.OS === "android"
        ? "Athoo accepts any biometric method exposed by your phone to Android BiometricPrompt."
        : undefined,
      disableDeviceFallback: false,
      fallbackLabel: "Use Device Passcode",
      cancelLabel: "Cancel",
      biometricsSecurityLevel: "weak",
      requireConfirmation: false,
    });
    if (result.success) return { success: true };

    const errorCode =
      "error" in result && typeof result.error === "string"
        ? result.error
        : "unknown";

    return {
      success: false,
      code: errorCode,
      error: authenticationError(errorCode),
    };
  } catch (error: unknown) {
    return {
      success: false,
      code: "unknown",
      error: error instanceof Error ? error.message : "Device authentication failed",
    };
  }
}

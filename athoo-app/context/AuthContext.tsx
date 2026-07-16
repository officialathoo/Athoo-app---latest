import { appLogger } from "@/lib/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import { api, setToken, setRefreshToken, clearToken, getToken, realtime, setUnauthorizedHandler } from "@/services/api";
import { notificationService } from "@/services/NotificationService";
import { isBiometricAvailable, authenticateWithBiometric } from "@/services/biometric";
import { apiErrorToMessage } from "@/lib/apiError";

export type UserRole = "customer" | "provider" | "admin";
export type AppUserRole = "customer" | "provider";

export interface User {
  id: string;
  name: string;
  phone: string;
  role: AppUserRole;
  email?: string;
  emailVerified?: boolean;
  profileImage?: string;
  profileColor?: string;
  location?: string;
  rating?: number;
  ratingCount?: number;
  totalJobs?: number;
  services?: string[];
  isVerified?: boolean;
  verificationStatus?: "pending" | "in_process" | "approved" | "rejected";
  verificationNote?: string | null;
  isAvailable?: boolean;
  bio?: string;
  experience?: string;
  joinedAt?: string;
  savedProviders?: string[];
  ratePerHour?: number | null;
  pendingCommission?: number;
  totalCommission?: number;
  commissionLimit?: number;
  isBlocked?: boolean;
  blockedReason?: string;
  legalVersion?: string | null;
  termsAcceptedAt?: string | null;
  privacyAcceptedAt?: string | null;
}

export interface RegisterData {
  name: string;
  phone: string;
  email?: string;
  role: AppUserRole;
  services?: string[];
  fatherName?: string;
  cnicNumber?: string;
  experience?: string;
  location?: string;
  ratePerHour?: number;
  password?: string;
  termsAccepted?: boolean;
  privacyAccepted?: boolean;
  legalVersion?: string;
  registrationToken: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  requiresBiometric: boolean;
  sendOtp: (phone: string, purpose: "login" | "registration", role: AppUserRole, email?: string) => Promise<{ success: boolean; code?: string; message?: string; error?: string; expiresInSeconds?: number; resendAfterSeconds?: number }>;
  verifyOtpAndLogin: (phone: string, code: string, remember: boolean, purpose: "login" | "registration", role: AppUserRole) => Promise<{ success: boolean; isNewUser: boolean; user?: User | null; registrationToken?: string; error?: string }>;
  sendEmailOtp: (email: string, role: AppUserRole) => Promise<{ success: boolean; code?: string; message?: string; maskedEmail?: string; expiresInSeconds?: number; resendAfterSeconds?: number; error?: string }>;
  verifyEmailOtpAndLogin: (email: string, code: string, remember: boolean, role: AppUserRole) => Promise<{ success: boolean; user?: User | null; error?: string }>;
  loginWithPassword: (identifier: string, password: string, role: AppUserRole, remember?: boolean) => Promise<{ success: boolean; user?: User | null; error?: string }>;
  register: (data: RegisterData) => Promise<{
    success: boolean;
    user?: User | null;
    error?: string;
    emailVerificationRequired?: boolean;
    emailVerificationSent?: boolean;
    emailVerificationExpiresInSeconds?: number;
    emailVerificationResendAfterSeconds?: number;
    emailVerificationCode?: string;
  }>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  toggleSaved: (providerId: string) => Promise<void>;
  completeBiometricLogin: () => Promise<{ success: boolean; user?: User | null; error?: string }>;
  promptBiometricSetup: (phone: string, role?: AppUserRole) => Promise<void>;
  switchRole: (targetRole?: AppUserRole) => Promise<void>;
  refreshUser: () => Promise<void>;
  acceptCurrentLegal: () => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SAVED_KEY = "athoo_saved_providers";
const BIO_ENABLED_KEY = "athoo_biometric_enabled";
const BIO_PHONE_KEY = "athoo_biometric_phone";
const BIO_ROLE_KEY = "athoo_biometric_role";
const REMEMBER_KEY = "athoo_remember_me";

function toAppRole(role?: string): AppUserRole {
  return role === "provider" ? "provider" : "customer";
}

function sanitizeUser(raw: any): User {
  return { ...raw, role: toAppRole(raw?.role) };
}

function isUnauthorizedError(error: unknown): boolean {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return (
    message.includes("401") ||
    message.includes("unauthorized") ||
    message.includes("jwt") ||
    message.includes("token expired") ||
    message.includes("invalid token")
  );
}

function isTransientNetworkError(error: unknown): boolean {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("load failed") ||
    message.includes("network error")
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresBiometric, setRequiresBiometric] = useState(false);

  const attachSavedProviders = useCallback(async (u: User | null) => {
    if (!u) return null;
    const storageKey = `${SAVED_KEY}_${u.id}`;
    try {
      const response = await api.getSavedProviders();
      const serverIds = Array.isArray(response?.ids) ? response.ids : [];
      await AsyncStorage.setItem(storageKey, JSON.stringify(serverIds));
      return { ...u, savedProviders: serverIds };
    } catch {
      try {
        const savedRaw = await AsyncStorage.getItem(storageKey);
        const parsed = savedRaw ? JSON.parse(savedRaw) : [];
        return { ...u, savedProviders: Array.isArray(parsed) ? parsed : [] };
      } catch {
        return { ...u, savedProviders: [] };
      }
    }
  }, []);

  const loadUser = useCallback(async () => {
    try {
      const token = await getToken();
      const remember = await AsyncStorage.getItem(REMEMBER_KEY);
      const biometricEnabled = await AsyncStorage.getItem(BIO_ENABLED_KEY);
      if (!token) {
        setUser(null);
        setRequiresBiometric(false);
        return;
      }
      // Biometric is an optional fast-login shortcut, not a forced lock screen.
      // Never block normal remembered sessions; random app restarts must not log users out.
      const res = await api.getMe();
      const rawUser = (res?.user as any) || null;
      if (!rawUser) {
        await clearToken();
        setUser(null);
        setRequiresBiometric(false);
        return;
      }
      const hydrated = await attachSavedProviders(sanitizeUser(rawUser));
      setUser(hydrated);
      setRequiresBiometric(false);
    } catch (error) {
      // Do not log the user out on temporary slow network / Neon timeouts.
      // Only clear the saved token when the server explicitly rejects it.
      if (isUnauthorizedError(error)) {
        await clearToken();
        setUser(null);
        setRequiresBiometric(false);
      } else if (!isTransientNetworkError(error)) {
        appLogger.warn("auth", "Failed to load user profile:", error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [attachSavedProviders]);

  useEffect(() => { loadUser(); }, [loadUser]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user) {
        realtime.stop();
        return;
      }
      const token = await getToken();
      if (!mounted || !token) return;
      await notificationService.syncPushToken(api.baseUrl, token);
      realtime.start();
    })();
    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    return () => { realtime.stop(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void (async () => {
        const token = await getToken();
        if (token) await notificationService.syncPushToken(api.baseUrl, token);
      })();
    });
    return () => subscription.remove();
  }, [user]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.getMe();
      const rawUser = (res?.user as any) || null;
      if (!rawUser) return;
      const hydrated = await attachSavedProviders(sanitizeUser(rawUser));
      setUser(hydrated);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearToken();
        setUser(null);
        setRequiresBiometric(false);
      }
    }
  }, [attachSavedProviders]);

  const sendOtp = useCallback(async (
    phone: string,
    purpose: "login" | "registration",
    role: AppUserRole,
    email?: string,
  ) => {
    try {
      const res = await api.sendOtp(phone.trim(), purpose, role, email?.trim() || undefined);
      if (!res.success) return { success: false, error: res.message || "Failed to send OTP" };
      return {
        success: true,
        code: res.code,
        message: res.message,
        expiresInSeconds: res.expiresInSeconds,
        resendAfterSeconds: res.resendAfterSeconds,
      };
    } catch (e: unknown) {
      return { success: false, error: apiErrorToMessage(e, "We could not send the verification code. Please try again.") };
    }
  }, []);

  const verifyOtpAndLogin = useCallback(async (
    phone: string,
    code: string,
    remember: boolean,
    purpose: "login" | "registration",
    role: AppUserRole,
  ) => {
    try {
      const res = await api.verifyOtp(phone.trim(), code.trim(), purpose, role);
      if (!res.success) return { success: false, isNewUser: false, error: "Invalid OTP" };
      if (purpose === "registration") {
        if (!res.registrationToken) {
          return { success: false, isNewUser: true, error: "Phone verification could not be completed. Please request a new code." };
        }
        return { success: true, isNewUser: true, user: null, registrationToken: res.registrationToken };
      }
      if (!res.token) return { success: false, isNewUser: false, error: "Login token not received from server" };
      await setToken(res.token, remember);
      await setRefreshToken(res.refreshToken || null, remember);
      const savedToken = await getToken();
      if (!savedToken) return { success: false, isNewUser: false, error: "Token was not saved on device" };
      const me = await api.getMe();
      const rawUser = (me?.user as any) || (res.user as any) || null;
      if (!rawUser) return { success: false, isNewUser: false, error: "User profile could not be loaded" };
      const hydrated = await attachSavedProviders(sanitizeUser(rawUser));
      setUser(hydrated);
      setRequiresBiometric(false);
      return { success: true, isNewUser: false, user: hydrated };
    } catch (e: unknown) {
      return { success: false, isNewUser: false, error: apiErrorToMessage(e, "Verification failed. Please request a new code and try again.") };
    }
  }, [attachSavedProviders]);

  const sendEmailOtp = useCallback(async (email: string, role: AppUserRole) => {
    try {
      const res = await api.sendEmailOtp(email.trim().toLowerCase(), role);
      return {
        success: res.success === true,
        code: res.code,
        message: res.message,
        maskedEmail: res.maskedEmail,
        expiresInSeconds: res.expiresInSeconds,
        resendAfterSeconds: res.resendAfterSeconds,
      };
    } catch (error: unknown) {
      return { success: false, error: apiErrorToMessage(error, "We could not send the email sign-in code. Please try another login method.") };
    }
  }, []);

  const verifyEmailOtpAndLogin = useCallback(async (email: string, code: string, remember: boolean, role: AppUserRole) => {
    try {
      const res = await api.verifyEmailOtp(email.trim().toLowerCase(), code.trim(), role);
      if (!res.token) return { success: false, error: "Login token not received from server" };
      await setToken(res.token, remember);
      await setRefreshToken(res.refreshToken || null, remember);
      const savedToken = await getToken();
      if (!savedToken) return { success: false, error: "Token was not saved on device" };
      const me = await api.getMe();
      const rawUser = (me?.user as any) || (res.user as any) || null;
      if (!rawUser) return { success: false, error: "User profile could not be loaded" };
      const hydrated = await attachSavedProviders(sanitizeUser(rawUser));
      setUser(hydrated);
      setRequiresBiometric(false);
      return { success: true, user: hydrated };
    } catch (error: unknown) {
      return { success: false, error: apiErrorToMessage(error, "Email verification failed. Request a new code and try again.") };
    }
  }, [attachSavedProviders]);

  const loginWithPassword = useCallback(async (identifier: string, password: string, role: AppUserRole, remember = true) => {
    try {
      const res = await api.loginWithPassword({ identifier: identifier.trim(), password, role });
      if (!res.token) return { success: false, error: "Login token not received from server" };
      await setToken(res.token, remember);
      await setRefreshToken(res.refreshToken || null, remember);
      const savedToken = await getToken();
      if (!savedToken) return { success: false, error: "Token was not saved on device" };
      const me = await api.getMe();
      const rawUser = (me?.user as any) || (res.user as any) || null;
      if (!rawUser) return { success: false, error: "User profile could not be loaded" };
      const hydrated = await attachSavedProviders(sanitizeUser(rawUser));
      setUser(hydrated);
      setRequiresBiometric(false);
      return { success: true, user: hydrated };
    } catch (e: unknown) {
      return { success: false, error: apiErrorToMessage(e, "Login failed. Please check your details and try again.") };
    }
  }, [attachSavedProviders]);

  const register = useCallback(async (data: RegisterData) => {
    try {
      const res = await api.register({ name: data.name, phone: data.phone.trim(), email: data.email, role: data.role, services: data.services || [], fatherName: data.fatherName, cnicNumber: data.cnicNumber, experience: data.experience, location: data.location, ratePerHour: data.ratePerHour, password: data.password, termsAccepted: data.termsAccepted, privacyAccepted: data.privacyAccepted, legalVersion: data.legalVersion, registrationToken: data.registrationToken });
      if (!res.token) return { success: false, error: "Registration token not received from server" };
      await setToken(res.token, true);
      await setRefreshToken(res.refreshToken || null, true);
      const savedToken = await getToken();
      if (!savedToken) return { success: false, error: "Token was not saved on device" };
      const me = await api.getMe();
      const rawUser = (me?.user as any) || (res.user as any) || null;
      if (!rawUser) return { success: false, error: "User profile could not be loaded" };
      const hydrated = await attachSavedProviders(sanitizeUser({ ...rawUser, savedProviders: [] }));
      setUser(hydrated);
      setRequiresBiometric(false);
      return {
        success: true,
        user: hydrated,
        emailVerificationRequired: res.emailVerificationRequired,
        emailVerificationSent: res.emailVerificationSent,
        emailVerificationExpiresInSeconds: res.emailVerificationExpiresInSeconds,
        emailVerificationResendAfterSeconds: res.emailVerificationResendAfterSeconds,
        emailVerificationCode: res.emailVerificationCode,
      };
    } catch (e: unknown) {
      return { success: false, error: apiErrorToMessage(e, "Registration could not be completed. Please try again.") };
    }
  }, [attachSavedProviders]);

  useEffect(() => {
    if (user?.id) {
      notificationService.init().catch(() => {});
    }
  }, [user?.id]);

  const logout = useCallback(async () => {
    // Logout must feel immediate even on a slow or unavailable network.
    // Capture the current token first, clear local UI/session state, then perform
    // server cleanup as a bounded best-effort background task.
    const token = await getToken().catch(() => null);

    realtime.stop();
    notificationService.resetSyncedToken();
    setUser(null);
    setRequiresBiometric(false);
    try { router.replace("/auth/welcome" as any); } catch { router.replace("/" as any); }

    await clearToken().catch(() => {});
    await AsyncStorage.removeItem(REMEMBER_KEY).catch(() => {});

    if (!token) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const baseUrl = String(api.baseUrl || "").replace(/\/$/, "");
    if (!baseUrl) {
      clearTimeout(timeout);
      return;
    }

    void Promise.allSettled([
      fetch(`${baseUrl}/api/auth/push-token`, {
        method: "PATCH",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ expoPushToken: "" }),
        signal: controller.signal,
      }),
      fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }),
    ]).finally(() => clearTimeout(timeout));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => { setUnauthorizedHandler(null); };
  }, [logout]);

  const updateUser = useCallback(async (data: Partial<User>) => {
    if (!user) return;
    try {
      const { savedProviders, id, role, phone, joinedAt, ...apiData } = data;
      if (Object.keys(apiData).length > 0) {
        const res = await api.updateMe(apiData as Parameters<typeof api.updateMe>[0]);
        const updated = { ...user, ...sanitizeUser(res.user as any), savedProviders: user.savedProviders };
        if (data.savedProviders !== undefined) updated.savedProviders = data.savedProviders;
        setUser(updated);
      } else if (data.savedProviders !== undefined) {
        setUser({ ...user, savedProviders: data.savedProviders });
      }
    } catch (err) {
      const { profileImage, profileColor, ...localSafeData } = data;
      if (Object.keys(localSafeData).length > 0) setUser({ ...user, ...localSafeData });
      if (profileImage !== undefined || profileColor !== undefined) throw err;
    }
  }, [user]);

  const toggleSaved = useCallback(async (providerId: string) => {
    if (!user || !providerId) return;
    const saved = Array.isArray(user.savedProviders) ? user.savedProviders : [];
    const exists = saved.includes(providerId);
    const newSaved = exists ? saved.filter((id) => id !== providerId) : [...saved, providerId];
    const storageKey = `${SAVED_KEY}_${user.id}`;

    setUser((current) => current ? { ...current, savedProviders: newSaved } : current);
    await AsyncStorage.setItem(storageKey, JSON.stringify(newSaved));

    try {
      if (exists) await api.removeSavedProvider(providerId);
      else await api.saveProvider(providerId);
    } catch (error) {
      setUser((current) => current ? { ...current, savedProviders: saved } : current);
      await AsyncStorage.setItem(storageKey, JSON.stringify(saved));
      throw error;
    }
  }, [user]);

  const switchRole = useCallback(async (targetRole?: AppUserRole) => {
    if (!user) return;
    const res = await api.switchRole(targetRole);
    if (!res?.token || !res?.user) throw new Error("Invalid response from server");
    const remember = (await AsyncStorage.getItem(REMEMBER_KEY)) === "true";
    await setToken(res.token, remember);
    const updatedUser = await attachSavedProviders(sanitizeUser(res.user as any));
    setUser(updatedUser);
    setRequiresBiometric(false);
    const biometricEnabled = await AsyncStorage.getItem(BIO_ENABLED_KEY);
    if (biometricEnabled === "true" && updatedUser?.phone) {
      await AsyncStorage.setItem(BIO_PHONE_KEY, updatedUser.phone);
      await AsyncStorage.setItem(BIO_ROLE_KEY, updatedUser.role);
    }
    router.replace(updatedUser?.role === "provider" ? "/(provider)/(tabs)/dashboard" : "/(customer)/(tabs)/home");
  }, [user, attachSavedProviders]);

  const completeBiometricLogin = useCallback(async () => {
    try {
      const biometricEnabled = await AsyncStorage.getItem(BIO_ENABLED_KEY);
      if (biometricEnabled !== "true") return { success: false, error: "Biometric login is not enabled" };
      const available = await isBiometricAvailable();
      if (!available) {
        return { success: false, error: "No Face ID / Fingerprint enrolled on this device. Please sign in with your password." };
      }
      const result = await authenticateWithBiometric("Sign in to ATHOO");
      if (!result.success) return { success: false, error: result.error || "Authentication cancelled or failed" };
      const token = await getToken();
      if (!token) return { success: false, error: "Session expired. Please login again." };
      const res = await api.getMe();
      const rawUser = (res?.user as any) || null;
      if (!rawUser) { await clearToken(); return { success: false, error: "Session expired. Please login again." }; }
      const hydrated = await attachSavedProviders(sanitizeUser(rawUser));
      setUser(hydrated); setRequiresBiometric(false);
      return { success: true, user: hydrated };
    } catch (e: unknown) {
      return { success: false, error: "Biometric login failed. Please try again or use password/OTP." };
    }
  }, [attachSavedProviders]);

  const promptBiometricSetup = useCallback(async (phone: string, role?: AppUserRole) => {
    try {
      const available = await isBiometricAvailable();
      if (!available) {
        await AsyncStorage.removeItem(BIO_ENABLED_KEY);
        await AsyncStorage.removeItem(BIO_PHONE_KEY);
        await AsyncStorage.removeItem(BIO_ROLE_KEY);
        return;
      }
      // Enable after one successful biometric prompt. If the user cancels, keep normal login working.
      const result = await authenticateWithBiometric("Enable biometric login for faster sign in");
      if (!result.success) return;
      await AsyncStorage.setItem(BIO_ENABLED_KEY, "true");
      await AsyncStorage.setItem(BIO_PHONE_KEY, phone);
      await AsyncStorage.setItem(BIO_ROLE_KEY, role || "customer");
    } catch {}
  }, []);

  const acceptCurrentLegal = useCallback(async () => {
    try {
      const res = await api.acceptCurrentLegal();
      const rawUser = res?.user ?? null;
      if (rawUser) {
        const hydrated = await attachSavedProviders(sanitizeUser(rawUser));
        setUser(hydrated);
      } else if (user) {
        setUser({ ...user, legalVersion: res?.legalVersion ?? user.legalVersion });
      }
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to accept the latest Terms";
      return { success: false, error: msg };
    }
  }, [attachSavedProviders, user]);

  return <AuthContext.Provider value={{ user, isLoading, requiresBiometric, sendOtp, verifyOtpAndLogin, sendEmailOtp, verifyEmailOtpAndLogin, loginWithPassword, register, logout, updateUser, toggleSaved, completeBiometricLogin, promptBiometricSetup, switchRole, refreshUser, acceptCurrentLegal }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}


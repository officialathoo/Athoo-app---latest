import { appLogger } from "@/lib/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { api, setToken, setRefreshToken, clearToken, getToken, realtime, setUnauthorizedHandler } from "@/services/api";
import { notificationService } from "@/services/NotificationService";
import {
  authenticateWithBiometric,
  disableBiometric,
  enableBiometric,
  getBiometricPhone,
  getBiometricRole,
  isBiometricAvailable,
  isBiometricEnabled,
} from "@/services/biometric";
import { apiErrorToMessage } from "@/lib/apiError";
import { getDeviceId } from "@/services/deviceIdentity";
import { getSecureItem, removeSecureItem, setSecureItem } from "@/services/secureSessionStorage";

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
const REMEMBER_KEY = "athoo_remember_me";
const SESSION_USER_CACHE_KEY = "athoo_session_user_cache";
const BIOMETRIC_RELOCK_MS = Math.max(60, Number(process.env.EXPO_PUBLIC_BIOMETRIC_RELOCK_SECONDS || 300)) * 1000;

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
  const queryClient = useQueryClient();
  const sessionClearPromiseRef = useRef<Promise<void> | null>(null);
  const logoutPromiseRef = useRef<Promise<void> | null>(null);
  const backgroundedAtRef = useRef<number | null>(null);

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
      if (!token) {
        await removeSecureItem(SESSION_USER_CACHE_KEY).catch(() => undefined);
        setUser(null);
        setRequiresBiometric(false);
        return;
      }

      const remember = (await AsyncStorage.getItem(REMEMBER_KEY)) === "true";
      const biometricEnabled = await isBiometricEnabled();
      if (remember && biometricEnabled) {
        const available = await isBiometricAvailable();
        if (available) {
          // A remembered session stays encrypted on the device, but the app UI
          // remains locked until Face ID / Touch ID / Fingerprint succeeds.
          setUser(null);
          setRequiresBiometric(true);
          return;
        }
        await disableBiometric();
      }

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
      // Temporary network failures must never destroy a valid remembered
      // session. Explicit server rejection is handled by the unauthorized
      // callback, which performs one idempotent local session clear.
      if (isUnauthorizedError(error)) {
        await clearToken();
        await disableBiometric();
        setUser(null);
        setRequiresBiometric(false);
      } else if (isTransientNetworkError(error)) {
        try {
          const cachedRaw = await getSecureItem(SESSION_USER_CACHE_KEY);
          const cached = cachedRaw ? sanitizeUser(JSON.parse(cachedRaw)) : null;
          if (cached?.id && cached?.phone) setUser(cached);
        } catch {
          // The offline banner remains visible; a later foreground activation
          // retries the authoritative server profile.
        }
      } else {
        appLogger.warn("auth", "Failed to load user profile:", error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [attachSavedProviders]);

  useEffect(() => { loadUser(); }, [loadUser]);

  useEffect(() => {
    if (!user || requiresBiometric) return;
    void setSecureItem(SESSION_USER_CACHE_KEY, JSON.stringify(user)).catch(() => undefined);
  }, [requiresBiometric, user]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user || requiresBiometric) {
        realtime.stop();
        return;
      }
      const token = await getToken();
      if (!mounted || !token) return;
      await notificationService.syncPushToken(api.baseUrl, token);
      realtime.start();
    })();
    return () => { mounted = false; };
  }, [requiresBiometric, user]);

  useEffect(() => {
    return () => { realtime.stop(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        if (backgroundedAtRef.current === null) backgroundedAtRef.current = Date.now();
        return;
      }
      if (state !== "active") return;

      const backgroundedAt = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      void (async () => {
        const token = await getToken();
        if (token) await notificationService.syncPushToken(api.baseUrl, token);

        if (
          backgroundedAt &&
          Date.now() - backgroundedAt >= BIOMETRIC_RELOCK_MS &&
          await isBiometricEnabled() &&
          await isBiometricAvailable()
        ) {
          setRequiresBiometric(true);
        }
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
        // The shared API unauthorized handler performs the complete,
        // idempotent session cleanup.
        return;
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

  const clearLocalSession = useCallback((disableQuickLogin = true): Promise<void> => {
    if (sessionClearPromiseRef.current) return sessionClearPromiseRef.current;

    const task = (async () => {
      realtime.stop();
      notificationService.resetSyncedToken();
      queryClient.clear();
      setUser(null);
      setRequiresBiometric(false);
      await Promise.all([
        clearToken().catch(() => undefined),
        removeSecureItem(SESSION_USER_CACHE_KEY).catch(() => undefined),
        disableQuickLogin ? disableBiometric().catch(() => undefined) : Promise.resolve(),
      ]);
    })().finally(() => {
      sessionClearPromiseRef.current = null;
    });
    sessionClearPromiseRef.current = task;
    return task;
  }, [queryClient]);

  const expireSession = useCallback(async () => {
    await clearLocalSession(true);
  }, [clearLocalSession]);

  const logout = useCallback((): Promise<void> => {
    if (logoutPromiseRef.current) return logoutPromiseRef.current;

    const task = (async () => {
      const [token, deviceId] = await Promise.all([
        getToken().catch(() => null),
        getDeviceId().catch(() => ""),
      ]);

      // Local state is cleared exactly once. Route protection in the root
      // navigator owns the transition to Welcome, avoiding competing redirects
      // from the profile screen, role layout, and unauthorized callbacks.
      await clearLocalSession(true);

      if (!token) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const baseUrl = String(api.baseUrl || "").replace(/\/$/, "");
      if (!baseUrl) {
        clearTimeout(timeout);
        return;
      }

      await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(deviceId ? { "X-Athoo-Device-Id": deviceId } : {}),
        },
        signal: controller.signal,
      }).catch(() => undefined).finally(() => clearTimeout(timeout));
    })().finally(() => {
      logoutPromiseRef.current = null;
    });

    logoutPromiseRef.current = task;
    return task;
  }, [clearLocalSession]);

  useEffect(() => {
    setUnauthorizedHandler(() => { void expireSession(); });
    return () => { setUnauthorizedHandler(null); };
  }, [expireSession]);

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
    if (await isBiometricEnabled() && updatedUser?.phone) {
      await enableBiometric(updatedUser.phone, updatedUser.role);
    }
    // The root session route guard owns role transitions, preventing duplicate
    // navigation and startup/login flicker.
  }, [user, attachSavedProviders]);

  const completeBiometricLogin = useCallback(async () => {
    try {
      if (!(await isBiometricEnabled())) {
        return { success: false, error: "Biometric login is not enabled" };
      }
      const available = await isBiometricAvailable();
      if (!available) {
        await disableBiometric();
        return { success: false, error: "No Face ID / Fingerprint is enrolled on this device. Please sign in normally." };
      }
      const result = await authenticateWithBiometric("Sign in to Athoo");
      if (!result.success) return { success: false, error: result.error || "Authentication cancelled or failed" };

      const token = await getToken();
      if (!token) {
        await disableBiometric();
        return { success: false, error: "Session expired. Please login again." };
      }
      const res = await api.getMe();
      const rawUser = (res?.user as any) || null;
      if (!rawUser) {
        await clearLocalSession(true);
        return { success: false, error: "Session expired. Please login again." };
      }
      const hydrated = await attachSavedProviders(sanitizeUser(rawUser));
      setUser(hydrated);
      setRequiresBiometric(false);
      return { success: true, user: hydrated };
    } catch (error: unknown) {
      if (isUnauthorizedError(error)) {
        await clearLocalSession(true);
        return { success: false, error: "Session expired. Please login again." };
      }
      return { success: false, error: apiErrorToMessage(error, "Biometric login failed. Please try again or use password/OTP.") };
    }
  }, [attachSavedProviders, clearLocalSession]);

  const promptBiometricSetup = useCallback(async (phone: string, role?: AppUserRole) => {
    try {
      const remember = (await AsyncStorage.getItem(REMEMBER_KEY)) === "true";
      if (!remember) return;

      const normalizedRole = role || "customer";
      const [enabled, savedPhone, savedRole] = await Promise.all([
        isBiometricEnabled(),
        getBiometricPhone(),
        getBiometricRole(),
      ]);
      if (enabled && savedPhone === phone && savedRole === normalizedRole) return;

      const available = await isBiometricAvailable();
      if (!available) {
        await disableBiometric();
        return;
      }
      const result = await authenticateWithBiometric("Enable biometric login for faster sign in");
      if (!result.success) return;
      await enableBiometric(phone, normalizedRole);
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


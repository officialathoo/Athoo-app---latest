import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSecureItem, removeSecureItem, setSecureItem } from "@/services/secureSessionStorage";
import { getDeviceId } from "@/services/deviceIdentity";
import Constants from "expo-constants";
import { Platform } from "react-native";

// Native builds require an explicit API URL from deployment configuration.
// Web builds may use their own origin. No hosting vendor is embedded in code.
const DEFAULT_API_BASE_URL = "";
function sanitizeBaseUrl(value: string | undefined | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\/$/, "");
}

const ENV_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  Constants.expoConfig?.extra?.API_BASE_URL ||
  "";

function browserOriginIfAvailable(): string {
  if (Platform.OS !== "web") return "";
  if (typeof window === "undefined" || !window.location) return "";
  return sanitizeBaseUrl(window.location.origin);
}

const API_BASE_URL =
  sanitizeBaseUrl(ENV_API_BASE_URL) ||
  browserOriginIfAvailable() ||
  DEFAULT_API_BASE_URL;

const TOKEN_KEY = "athoo_token";
const REMEMBER_KEY = "athoo_remember_me";
const REFRESH_TOKEN_KEY = "athoo_refresh_token";

const POSSIBLE_TOKEN_KEYS = [
  "token",
  "authToken",
  "accessToken",
  "jwt",
  "sessionToken",
  "athoo_token",
  "athoo_auth_token",
];

const DEFAULT_TIMEOUT_MS = 20000;
const RETRYABLE_METHODS = new Set(["GET"]);

let _unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  _unauthorizedHandler = fn;
}

type RequestOptions = Omit<RequestInit, "body"> & {
  auth?: boolean;
  params?: Record<string, string | number | boolean | undefined | null>;
  body?: any;
  timeoutMs?: number;
};

// In-memory token cache so repeated reads (e.g. avatar lists rendering many
// PrivateImage components) don't hit AsyncStorage on every render.
let _cachedToken: string | null = null;
let _cachedRefreshToken: string | null = null;
let _refreshPromise: Promise<string | null> | null = null;

export async function getToken(): Promise<string | null> {
  if (_cachedToken) return _cachedToken;
  for (const key of POSSIBLE_TOKEN_KEYS) {
    try {
      const value = await getSecureItem(key);
      if (value) {
        _cachedToken = value;
        return value;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export async function setRefreshToken(token: string | null, remember = true): Promise<void> {
  _cachedRefreshToken = token;
  if (!token) {
    await removeSecureItem(REFRESH_TOKEN_KEY);
    return;
  }
  if (remember) await setSecureItem(REFRESH_TOKEN_KEY, token);
  else await removeSecureItem(REFRESH_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  if (_cachedRefreshToken) return _cachedRefreshToken;
  const token = await getSecureItem(REFRESH_TOKEN_KEY);
  _cachedRefreshToken = token;
  return token;
}

export async function setToken(token: string, remember = true): Promise<void> {
  _cachedToken = token;
  if (remember) await setSecureItem(TOKEN_KEY, token);
  else await removeSecureItem(TOKEN_KEY);
  await AsyncStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
}

export async function clearToken(): Promise<void> {
  _cachedToken = null;
  _cachedRefreshToken = null;
  for (const key of POSSIBLE_TOKEN_KEYS) {
    try {
      await removeSecureItem(key);
    } catch {
      // ignore
    }
  }
  try {
    await AsyncStorage.removeItem(REMEMBER_KEY);
    await removeSecureItem(REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  if (!API_BASE_URL) {
    throw new Error("ATHOO_API_NOT_CONFIGURED: Set EXPO_PUBLIC_API_BASE_URL for native builds.");
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${API_BASE_URL}${normalizedPath}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
}

function buildEventsUrl(token: string): string {
  const httpUrl = buildUrl("/api/ws/events");
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  return url.toString();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(error: unknown): boolean {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("timeout") ||
    message.includes("network error") ||
    message.includes("request timed out") ||
    message.includes("the request timed out")
  );
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function refreshAccessTokenOnce(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken || !API_BASE_URL) return null;
    try {
      const deviceId = await getDeviceId();
      const response = await fetchWithTimeout(buildUrl("/api/auth/refresh"), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-Athoo-Device-Id": deviceId },
        body: JSON.stringify({ refreshToken }),
      }, DEFAULT_TIMEOUT_MS);
      if (!response.ok) return null;
      const data = await response.json() as { token?: string; refreshToken?: string };
      if (!data.token || !data.refreshToken) return null;
      const remember = (await AsyncStorage.getItem(REMEMBER_KEY)) !== "false";
      await setToken(data.token, remember);
      await setRefreshToken(data.refreshToken, remember);
      return data.token;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    auth = false,
    params,
    headers,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    method = "GET",
    ...rest
  } = options;

  const deviceId = await getDeviceId();
  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    "X-Athoo-Device-Id": deviceId,
    ...(headers as Record<string, string> | undefined),
  };

  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = await getToken();
    if (token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const url = buildUrl(path, params);
  const upperMethod = String(method).toUpperCase();
  const maxAttempts = RETRYABLE_METHODS.has(upperMethod) ? 2 : 1;

  let lastError: unknown = null;
  let refreshedAfterUnauthorized = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          ...rest,
          method: upperMethod,
          headers: finalHeaders,
          body: body instanceof FormData || body === undefined ? body : JSON.stringify(body),
        },
        timeoutMs
      );

      const raw = await response.text();
      let data: any = {};

      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = raw;
      }

      if (!response.ok) {
        // Only trigger logout when the call itself required authentication.
        // Unauthenticated endpoints returning 401 (e.g. wrong credentials) must
        // NOT force the current user out.
        if (response.status === 401 && auth && !refreshedAfterUnauthorized) {
          const renewedToken = await refreshAccessTokenOnce();
          if (renewedToken) {
            finalHeaders.Authorization = `Bearer ${renewedToken}`;
            refreshedAfterUnauthorized = true;
            attempt -= 1;
            continue;
          }
        }
        if (response.status === 401 && auth) {
          _unauthorizedHandler?.();
        }
        const errorValue = typeof data === "object" && data !== null ? data?.error : null;
        const errorMessage =
          (typeof errorValue === "string" ? errorValue : errorValue?.message) ||
          (typeof data === "object" && data !== null && typeof data?.message === "string" ? data.message : "") ||
          `Request failed (${response.status})`;
        const errorCode =
          (typeof errorValue === "object" && errorValue !== null && typeof errorValue.code === "string" ? errorValue.code : "") ||
          (typeof data === "object" && data !== null && typeof data?.code === "string" ? data.code : "");
        const safeError = new Error(String(errorMessage).slice(0, 300));
        Object.assign(safeError, { status: response.status, code: errorCode || undefined });
        throw safeError;
      }

      return data as T;
    } catch (error) {
      lastError = error;

      const shouldRetry =
        attempt < maxAttempts && isRetryableNetworkError(error);

      if (!shouldRetry) {
        break;
      }

      await delay(1200);
    }
  }

  throw lastError;
}

export type PublicPolicySummary = {
  slug: string;
  title: string;
  titleUr?: string | null;
  summary?: string | null;
  summaryUr?: string | null;
  version: string;
  audience: "all" | "customer" | "provider";
  requiresAcceptance: boolean;
  publishedAt?: string | null;
  updatedAt?: string | null;
};

export type PublicPolicyDocument = PublicPolicySummary & {
  bodyEn: string;
  bodyUr?: string | null;
  isPublished?: boolean;
};

export const api = {
  async createPurposeToken(purpose: "realtime" | "object-read") { return request<{ token: string; expiresInSeconds: number }>("/api/auth/purpose-token", { method: "POST", auth: true, body: { purpose } }); },
  baseUrl: API_BASE_URL,
  isConfigured: Boolean(API_BASE_URL),
  configurationError: API_BASE_URL ? null : "The app cannot connect because its API address is not configured. Install the latest build or contact support.",

  request<T = any>(path: string, options: RequestOptions = {}) {
    return request<T>(path, options);
  },

  // Auth
  sendOtp(phone: string, purpose: "login" | "registration", role: "customer" | "provider", email?: string) {
    return request<{
      success: boolean;
      code?: string;
      message?: string;
      purpose?: "login" | "registration";
      expiresInSeconds?: number;
      resendAfterSeconds?: number;
      emailSent?: boolean;
      whatsappSent?: boolean;
    }>("/api/auth/send-otp", {
      method: "POST",
      body: { phone, purpose, role, ...(email ? { email } : {}) },
    });
  },

  verifyOtp(phone: string, code: string, purpose: "login" | "registration", role: "customer" | "provider") {
    return request<{
      success: boolean;
      purpose?: "login" | "registration";
      token?: string | null;
      refreshToken?: string;
      registrationToken?: string;
      expiresInSeconds?: number;
      user?: any;
      isNewUser?: boolean;
    }>(
      "/api/auth/verify-otp",
      {
        method: "POST",
        body: { phone, code, purpose, role },
      }
    );
  },

  sendEmailOtp(email: string, role: "customer" | "provider") {
    return request<{
      success: boolean;
      code?: string;
      message?: string;
      maskedEmail?: string;
      expiresInSeconds?: number;
      resendAfterSeconds?: number;
    }>("/api/auth/email/send-otp", {
      method: "POST",
      body: { email, role },
    });
  },

  verifyEmailOtp(email: string, code: string, role: "customer" | "provider") {
    return request<{
      success: boolean;
      token?: string;
      refreshToken?: string;
      expiresInSeconds?: number;
      user?: any;
    }>("/api/auth/email/verify-otp", {
      method: "POST",
      body: { email, code, role },
    });
  },

  register(payload: {
    name: string;
    phone: string;
    email?: string;
    role: string;
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
  }) {
    return request<{
      success: boolean;
      token?: string;
      refreshToken?: string;
      expiresInSeconds?: number;
      user?: any;
      emailVerificationRequired?: boolean;
      emailVerificationSent?: boolean;
      emailVerificationExpiresInSeconds?: number;
      emailVerificationResendAfterSeconds?: number;
      emailVerificationCode?: string;
    }>("/api/auth/register", {
      method: "POST",
      body: payload,
    });
  },

  acceptCurrentLegal() {
    // Server is authoritative on legal version — no body needed.
    return request<{ success: boolean; user?: Record<string, unknown>; legalVersion?: string }>(
      "/api/me/legal-accept",
      { method: "POST", auth: true },
    );
  },

  loginWithPassword(payload: { identifier: string; password: string; role: "customer" | "provider" }) {
    return request<{ success: boolean; token?: string; refreshToken?: string; expiresInSeconds?: number; user?: any }>("/api/auth/login", {
      method: "POST",
      body: payload,
    });
  },

  refreshSession(refreshToken: string) {
    return request<{ success: boolean; token: string; refreshToken: string; expiresInSeconds: number; user?: any }>("/api/auth/refresh", { method: "POST", body: { refreshToken } });
  },

  logoutSession() {
    return request<{ success: boolean }>("/api/auth/logout", { method: "POST", auth: true });
  },

  savePushToken(expoPushToken: string) {
    return request<{ success: boolean }>("/api/auth/push-token", {
      method: "PATCH",
      auth: true,
      body: { expoPushToken },
    });
  },

  getMe() {
    return request<{ user: any | null }>("/api/auth/me", {
      method: "GET",
      auth: true,
    });
  },

  getEmailVerificationStatus() {
    return request<{ email?: string | null; verified: boolean; canVerify: boolean }>("/api/me/email/verification/status", {
      method: "GET",
      auth: true,
    });
  },

  sendEmailVerification() {
    return request<{ success: boolean; code?: string; alreadyVerified?: boolean; expiresInSeconds?: number; resendAfterSeconds?: number }>("/api/me/email/verification/send", {
      method: "POST",
      auth: true,
    });
  },

  verifyEmailVerification(code: string) {
    return request<{ success: boolean; alreadyVerified?: boolean; user?: any }>("/api/me/email/verification/verify", {
      method: "POST",
      auth: true,
      body: { code },
    });
  },

  getEmailPreferences() {
    return request<{ preferences: { bookingUpdates: boolean; accountUpdates: boolean; productUpdates: boolean; marketingEmails: boolean; marketingConsentAt?: string | null; unsubscribedAt?: string | null } }>("/api/me/email/preferences", {
      method: "GET",
      auth: true,
    });
  },

  updateEmailPreferences(patch: Partial<{ bookingUpdates: boolean; accountUpdates: boolean; productUpdates: boolean; marketingEmails: boolean }>) {
    return request<{ preferences: any }>("/api/me/email/preferences", {
      method: "PATCH",
      auth: true,
      body: patch,
    });
  },

  getUser(userId: string) {
    return request<{ user: any }>(`/api/auth/users/${userId}`, {
      method: "GET",
      auth: true,
    });
  },

  updateMe(payload: Record<string, any>) {
    return request<{ user: any }>("/api/auth/me", {
      method: "PATCH",
      auth: true,
      body: payload,
    });
  },

  setBiometricPreference(payload: { enabled: boolean; password?: string }) {
    return request<{ success: boolean; user: any }>("/api/auth/biometric-preference", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  getDocuments() {
    return request<{ documents: any[] }>("/api/me/documents", { method: "GET", auth: true });
  },

  postDocument(payload: { type: string; label?: string; url: string }) {
    return request<{ document: any; verificationStatus?: string }>("/api/me/documents", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  deleteDocument(docId: string) {
    return request<{ success: boolean }>(`/api/me/documents/${docId}`, { method: "DELETE", auth: true });
  },

  async switchRole(role?: "customer" | "provider") {
    try {
      return await request<{ token?: string; user?: any }>("/api/auth/switch-role", {
        method: "POST",
        auth: true,
        body: role ? { role } : undefined,
      });
    } catch (error: any) {
      const message = String(error?.message || "");
      if (
        message.includes("PROVIDER_PROFILE_REQUIRED") ||
        message.toLowerCase().includes("provider account yet")
      ) {
        throw new Error("PROVIDER_PROFILE_REQUIRED");
      }
      if (
        message.includes("Cannot POST /api/auth/switch-role") ||
        Number(error?.status) === 404
      ) {
        throw new Error(
          "Role switch backend is not deployed yet. Update your backend on Render, then try again."
        );
      }
      throw error;
    }
  },

  setPassword(payload: { currentPassword?: string; newPassword: string }) {
    return request<{ success: boolean; user?: any }>("/api/auth/set-password", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  // Providers
  getProviders(serviceId?: string) {
    return request<{ providers: any[] }>("/api/providers", {
      params: { serviceId },
      method: "GET",
    });
  },

  getSavedProviders() {
    return request<{ providers: any[]; ids: string[] }>("/api/me/saved-providers", {
      method: "GET",
      auth: true,
    });
  },

  saveProvider(providerId: string) {
    return request<{ success: boolean; providerId: string }>(`/api/me/saved-providers/${providerId}`, {
      method: "POST",
      auth: true,
    });
  },

  removeSavedProvider(providerId: string) {
    return request<{ success: boolean }>(`/api/me/saved-providers/${providerId}`, {
      method: "DELETE",
      auth: true,
    });
  },

  getProvider(providerId: string) {
    return request<{ provider: any }>(`/api/providers/${providerId}`, {
      method: "GET",
    });
  },

  getProviderReviews(providerId: string) {
    return request<{ reviews: any[] }>(`/api/providers/${providerId}/reviews`, {
      method: "GET",
    });
  },

  getProviderDashboard() {
    return request<{ dashboard: any }>("/api/providers/dashboard", {
      method: "GET",
      auth: true,
    });
  },

  updateAvailability(isAvailable: boolean) {
    return request<{ user: any }>("/api/providers/availability", {
      method: "PATCH",
      auth: true,
      body: { isAvailable },
    });
  },

  updateProviderLocation(data: { latitude: number; longitude: number; accuracy?: number | null }) {
    return request<{ success: boolean; user: any }>("/api/providers/location", {
      method: "PATCH",
      auth: true,
      body: data,
      timeoutMs: 10_000,
    });
  },

  getServiceRadius() {
    return request<{ maxTravelDistanceKm: number }>("/api/providers/service-radius", {
      method: "GET",
      auth: true,
    });
  },

  updateServiceRadius(maxTravelDistanceKm: number) {
    return request<{ maxTravelDistanceKm: number; user: any }>("/api/providers/service-radius", {
      method: "PATCH",
      auth: true,
      body: { maxTravelDistanceKm },
    });
  },

  getSchedule() {
    return request<{ schedule: Record<string, { enabled: boolean; startTime: string; endTime: string }> }>("/api/me/schedule", {
      method: "GET",
      auth: true,
    });
  },

  updateSchedule(schedule: Record<string, { enabled: boolean; startTime: string; endTime: string }>) {
    return request<{ schedule: Record<string, { enabled: boolean; startTime: string; endTime: string }> }>("/api/me/schedule", {
      method: "PATCH",
      auth: true,
      body: schedule,
    });
  },

  // Bookings
  getBookings() {
    return request<{ bookings: any[] }>("/api/bookings", {
      method: "GET",
      auth: true,
    });
  },

  createBooking(payload: any) {
    return request<{ booking: any }>("/api/bookings", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  async getBooking(id: string) {
    try {
      return await request<{ booking: any }>(`/api/bookings/${id}`, {
        method: "GET",
        auth: true,
      });
    } catch (error: any) {
      const message = String(error?.message || "");
      const looksLikeMissingRoute =
        message.includes("Cannot GET /api/bookings/") || message.includes("[404");

      if (!looksLikeMissingRoute) {
        throw error;
      }

      const fallback = await request<{ bookings: any[] }>("/api/bookings", {
        method: "GET",
        auth: true,
      });

      const booking = (fallback.bookings || []).find(
        (item: any) => String(item?.id) === String(id)
      );
      if (!booking) {
        throw error;
      }

      return { booking };
    }
  },

  updateBookingStatus(id: string, status: string, price?: number) {
    return request<{ booking: any }>(`/api/bookings/${id}/status`, {
      method: "PATCH",
      auth: true,
      body: price !== undefined ? { status, price } : { status },
    });
  },

  markProviderArrived(id: string) {
    return request<{ booking: any }>(`/api/bookings/${id}/arrived`, {
      method: "POST",
      auth: true,
    });
  },

  updateCustomerLocation(id: string, lat: number, lng: number, address?: string) {
    return request<{ booking: any }>(`/api/bookings/${id}/customer-location`, {
      method: "PATCH",
      auth: true,
      body: { lat, lng, ...(address ? { address } : {}) },
    });
  },

  updateBookingLiveLocation(
    id: string,
    payload: {
      providerLat: number;
      providerLng: number;
      providerAccuracy?: number | null;
    }
  ) {
    return request<{ booking: any }>(`/api/bookings/${id}/live-location`, {
      method: "PATCH",
      auth: true,
      body: payload,
    });
  },

  rateBooking(id: string, rating: number, review: string) {
    return request<{ booking: any }>(`/api/bookings/${id}/rate`, {
      method: "PATCH",
      auth: true,
      body: { rating, review },
    });
  },

  markBookingPaid(id: string) {
    return request<{ booking: any }>(`/api/bookings/${id}/mark-paid`, {
      method: "POST",
      auth: true,
    });
  },

  markBookingReceived(id: string) {
    return request<{ booking: any }>(`/api/bookings/${id}/mark-received`, {
      method: "POST",
      auth: true,
    });
  },

  generateStartPin(id: string) {
    return request<{ booking: any; pinPrepared?: boolean }>(
      `/api/bookings/${id}/generate-start-pin`,
      {
        method: "POST",
        auth: true,
      }
    );
  },

  verifyStartPin(id: string, pin: string) {
    return request<{ booking: any }>(`/api/bookings/${id}/verify-start-pin`, {
      method: "POST",
      auth: true,
      body: { pin },
    });
  },

  generateCompletePin(id: string) {
    return request<{ booking: any; pinPrepared?: boolean }>(
      `/api/bookings/${id}/generate-complete-pin`,
      {
        method: "POST",
        auth: true,
      }
    );
  },

  verifyCompletePin(id: string, pin: string) {
    return request<{ booking: any }>(`/api/bookings/${id}/verify-complete-pin`, {
      method: "POST",
      auth: true,
      body: { pin },
    });
  },

  // Chat
  getChats(params: { cursor?: string; limit?: number } = {}) {
    return request<{ chats: any[]; hasMore?: boolean; nextCursor?: string | null }>("/api/chat", { method: "GET", auth: true, params });
  },

  getMessages(chatId: string, since?: string, limit?: number) {
    return request<{ messages: any[] }>(`/api/chat/${chatId}/messages`, {
      method: "GET",
      auth: true,
      params: { since, limit },
    });
  },

  getOrCreateChat(payload: {
    otherUserId: string;
    otherUserName: string;
    myName: string;
    bookingId?: string;
    service?: string;
  }) {
    return request<{ chat: any }>("/api/chat", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  async sendMessage(chatId: string, text: string, clientMessageId: string) {
    const payload = { text, clientMessageId };
    try {
      return await request<{ message: any; duplicate?: boolean }>(`/api/chat/${chatId}/messages`, {
        method: "POST", auth: true, body: payload,
      });
    } catch (error) {
      // Retry once with the same idempotency key. If the first request reached
      // the server but its response was lost, the API returns the original row.
      await new Promise((resolve) => setTimeout(resolve, 400));
      return request<{ message: any; duplicate?: boolean }>(`/api/chat/${chatId}/messages`, {
        method: "POST", auth: true, body: payload,
      });
    }
  },

  markChatRead(chatId: string) {
    return request<{ success: boolean }>(`/api/chat/${chatId}/read`, {
      method: "POST",
      auth: true,
    });
  },

  deleteChat(chatId: string) {
    return request<{ success: boolean; message: string }>(`/api/chat/${chatId}`, {
      method: "DELETE",
      auth: true,
    });
  },

  // Negotiations
  getNegotiations() {
    return request<{ negotiations: any[] }>("/api/negotiations", {
      method: "GET",
      auth: true,
    });
  },

  async createNegotiation(payload: {
    providerId: string;
    providerName: string;
    customerName: string;
    service: string;
    customerOffer: number;
    address?: string;
    latitude?: number;
    longitude?: number;
    scheduledDate?: string;
    scheduledTime?: string;
    mediaUrls?: string[];
    clientRequestId: string;
  }) {
    try {
      return await request<{ negotiation: any; duplicate?: boolean }>("/api/negotiations", {
        method: "POST", auth: true, body: payload,
      });
    } catch (error) {
      const message = String((error as any)?.message || "").toLowerCase();
      const retryable = message.includes("network") || message.includes("timeout") || message.includes("fetch");
      if (!retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
      return request<{ negotiation: any; duplicate?: boolean }>("/api/negotiations", {
        method: "POST", auth: true, body: payload,
      });
    }
  },

  counterBooking(bookingId: string, amount: number, message: string) {
    return request<{ negotiation: any }>(`/api/bookings/${bookingId}/counter`, {
      method: "POST",
      auth: true,
      body: { amount, message },
    });
  },

  counterOffer(id: string, amount: number, message: string, senderName: string) {
    return request<{ negotiation: any }>(`/api/negotiations/${id}/counter`, {
      method: "PATCH",
      auth: true,
      body: { amount, message, senderName },
    });
  },

  acceptOffer(id: string) {
    return request<{ negotiation: any; bookingId?: string | null }>(`/api/negotiations/${id}/accept`, {
      method: "PATCH",
      auth: true,
    });
  },

  rejectOffer(id: string) {
    return request<{ negotiation: any }>(`/api/negotiations/${id}/reject`, {
      method: "PATCH",
      auth: true,
    });
  },

  // Calls
  getIncomingCall() {
    return request<{ call: any | null }>("/api/calls/incoming", {
      method: "GET",
      auth: true,
    });
  },

  getCallConfig() {
    return request<{
      provider: string;
      productionReady: boolean;
      hasTurn: boolean;
      warning: string | null;
      iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
      audio: { preferredCodec: string; fallbackChunkMs: number };
    }>("/api/calls/config", { method: "GET", auth: true });
  },

  startCall(payload: {
    receiverId: string;
    callerName: string;
    callerInitials?: string;
    callerColor?: string;
    service?: string;
    offer?: string;
  }) {
    return request<{ call: any }>("/api/calls", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  getCallStatus(callId: string) {
    return request<{ call: any }>(`/api/calls/${callId}/status`, {
      method: "GET",
      auth: true,
    });
  },

  acceptCall(callId: string, payload?: { answer?: string }) {
    return request<{ call: any }>(`/api/calls/${callId}/accept`, {
      method: "PATCH",
      auth: true,
      body: payload || {},
    });
  },

  rejectCall(callId: string) {
    return request<{ success: boolean }>(`/api/calls/${callId}/reject`, {
      method: "PATCH",
      auth: true,
    });
  },

  endCall(callId: string) {
    return request<{ success: boolean }>(`/api/calls/${callId}/end`, {
      method: "PATCH",
      auth: true,
    });
  },

  addIceCandidate(callId: string, candidate: any, role: "caller" | "callee") {
    return request<{ success: boolean }>(`/api/calls/${callId}/ice-candidate`, {
      method: "POST",
      auth: true,
      body: { candidate, role },
    });
  },

  uploadAudioChunk(callId: string, data: string, ext: string) {
    return request<{ index: number }>(`/api/calls/${callId}/audio`, {
      method: "POST",
      auth: true,
      body: { data, ext },
    });
  },

  fetchAudioChunks(callId: string, from = 0) {
    return request<
      { chunks: { index: number; data: string; ext: string }[] }[] |
      { chunks: { index: number; data: string; ext: string }[] }
    >(`/api/calls/${callId}/audio`, {
      method: "GET",
      auth: true,
      params: { from },
    });
  },

  getAddresses() {
    return request<{ addresses: any[] }>("/api/addresses", { method: "GET", auth: true });
  },

  addAddress(data: { label: string; address: string; icon?: string; latitude?: number | null; longitude?: number | null }) {
    return request<{ address: any }>("/api/addresses", { method: "POST", auth: true, body: data });
  },

  setDefaultAddress(id: string) {
    return request<{ addresses: any[] }>(`/api/addresses/${id}/default`, { method: "PATCH", auth: true });
  },

  deleteAddress(id: string) {
    return request<{ addresses: any[] }>(`/api/addresses/${id}`, { method: "DELETE", auth: true });
  },


  // Support
  createSupportTicket(payload: { subject: string; message: string; bookingId?: string | null; priority?: string; mediaUrls?: string[] }) {
    return request<{ ticket: any }>("/api/support", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  submitComplaint(payload: { subject?: string; title?: string; message?: string; description?: string; bookingId?: string | null; priority?: string; mediaUrls?: string[] }) {
    return request<{ ticket: any }>("/api/support", {
      method: "POST",
      auth: true,
      body: {
        subject: payload.subject || payload.title,
        message: payload.message || payload.description,
        bookingId: payload.bookingId || null,
        priority: payload.priority || "normal",
        mediaUrls: payload.mediaUrls || [],
      },
    });
  },

  getMySupportTickets() {
    return request<{ tickets: any[] }>("/api/support/my", {
      method: "GET",
      auth: true,
    });
  },

  getSupportTicketDetail(ticketId: string) {
    return request<{ ticket: any; replies: any[] }>(`/api/support/${ticketId}`, {
      method: "GET",
      auth: true,
    });
  },

  getNotifications(params: { cursor?: string; limit?: number } = {}) {
    return request<{ notifications: any[]; unread?: number; hasMore?: boolean; nextCursor?: string | null }>("/api/me/notifications", {
      method: "GET",
      auth: true,
      params,
    });
  },

  markNotificationRead(id: string) {
    return request<{ success: boolean }>(`/api/me/notifications/${id}/read`, {
      method: "PATCH",
      auth: true,
    });
  },

  markAllNotificationsRead() {
    return request<{ success: boolean }>("/api/me/notifications/read-all", {
      method: "POST",
      auth: true,
    });
  },

  deleteNotification(id: string) {
    return request<{ success: boolean }>(`/api/me/notifications/${id}`, {
      method: "DELETE",
      auth: true,
    });
  },

  deleteAllNotifications() {
    return request<{ success: boolean }>("/api/me/notifications", {
      method: "DELETE",
      auth: true,
    });
  },

  chatbot(message: string) {
    return request<{ reply: string; role: string }>("/api/chatbot", {
      method: "POST",
      auth: true,
      body: { message },
    });
  },

  registerPushToken(expoPushToken: string, _platform?: string) {
    return request<{ success: boolean; registered: boolean }>("/api/auth/push-token", {
      method: "PATCH",
      auth: true,
      body: { expoPushToken },
    });
  },

  // ────────────────── Categories ──────────────────
  getCategories() {
    return request<{ categories: any[] }>("/api/categories", { method: "GET" });
  },

  // ────────────────── Payments / Commission ──────────────────
  getPublicSettings() {
    return request<{ settings: any }>("/api/settings/public", { method: "GET" });
  },

  getPaymentAccounts() {
    return request<{ accounts: any[] }>("/api/payments/accounts", { method: "GET", auth: true });
  },
  getMyPayments() {
    return request<{ payments: any[]; pendingCommission: number; reservedCommission: number; availableToSubmit: number }>("/api/payments/me", {
      method: "GET",
      auth: true,
    });
  },
  submitCommissionPayment(payload: {
    amount: number;
    accountId?: string | null;
    reference?: string;
    screenshotUrl?: string;
    note?: string;
    clientRequestId: string;
  }) {
    return request<{ payment: any }>("/api/payments", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  // ────────────────── Account self-service ──────────────────
  updateAccountProfile(payload: Record<string, any>) {
    return request<{ user: any }>("/api/me/account/profile", {
      method: "PATCH",
      auth: true,
      body: payload,
    });
  },
  changePassword(payload: { currentPassword: string; newPassword: string }) {
    return request<{ success: boolean }>("/api/me/account/password", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },
  deactivateAccount(payload: { password?: string } = {}) {
    return request<{ success: boolean }>("/api/me/account/deactivate", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },
  /** @deprecated Use deactivateAccount. */
  deactivateMe(password?: string) {
    return this.deactivateAccount(password ? { password } : {});
  },
  reactivateAccount() {
    return request<{ success: boolean }>("/api/me/account/reactivate", {
      method: "POST",
      auth: true,
    });
  },
  requestAccountDeletion(payload: { reason?: string; password?: string } = {}) {
    return request<{ scheduledDeleteAt: string }>("/api/me/account/delete-request", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },
  cancelAccountDeletion() {
    return request<{ success: boolean }>("/api/me/account/delete-request/cancel", {
      method: "POST",
      auth: true,
    });
  },

  /** @deprecated Use requestAccountDeletion. Kept for older profile/privacy screens. */
  deleteMe() {
    return this.requestAccountDeletion();
  },
  requestEmailChange(newEmail: string) {
    return request<{ success: boolean; code?: string }>("/api/me/account/email/request", {
      method: "POST",
      auth: true,
      body: { newEmail },
    });
  },
  verifyEmailChange(newEmail: string, code: string) {
    return request<{ success: boolean; email?: string; emailVerified?: boolean; signedOut?: boolean }>("/api/me/account/email/verify", {
      method: "POST",
      auth: true,
      body: { newEmail, code },
    });
  },
  requestPhoneChange(newPhone: string) {
    return request<{ success: boolean; code?: string }>("/api/me/account/phone/request", {
      method: "POST",
      auth: true,
      body: { newPhone },
    });
  },
  verifyPhoneChange(code: string) {
    return request<{ success: boolean }>("/api/me/account/phone/verify", {
      method: "POST",
      auth: true,
      body: { code },
    });
  },
  requestServiceAdd(payload: {
    serviceName: string;
    serviceCategoryId?: string;
    documents?: Array<{ type: string; url: string; label?: string }>;
    note?: string;
  }) {
    return request<{ requestId: string }>("/api/me/account/services/request", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },
  getMyServiceRequests() {
    return request<{ requests: any[] }>("/api/me/account/services/requests", {
      method: "GET",
      auth: true,
    });
  },
  requestRateChange(payload: { service: string; requestedRate: number; reason?: string }) {
    return request<{ rateRequest: any }>("/api/me/rate-requests", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },
  getMyRateRequests() {
    return request<{ requests: any[] }>("/api/me/rate-requests", {
      method: "GET",
      auth: true,
    });
  },

  // ────────────────── Subscriptions / Premium ──────────────────
  getSubscriptionPlans(audience?: "provider" | "customer") {
    return request<{ plans: any[] }>("/api/subscriptions/plans", {
      method: "GET",
      params: audience ? { audience } : undefined,
    });
  },
  getMySubscription() {
    return request<{ active: any | null; history: any[] }>(
      "/api/subscriptions/me",
      { method: "GET", auth: true }
    );
  },
  subscribeToPlan(payload: {
    planId: string;
    billingPeriod: "monthly" | "yearly";
    paymentReference?: string;
    screenshotUrl?: string;
    accountId?: string | null;
    clientRequestId: string;
  }) {
    return request<{ subscriptionId: string; duplicate?: boolean }>("/api/subscriptions/subscribe", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },
  cancelMySubscription() {
    return request<{ success: boolean }>("/api/subscriptions/cancel", {
      method: "POST",
      auth: true,
    });
  },

  createBroadcastRequest(payload: {
    service: string;
    serviceLabel: string;
    serviceIcon?: string;
    description?: string;
    videoUrl?: string;
    address: string;
    latitude?: number;
    longitude?: number;
    scheduledDate: string;
    scheduledTime: string;
    customerOffer?: number;
    travellingCharge?: number;
    clientRequestId: string;
  }) {
    return request<{
      request: any;
      duplicate?: boolean;
      delivery?: {
        candidateCount: number;
        matchedCount: number;
        inAppCreated: number;
        pushTokenCount: number;
        pushAccepted: number;
        pushFailed: number;
        expansionQueued: boolean;
        skippedByReason: Record<string, number>;
      };
    }>("/api/broadcast", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  /**
   * Upload a video file using the backend's portable storage instructions.
   * Cloudinary returns a final HTTPS URL. GCS-compatible providers return an
   * internal /objects path after PUT upload.
   */
  async uploadVideo(localUri: string): Promise<string> {
    const { uploadPickedImage } = await import("@/services/storage");
    return uploadPickedImage(localUri, "booking-video.mp4", "video/mp4", undefined, "shared");
  },

  getBroadcastRequests(params?: { status?: string; service?: string }) {
    return request<{ requests: any[] }>("/api/broadcast", {
      method: "GET",
      auth: true,
      params,
    });
  },

  getBroadcastRequest(id: string) {
    return request<{ request: any }>(`/api/broadcast/${id}`, {
      method: "GET",
      auth: true,
    });
  },

  respondToBroadcast(requestId: string, payload: { providerOffer?: number; providerTravellingCharge?: number; message?: string }) {
    return request<{ response: any }>(`/api/broadcast/${requestId}/respond`, {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  withdrawBroadcastResponse(requestId: string) {
    return request<{ success: boolean }>(`/api/broadcast/${requestId}/respond/withdraw`, {
      method: "POST",
      auth: true,
    });
  },

  selectBroadcastResponse(requestId: string, responseId: string) {
    return request<{ booking: any }>(`/api/broadcast/${requestId}/select/${responseId}`, {
      method: "POST",
      auth: true,
    });
  },

  cancelBroadcastRequest(requestId: string) {
    return request<{ success: boolean }>(`/api/broadcast/${requestId}/cancel`, {
      method: "POST",
      auth: true,
    });
  },

  // Withdrawals (provider)
  getMyWithdrawals() {
    return request<{ withdrawals: any[] }>("/api/withdrawals/me", {
      method: "GET",
      auth: true,
    });
  },

  requestWithdrawal(payload: { amount: number; accountTitle: string; accountNumber: string; bankName?: string; iban?: string; note?: string; clientRequestId: string }) {
    return request<{ withdrawal: any }>("/api/withdrawals", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  // Refunds (customer)
  getMyRefunds() {
    return request<{ refunds: any[] }>("/api/refunds/me", {
      method: "GET",
      auth: true,
    });
  },

  requestRefund(payload: { bookingId: string; reason: string; amountRequested: number; evidenceUrl?: string; clientRequestId: string }) {
    return request<{ refund: any; duplicate?: boolean }>("/api/refunds", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  // Promotions
  validatePromo(code: string, bookingValue?: number) {
    return request<{ promo?: { id: string; code: string; description: string | null; discountType: "fixed" | "percent"; discountValue: number }; discount?: number; finalAmount?: number; valid?: boolean; promotion?: any; error?: string }>("/api/promotions/validate", {
      method: "POST",
      auth: true,
      body: { code, bookingValue: bookingValue ?? 0 },
    });
  },

  redeemPromo(code: string, bookingId?: string) {
    return request<{ success: boolean; discount?: number }>("/api/promotions/redeem", {
      method: "POST",
      auth: true,
      body: { code, bookingId },
    });
  },

  // ────────────────── Marketing / CMS ──────────────────
  getCustomerHomeConfig() {
    return request<{ config: {
      id: string;
      locationLabel: string;
      showBroadcastCta: boolean;
      showPlatformStats: boolean;
      showTopProviders: boolean;
      showEmergencyContacts: boolean;
      maxCategories: number;
      maxProviders: number;
    } }>("/api/marketing/home-config", { method: "GET" });
  },

  getPolicies(audience: "customer" | "provider" | "all" = "all") {
    return request<{ policies: PublicPolicySummary[] }>("/api/policies", {
      method: "GET",
      params: { audience },
    });
  },

  getPolicy(slug: string) {
    return request<{ policy: PublicPolicyDocument }>(`/api/policies/${encodeURIComponent(slug)}`, {
      method: "GET",
    });
  },

  getMarketingBanners(audience: "customer" | "provider" = "customer") {
    return request<{
      banners: Array<{
        id: string;
        title: string;
        subtitle?: string | null;
        imageUrl?: string | null;
        bgColorFrom: string;
        bgColorTo: string;
        iconName: string;
        linkType: string;
        linkTarget?: string | null;
        targetAudience: string;
        sortOrder: number;
      }>;
    }>(`/api/marketing/banners?audience=${audience}`, { method: "GET" });
  },

  getAnnouncements(audience: "customer" | "provider" = "customer") {
    return request<{
      announcements: Array<{
        id: string;
        title: string;
        message: string;
        buttonText: string;
        buttonLink?: string | null;
        imageUrl?: string | null;
        showOnce: boolean;
        priority: number;
      }>;
    }>(`/api/marketing/announcements?audience=${audience}`, { method: "GET" });
  },

  getFaqs(audience: "customer" | "provider" = "customer") {
    return request<{
      faqs: Array<{
        id: string;
        question: string;
        answer: string;
        category: string;
        sortOrder: number;
      }>;
    }>(`/api/marketing/faqs?audience=${audience}`, { method: "GET" });
  },

  getServiceAreas() {
    return request<{ areas: Array<{ id: string; name: string; province?: string | null }> }>(
      "/api/service-areas",
      { method: "GET" }
    );
  },

  getEmergencyContacts() {
    return request<{
      contacts: Array<{
        id: string;
        name: string;
        number: string;
        description?: string | null;
        icon: string;
        sortOrder: number;
      }>;
    }>("/api/emergency-contacts", { method: "GET" });
  },

  reportIssue(body: {
    bookingId?: string;
    reportedId?: string;
    reportedName?: string;
    category: string;
    description: string;
  }) {
    return request<{ report: { id: string; status: string } }>(
      "/api/report-issues",
      { method: "POST", auth: true, body }
    );
  },

  getPlatformStats() {
    return request<{ providerCount: number; categoryCount: number; avgRating: number }>(
      "/api/providers/stats",
      { method: "GET" }
    );
  },

  getActiveServiceAreas() {
    return request<{ areas: Array<{ id: string; name: string; province?: string | null; isActive: boolean }> }>(
      "/api/service-areas",
      { method: "GET" }
    );
  },

  adminBroadcastPush(body: { title: string; body: string; audience: "all" | "customer" | "provider" }) {
    return request<{ sent: number; tokenCount: number; audience: string }>(
      "/api/admin/broadcast-push",
      { method: "POST", auth: true, body }
    );
  },

  getInvoices() {
    return request<{
      invoices: Array<{
        id: string;
        invoiceNumber: string;
        bookingId: string;
        customerId: string;
        providerId: string;
        customerName: string;
        providerName: string;
        service: string;
        address: string;
        scheduledDate: string;
        scheduledTime: string;
        subtotal: number;
        visitCharge: number;
        platformFee: number;
        discountAmount: number;
        totalAmount: number;
        commissionAmount: number;
        providerAmount: number;
        status: string;
        createdAt: string;
      }>;
    }>("/api/invoices", { method: "GET", auth: true });
  },
};

export type RealtimeEventName =
  | "booking:new"
  | "booking:updated"
  | "booking:status"
  | "booking:arrived"
  | "booking:started"
  | "booking:completed"
  | "booking:cancelled"
  | "booking:location"
  | "negotiation:new"
  | "negotiation:updated"
  | "negotiation:accepted"
  | "negotiation:rejected"
  | "chat:message"
  | "call:incoming"
  | "call:accepted"
  | "call:rejected"
  | "call:ended"
  | "notification:new"
  | "notification:push-failed"
  | "broadcast:new"
  | "broadcast:response"
  | "broadcast:accepted"
  | "broadcast:selected"
  | "broadcast:rejected"
  | "broadcast:cancelled";

type RealtimeMessage = { type: RealtimeEventName | string; payload: any };
type Listener = (msg: RealtimeMessage) => void;

let realtimeSocket: WebSocket | null = null;
let realtimeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let realtimeShouldReconnect = false;
let realtimeReconnectAttempts = 0;
const REALTIME_MAX_BACKOFF_MS = 30_000; // cap at 30s
const realtimeListeners = new Set<Listener>();

function realtimeBackoffMs(): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
  return Math.min(1000 * Math.pow(2, realtimeReconnectAttempts), REALTIME_MAX_BACKOFF_MS);
}

async function openRealtimeSocket(): Promise<void> {
  const accessToken = await getToken();
  if (!accessToken) return;
  try {
    const { token } = await api.createPurposeToken("realtime");
    const ws = new WebSocket(buildEventsUrl(token));
    realtimeSocket = ws;
    ws.onopen = () => {
      // Reset backoff on successful connection
      realtimeReconnectAttempts = 0;
    };
    ws.onmessage = (evt: MessageEvent) => {
      try {
        const data = typeof evt.data === "string" ? evt.data : "";
        if (!data) return;
        const raw = JSON.parse(data) as any;
        // Backend eventBus sends { event, payload, ts } while older app code
        // listened for { type, payload }. Normalize here so every existing
        // screen/context receives realtime events reliably. This fixes provider
        // broadcast alerts not opening when the websocket is connected.
        const parsed: RealtimeMessage = {
          type: raw?.type || raw?.event,
          payload: raw?.payload,
        };
        if (!parsed || !parsed.type) return;
        // React Native WebSocket implementations do not always preserve custom
        // close codes. The server sends auth:error before closing, so react to
        // that event immediately to guarantee replaced devices are logged out.
        if (parsed.type === "auth:error") {
          const reason = String(parsed.payload?.reason || "").toLowerCase();
          if (reason.includes("session") || reason.includes("auth") || reason.includes("token")) {
            realtimeShouldReconnect = false;
            _unauthorizedHandler?.();
            try { ws.close(); } catch {}
            return;
          }
        }
        realtimeListeners.forEach((fn) => {
          try { fn(parsed); } catch {}
        });
      } catch {}
    };
    ws.onclose = (event) => {
      realtimeSocket = null;
      if (event.code === 4401) {
        realtimeShouldReconnect = false;
        if (realtimeReconnectTimer) {
          clearTimeout(realtimeReconnectTimer);
          realtimeReconnectTimer = null;
        }
        _unauthorizedHandler?.();
        return;
      }
      if (realtimeShouldReconnect) {
        realtimeReconnectAttempts++;
        const delay = realtimeBackoffMs();
        if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
        realtimeReconnectTimer = setTimeout(() => { openRealtimeSocket(); }, delay);
      }
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  } catch {
    if (realtimeShouldReconnect) {
      realtimeReconnectAttempts++;
      const delay = realtimeBackoffMs();
      if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
      realtimeReconnectTimer = setTimeout(() => { openRealtimeSocket(); }, delay);
    }
  }
}

export const realtime = {
  start() {
    realtimeShouldReconnect = true;
    realtimeReconnectAttempts = 0;
    if (!realtimeSocket) openRealtimeSocket();
  },
  stop() {
    realtimeShouldReconnect = false;
    if (realtimeReconnectTimer) {
      clearTimeout(realtimeReconnectTimer);
      realtimeReconnectTimer = null;
    }
    if (realtimeSocket) {
      try { realtimeSocket.close(); } catch {}
      realtimeSocket = null;
    }
  },
  on(listener: Listener): () => void {
    realtimeListeners.add(listener);
    return () => { realtimeListeners.delete(listener); };
  },
  isOpen(): boolean {
    return !!realtimeSocket && realtimeSocket.readyState === 1;
  },
};

export default api;

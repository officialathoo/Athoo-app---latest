export const API_KEY = "athoo_admin_api";
export const TOKEN_KEY = "athoo_admin_token";
export const REFRESH_TOKEN_KEY = "athoo_admin_refresh_token";
const DEVICE_ID_KEY = "athoo_admin_device_id";

export function getAdminDeviceId(): string {
  const existing = typeof localStorage !== "undefined" ? localStorage.getItem(DEVICE_ID_KEY) : null;
  if (existing && /^[a-z0-9][a-z0-9._:-]{15,127}$/i.test(existing)) return existing.toLowerCase();
  const generated = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  ).toLowerCase();
  if (typeof localStorage !== "undefined") localStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
}

/**
 * Always sanitize URL (remove trailing slash)
 */
function sanitizeBaseUrl(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  return raw ? raw.replace(/\/$/, "") : "";
}

/**
 * Get API base (PRODUCTION SAFE)
 * - No localhost fallback
 * - No window.origin fallback (this was breaking your app)
 * - Always uses env or stored value
 */
export function getApiBase(): string {
  const saved = sanitizeBaseUrl(localStorage.getItem(API_KEY));

  const viteEnv = sanitizeBaseUrl(
    import.meta.env?.VITE_API_BASE_URL
  );

  // Provider-agnostic fallback: if admin and API share the same domain, use origin.
  // In dev, prefer the current page's origin (works behind Replit's same-origin
  // path-based proxy) and fall back to localhost:5000 outside a browser context.
  const fallback = import.meta.env?.DEV
    ? (typeof window !== "undefined" ? window.location.origin : "http://localhost:5000")
    : "";

  const base = saved || viteEnv || fallback;
  if (!base) {
    throw new Error("API base URL is not configured. Set VITE_API_BASE_URL or save an API base in admin settings.");
  }
  return base;
}

/**
 * Get auth token
 */
export function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

/**
 * Save API base (optional manual override)
 */
export function setApiBase(url: string): void {
  const clean = sanitizeBaseUrl(url);

  if (!clean) {
    localStorage.removeItem(API_KEY);
    return;
  }

  localStorage.setItem(API_KEY, clean);
}

/**
 * Save token
 */
export function saveToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function getRefreshToken(): string {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY) || "";
}

export function saveSessionTokens(token: string, refreshToken: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

/** Clear the complete admin session. */
export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function openAuthenticatedFile(pathOrUrl: string): Promise<void> {
  const normalizedPath = pathOrUrl.startsWith("/objects/")
    ? `/api/storage${pathOrUrl}`
    : pathOrUrl;
  const url = /^https?:\/\//i.test(normalizedPath)
    ? normalizedPath
    : `${getApiBase()}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      "X-Athoo-Device-Id": getAdminDeviceId(),
    },
  });
  if (!response.ok) throw new Error(`Unable to open protected file (${response.status})`);
  const blobUrl = URL.createObjectURL(await response.blob());
  window.open(blobUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}


let refreshPromise: Promise<boolean> | null = null;

async function refreshAdminSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Athoo-Device-Id": getAdminDeviceId() },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json() as { token?: string; refreshToken?: string; user?: { role?: string } };
      if (!data.token || !data.refreshToken || data.user?.role !== "admin") return false;
      saveSessionTokens(data.token, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

const inflight = new Map<string, Promise<unknown>>();
const cache = new Map<string, { expiresAt: number; data: unknown }>();
function cacheTtl(path: string, method: string): number {
  if (method !== "GET") return 0;
  // These endpoints drive live badges and read state. Client-side caching made
  // newly submitted requests and mark-read actions appear broken for up to ten
  // seconds even after React Query invalidation.
  if (/\/api\/admin\/(notifications|sidebar-counts)/.test(path)) return 0;
  if (/\/api\/(categories|settings\/public|providers|service-areas)/.test(path)) return 30_000;
  return 0;
}
async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = 90000): Promise<Response> {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("Server is taking longer than expected. Please try again.");
    throw err;
  } finally {
    window.clearTimeout(id);
  }
}

/**
 * Main API request handler
 */
type JsonBody = Record<string, unknown> | unknown[];
type ApiOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | JsonBody | null;
  params?: Record<string, string | number | boolean | undefined>;
  _retriedAfterRefresh?: boolean;
};

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { params, _retriedAfterRefresh, body, ...requestOptions } = options;
  const serializedBody =
    body != null &&
    typeof body === "object" &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(body) &&
    !(body instanceof ReadableStream)
      ? JSON.stringify(body)
      : body;

  const fetchOptions: RequestInit = { ...requestOptions, body: serializedBody as BodyInit | null | undefined };

/* legacy signature removed */
/*
*/

  const token = getToken();
  const base = getApiBase();

  const normalizedPath = path.startsWith("/")
    ? path
    : `/${path}`;

  let url = `${base}${normalizedPath}`;

  // Query params
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)])
    ).toString();

    if (qs) url += `?${qs}`;
  }

  const method = String(fetchOptions.method || "GET").toUpperCase();
  const key = `${method}:${url}`;
  const ttl = cacheTtl(normalizedPath, method);
  const cached = ttl ? cache.get(key) : undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.data as T;
  if (ttl && inflight.has(key)) return inflight.get(key) as Promise<T>;

  const doFetch = async (): Promise<T> => {
  const res = await fetchWithTimeout(url, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      "X-Athoo-Device-Id": getAdminDeviceId(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchOptions.headers || {}),
    },
  });

  const text = await res.text();

  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "Invalid server response" };
  }

  if (!res.ok) {
    if (res.status === 401 && token && !_retriedAfterRefresh && normalizedPath !== "/api/auth/refresh") {
      const refreshed = await refreshAdminSession();
      if (refreshed) {
        return api<T>(path, { ...options, _retriedAfterRefresh: true });
      }
      clearToken();
      window.location.reload();
    }
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }

  if (ttl) cache.set(key, { data, expiresAt: Date.now() + ttl });
  return data as T;
  };
  const promise = doFetch().finally(() => { if (ttl) inflight.delete(key); });
  if (ttl) inflight.set(key, promise);
  return promise;
}

/**
 * Format currency (PKR)
 */
export function currency(value: number | null | undefined): string {
  return `Rs. ${Number(value || 0).toLocaleString()}`;
}

/**
 * Full date format
 */
export function formatDate(
  value: string | Date | null | undefined
): string {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Short date format
 */
export function formatDateShort(
  value: string | Date | null | undefined
): string {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleDateString("en-PK", {
    dateStyle: "medium",
  });
}

export async function createPurposeToken(purpose: "realtime" | "object-read"): Promise<string> {
  const result = await api<{ token: string }>("/api/auth/purpose-token", { method: "POST", body: { purpose } });
  return result.token;
}

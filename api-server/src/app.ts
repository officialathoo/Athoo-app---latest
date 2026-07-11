import crypto from "crypto";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import { getPlatformSettings } from "./lib/admin";
import { queueStats } from "./lib/queue";
import { beginRequest, recordRequest } from "./lib/runtimeMetrics";

const app: Express = express();
// Disable weak ETag 304s on dynamic mobile/admin API data; Athoo uses realtime events and explicit client caching instead.
app.disable("etag");

const trustProxyRaw = String(process.env.TRUST_PROXY || "false").trim();
app.set("trust proxy", trustProxyRaw === "true" ? 1 : trustProxyRaw === "false" ? false : trustProxyRaw);

app.use((req: Request, res: Response, next: NextFunction) => {
  const startedAt = performance.now();
  const endActive = beginRequest();
  let completed = false;
  const complete = () => {
    if (completed) return;
    completed = true;
    endActive();
    const durationMs = performance.now() - startedAt;
    recordRequest(req.method, req.route?.path || req.path || req.originalUrl, res.statusCode, durationMs);
    if (durationMs >= Number(process.env.SLOW_REQUEST_MS || 1000)) {
      logger.warn({ method: req.method, path: req.path, statusCode: res.statusCode, durationMs: Math.round(durationMs), requestId: req.id }, "slow request");
    }
  };
  res.once("finish", complete);
  res.once("close", complete);
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "no-referrer" },
  hsts: process.env.NODE_ENV === "production" ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
}));
app.use((req: Request, res: Response, next: NextFunction) => {
  const incoming = typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"].trim() : "";
  const requestId = /^[a-zA-Z0-9._:-]{8,128}$/.test(incoming) ? incoming : String(req.id);
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
const corsOrigin = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "").trim();
const domainOrigins = [
  process.env.ADMIN_BASE_URL,
  process.env.APP_BASE_URL,
  process.env.API_BASE_URL,
]
  .map((value) => String(value || "").trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // native mobile and server-to-server clients
      const configuredOrigins = corsOrigin && corsOrigin !== "*"
        ? corsOrigin.split(",").map((item) => item.trim().replace(/\/$/, "")).filter(Boolean)
        : domainOrigins;
      if (process.env.NODE_ENV !== "production" && configuredOrigins.length === 0) return callback(null, true);
      const normalized = origin.replace(/\/$/, "");
      if (configuredOrigins.includes(normalized)) return callback(null, true);
      return callback(new Error("CORS origin denied"));
    },
    credentials: true,
  }),
);
// Gzip/deflate compression for all responses (skip already-compressed payloads).
// Cuts JSON response size ~70% on typical admin/list endpoints.
app.use(compression({ threshold: 1024 }));

const BODY_LIMIT = process.env.BODY_LIMIT || "2mb";

// Never proxy large media through the API. Use /api/storage/uploads/request-url
// for direct Cloudinary/S3/GCS uploads. Keeping body limits small protects the
// API under high traffic and prevents accidental memory pressure.
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// Lightweight request firewall: blocks dangerous JSON shapes before route code.
// This protects against prototype pollution payloads and accidental huge strings
// while keeping the stack portable across Render, VPS, Cloud Run, Nginx, etc.
const MAX_STRING_FIELD_LENGTH = Number(process.env.MAX_STRING_FIELD_LENGTH || 1_200_000);
const MAX_JSON_DEPTH = Number(process.env.MAX_JSON_DEPTH || 12);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function hasUnsafeJson(value: unknown, depth = 0): boolean {
  if (depth > MAX_JSON_DEPTH) return true;
  if (typeof value === "string") return value.length > MAX_STRING_FIELD_LENGTH;
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasUnsafeJson(item, depth + 1));
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasUnsafeJson(child, depth + 1)) return true;
  }
  return false;
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const isCallAudio = req.path.includes("/calls/") && req.path.endsWith("/audio");
  if (req.path.startsWith("/api") && !isCallAudio && hasUnsafeJson(req.body)) {
    res.status(400).json({ error: "Invalid request payload" });
    return;
  }
  next();
});

// Global API rate limit. Auth endpoints have stricter per-identity limits below.
// Tune with env vars per hosting provider/instance size.
const GLOBAL_RATE_LIMIT_WINDOW_MS = Number(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || 60_000);
const GLOBAL_RATE_LIMIT_MAX = Number(process.env.GLOBAL_RATE_LIMIT_MAX || 600);
app.use(
  "/api",
  rateLimit({
    windowMs: GLOBAL_RATE_LIMIT_WINDOW_MS,
    max: GLOBAL_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req: Request) =>
      req.path.startsWith("/health") || req.path.startsWith("/healthz") || req.method === "OPTIONS",
    message: { error: "Too many requests. Please slow down and try again." },
  }),
);


app.use(
  "/api/storage/uploads/request-url",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: Number(process.env.UPLOAD_URL_RATE_LIMIT_MAX || 120),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many upload requests. Please try again later." },
  }),
);

// API responses should not be cached by intermediary proxies unless a route
// explicitly opts in (for example /api/settings/public). This avoids stale user,
// booking, invoice, and broadcast data in production.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api") && !req.path.startsWith("/api/settings/public")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value: unknown): string {
  return safeString(value).replace(/\s+/g, "");
}

function normalizeEmail(value: unknown): string {
  return safeString(value).toLowerCase();
}

function normalizeIdentifier(value: unknown): string {
  return safeString(value).toLowerCase();
}

function requestIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown-ip";
}

function authKey(prefix: string, identity: string, req: Request): string {
  const cleanIdentity = identity.trim().toLowerCase();
  if (cleanIdentity) return `${prefix}:${cleanIdentity}`;
  return `${prefix}:ip:${requestIp(req)}`;
}

const rateLimitConfig = (keyFn: (req: Request) => string) => ({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.method === "GET",
  keyGenerator: keyFn,
});

app.use(
  "/api/auth/send-otp",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey("send-otp", normalizePhone(req.body?.phone), req),
    ),
    message: { error: "Too many OTP requests. Please try again in 15 minutes." },
  }),
);

app.use(
  "/api/auth/verify-otp",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey("verify-otp", normalizePhone(req.body?.phone), req),
    ),
    message: { error: "Too many OTP verification attempts. Please try again in 15 minutes." },
  }),
);

app.use(
  "/api/auth/forgot-password/send-otp",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey("forgot-send-otp", normalizePhone(req.body?.phone), req),
    ),
    message: { error: "Too many password reset OTP requests. Please try again in 15 minutes." },
  }),
);

app.use(
  "/api/auth/forgot-password/verify-otp",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey("forgot-verify-otp", normalizePhone(req.body?.phone), req),
    ),
    message: { error: "Too many OTP verification attempts. Please try again in 15 minutes." },
  }),
);

app.use(
  "/api/auth/forgot-password/reset",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey("forgot-reset", normalizePhone(req.body?.phone), req),
    ),
    message: { error: "Too many password reset attempts. Please try again in 15 minutes." },
  }),
);

app.use(
  "/api/auth/admin-login",
  rateLimit({
    ...rateLimitConfig((req) => authKey("admin-login", normalizeIdentifier(req.body?.identifier), req)),
    max: 5,
    message: { error: "Too many admin login attempts. Please try again in 15 minutes." },
  }),
);

app.use(
  "/api/auth/login",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey("login", normalizeIdentifier(req.body?.identifier), req),
    ),
    message: { error: "Too many login attempts. Please try again in 15 minutes." },
  }),
);

app.use(
  "/api/auth/register",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey(
        "register",
        normalizePhone(req.body?.phone) || normalizeEmail(req.body?.email),
        req,
      ),
    ),
    message: { error: "Too many registration attempts. Please try again in 15 minutes." },
  }),
);

// Maintenance mode — cached for 60 s to avoid a DB round-trip on every request.
// Admin routes (/api/admin/*) and health checks are always allowed through.
let _maintenanceCache: { enabled: boolean; fetchedAt: number } = { enabled: false, fetchedAt: 0 };
const MAINTENANCE_TTL_MS = 60_000;

async function isMaintenanceEnabled(): Promise<boolean> {
  const now = Date.now();
  if (now - _maintenanceCache.fetchedAt < MAINTENANCE_TTL_MS) {
    return _maintenanceCache.enabled;
  }
  try {
    const settings = await getPlatformSettings();
    _maintenanceCache = { enabled: Boolean(settings.maintenanceMode), fetchedAt: now };
  } catch {
    // Fall back to cached value on DB error — never block in case of DB outage
  }
  return _maintenanceCache.enabled;
}

app.use(async (req: Request, res: Response, next: NextFunction) => {
  // Allow health checks and admin routes through regardless
  const path = req.path || "";
  const maintenanceAllowedAuthPaths = new Set([
    "/api/auth/login",
    "/api/auth/admin-login",
    "/api/auth/refresh",
    "/api/auth/logout",
  ]);
  if (
    path === "/" ||
    path.startsWith("/api/health") ||
    path.startsWith("/api/admin") ||
    maintenanceAllowedAuthPaths.has(path)
  ) {
    return next();
  }
  try {
    const enabled = await isMaintenanceEnabled();
    if (enabled) {
      res.status(503).json({
        error: "Athoo is currently under maintenance. Please try again shortly.",
        maintenanceMode: true,
      });
      return;
    }
  } catch {
    // On unexpected error, let request through
  }
  next();
});

// Health / root routes
app.get("/", (_req, res) => {
  res.send("Athoo API is running 🚀");
});

app.get("/api", (_req, res) => {
  res.json({
    status: "ok",
    message: "Athoo API is running 🚀",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "athoo-api",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    queue: queueStats(),
    nativeReadiness: {
      turnConfigured: Boolean(process.env.TURN_URLS),
      redisConfigured: Boolean(process.env.REDIS_URL),
      storageProvider: process.env.STORAGE_PROVIDER || "local/object-storage-adapter",
      pushProvider: process.env.PUSH_PROVIDER || "expo-fcm-compatible",
    },
  });
});


// Short in-memory micro-cache for expensive polling/list endpoints.
// Key includes Authorization so authenticated user data is never shared across users.
// This reduces duplicate mobile/admin polling pressure without locking Athoo to any provider.
type MicroCacheEntry = { statusCode: number; body: unknown; expiresAt: number };
const microCache = new Map<string, MicroCacheEntry>();
const MICRO_CACHE_TTL_MS = Number(process.env.MICRO_CACHE_TTL_MS || 2500);
const MICRO_CACHE_MAX_ITEMS = Number(process.env.MICRO_CACHE_MAX_ITEMS || 500);
const MICRO_CACHE_PATHS = [
  /^\/api\/admin\/(dashboard|reports|audit-log|notifications|sidebar-counts)$/,
  /^\/api\/broadcast(?:\/[^/]+)?$/,
  /^\/api\/bookings$/,
  /^\/api\/negotiations$/,
  /^\/api\/chat$/,
  /^\/api\/calls\/incoming$/,
  /^\/api\/me\/notifications$/,
  /^\/api\/marketing\/(banners|announcements)$/,
  /^\/api\/providers(?:\/stats)?$/,
];

function isMicroCacheable(req: Request): boolean {
  if (req.method !== "GET") return false;
  if (MICRO_CACHE_TTL_MS <= 0) return false;
  const path = req.path || "";
  return MICRO_CACHE_PATHS.some((pattern) => pattern.test(path));
}

function pruneMicroCache() {
  if (microCache.size <= MICRO_CACHE_MAX_ITEMS) return;
  const now = Date.now();
  for (const [key, entry] of microCache) {
    if (entry.expiresAt <= now || microCache.size > MICRO_CACHE_MAX_ITEMS) microCache.delete(key);
  }
}

app.use((req: Request, res: Response, next: NextFunction) => {
  if (!isMicroCacheable(req)) return next();
  const auth = req.headers.authorization || "";
  const authKey = auth ? crypto.createHash("sha256").update(auth).digest("base64url").slice(0, 24) : "public";
  const key = `${authKey}|${req.originalUrl}`;
  const now = Date.now();
  const hit = microCache.get(key);
  if (hit && hit.expiresAt > now) {
    res.setHeader("X-Athoo-Cache", "micro-hit");
    res.status(hit.statusCode).json(hit.body);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      microCache.set(key, { statusCode: res.statusCode, body, expiresAt: Date.now() + MICRO_CACHE_TTL_MS });
      pruneMicroCache();
      res.setHeader("X-Athoo-Cache", "micro-store");
    }
    return originalJson(body);
  }) as Response["json"];
  next();
});

// Any successful mutation invalidates the tiny process-local GET cache. The
// cache is deliberately short-lived, so a full clear is cheaper and safer than
// maintaining route-specific dependency graphs.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    res.once("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 400) microCache.clear();
    });
  }
  next();
});

// Main API routes
app.use("/api", router);

// Global error handler — catches any unhandled errors thrown from route handlers.
// Must be registered after all routes (Express identifies it by the 4-arg signature).
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message === "CORS origin denied") {
    logger.warn({ err }, "blocked CORS origin");
    if (!res.headersSent) res.status(403).json({ error: "Origin not allowed" });
    return;
  }
  logger.error({ err }, "unhandled route error");
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;

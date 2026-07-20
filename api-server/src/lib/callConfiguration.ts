import { logger } from "./logger";

export type IceServerConfiguration = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

type RuntimeCallConfiguration = ReturnType<typeof getCallConfiguration> & {
  expiresAt?: string;
  ttlSeconds?: number;
  credentialMode: "static" | "short-lived" | "none";
};

type CachedCloudflareCredential = {
  configuration: RuntimeCallConfiguration;
  refreshAfterMs: number;
  expiresAtMs: number;
};

const CLOUDFLARE_TURN_API_ORIGIN = "https://rtc.live.cloudflare.com";
const CLOUDFLARE_TURN_MAX_TTL_SECONDS = 48 * 60 * 60;
const cloudflareCredentialCache = new Map<string, CachedCloudflareCredential>();
const cloudflareCredentialRequests = new Map<string, Promise<RuntimeCallConfiguration>>();

function parseConfiguredUrls(...values: Array<string | undefined>): string[] {
  return [...new Set(values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean))];
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function configuredProvider(): string {
  return String(process.env.CALL_PROVIDER || "webrtc").trim().toLowerCase();
}

function cloudflareSettings() {
  const keyId = String(process.env.CLOUDFLARE_TURN_KEY_ID || "").trim();
  const apiToken = String(process.env.CLOUDFLARE_TURN_API_TOKEN || "").trim();
  const ttlSeconds = boundedInteger(
    process.env.CLOUDFLARE_TURN_TTL_SECONDS,
    7_200,
    300,
    CLOUDFLARE_TURN_MAX_TTL_SECONDS,
  );
  const timeoutMs = boundedInteger(process.env.CLOUDFLARE_TURN_TIMEOUT_MS, 6_000, 1_000, 20_000);
  const requestedProvider = configuredProvider();
  const selected = ["cloudflare-turn", "cloudflare-realtime-turn", "cloudflare_turn"].includes(requestedProvider)
    || (Boolean(keyId && apiToken) && ["webrtc", "webrtc-turn"].includes(requestedProvider));
  return {
    keyId,
    apiToken,
    ttlSeconds,
    timeoutMs,
    selected,
    configured: Boolean(keyId && apiToken),
    partiallyConfigured: Boolean(keyId) !== Boolean(apiToken),
  };
}

function staticCallConfiguration() {
  const stunUrls = parseConfiguredUrls(process.env.STUN_URLS, process.env.STUN_URL);
  const turnUrls = parseConfiguredUrls(process.env.TURN_URLS, process.env.TURN_URL);
  const username = String(process.env.TURN_USERNAME || "").trim();
  const credential = String(process.env.TURN_CREDENTIAL || "").trim();
  const hasTurnCredentials = Boolean(username && credential);
  const validTurnUrls = turnUrls.length > 0 && turnUrls.every((url) => /^turns?:/i.test(url));
  const validStunUrls = stunUrls.every((url) => /^stuns?:/i.test(url));
  const iceServers: IceServerConfiguration[] = [];

  if (stunUrls.length) iceServers.push({ urls: stunUrls });
  if (turnUrls.length) {
    iceServers.push({
      urls: turnUrls,
      ...(hasTurnCredentials ? { username, credential } : {}),
    });
  }

  return {
    provider: process.env.CALL_PROVIDER || (validTurnUrls && hasTurnCredentials ? "webrtc-turn" : stunUrls.length ? "webrtc-stun" : "audio-fallback"),
    iceServers,
    hasStun: stunUrls.length > 0,
    hasTurn: turnUrls.length > 0,
    hasTurnCredentials,
    validStunUrls,
    validTurnUrls,
    productionReady: validTurnUrls && hasTurnCredentials,
  };
}

function sanitizeCloudflareIceServers(value: unknown): IceServerConfiguration[] {
  if (!Array.isArray(value)) return [];
  const result: IceServerConfiguration[] = [];

  for (const rawServer of value.slice(0, 8)) {
    if (!rawServer || typeof rawServer !== "object") continue;
    const record = rawServer as Record<string, unknown>;
    const urls = (Array.isArray(record.urls) ? record.urls : [record.urls])
      .filter((url): url is string => typeof url === "string")
      .map((url) => url.trim())
      .filter((url) => /^(?:stun|stuns|turn|turns):/i.test(url))
      // Port 53 is an alternate path that is frequently blocked and can add
      // avoidable ICE timeout delay. Primary UDP/TCP/TLS paths remain present.
      .filter((url) => !/:53(?:\?|$)/i.test(url))
      .slice(0, 12);
    if (!urls.length) continue;

    const hasTurn = urls.some((url) => /^turns?:/i.test(url));
    const username = typeof record.username === "string" ? record.username.trim() : "";
    const credential = typeof record.credential === "string" ? record.credential.trim() : "";
    if (hasTurn && (!username || !credential)) continue;

    result.push({
      urls: urls.length === 1 ? urls[0] : urls,
      ...(hasTurn ? { username, credential } : {}),
    });
  }

  return result;
}

function pruneCloudflareCredentialCache(now = Date.now()) {
  for (const [subjectId, entry] of cloudflareCredentialCache.entries()) {
    if (entry.expiresAtMs <= now) cloudflareCredentialCache.delete(subjectId);
  }
  const maxEntries = boundedInteger(process.env.CLOUDFLARE_TURN_CACHE_MAX_USERS, 2_000, 100, 20_000);
  while (cloudflareCredentialCache.size > maxEntries) {
    const oldestKey = cloudflareCredentialCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cloudflareCredentialCache.delete(oldestKey);
  }
}

async function generateCloudflareTurnConfiguration(subjectId: string): Promise<RuntimeCallConfiguration> {
  const settings = cloudflareSettings();
  if (!settings.configured) throw new Error("Cloudflare TURN credentials are not configured");

  const now = Date.now();
  pruneCloudflareCredentialCache(now);
  const cached = cloudflareCredentialCache.get(subjectId);
  if (cached && cached.refreshAfterMs > now) return cached.configuration;

  const existingRequest = cloudflareCredentialRequests.get(subjectId);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
    try {
      const endpoint = `${CLOUDFLARE_TURN_API_ORIGIN}/v1/turn/keys/${encodeURIComponent(settings.keyId)}/credentials/generate-ice-servers`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.apiToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ ttl: settings.ttlSeconds }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Cloudflare TURN credential request failed with status ${response.status}`);
      }

      const payload = await response.json() as { iceServers?: unknown };
      const iceServers = sanitizeCloudflareIceServers(payload.iceServers);
      const hasTurn = iceServers.some((server) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return urls.some((url) => /^turns?:/i.test(url));
      });
      if (!hasTurn) throw new Error("Cloudflare TURN response did not contain valid TURN credentials");

      const expiresAtMs = Date.now() + settings.ttlSeconds * 1_000;
      const refreshLeadMs = Math.min(5 * 60_000, Math.max(60_000, Math.floor(settings.ttlSeconds * 100)));
      const configuration: RuntimeCallConfiguration = {
        provider: "cloudflare-turn",
        iceServers,
        hasStun: iceServers.some((server) => {
          const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
          return urls.some((url) => /^stuns?:/i.test(url));
        }),
        hasTurn: true,
        hasTurnCredentials: true,
        validStunUrls: true,
        validTurnUrls: true,
        productionReady: true,
        warning: null,
        credentialMode: "short-lived",
        ttlSeconds: settings.ttlSeconds,
        expiresAt: new Date(expiresAtMs).toISOString(),
      };

      cloudflareCredentialCache.set(subjectId, {
        configuration,
        refreshAfterMs: Math.max(Date.now(), expiresAtMs - refreshLeadMs),
        expiresAtMs,
      });
      pruneCloudflareCredentialCache();
      return configuration;
    } finally {
      clearTimeout(timer);
    }
  })();

  cloudflareCredentialRequests.set(subjectId, request);
  try {
    return await request;
  } finally {
    cloudflareCredentialRequests.delete(subjectId);
  }
}

export function getCallConfiguration() {
  const staticConfiguration = staticCallConfiguration();
  const cloudflare = cloudflareSettings();
  const cloudflareReady = cloudflare.selected && cloudflare.configured;
  const productionReady = cloudflareReady || staticConfiguration.productionReady;
  const provider = cloudflareReady ? "cloudflare-turn" : staticConfiguration.provider;
  const warning = productionReady
    ? null
    : cloudflare.selected
      ? cloudflare.partiallyConfigured
        ? "Cloudflare TURN requires both CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN."
        : "Cloudflare TURN credentials are not configured."
      : "Production voice calling requires Cloudflare TURN credentials or valid TURN_URLS plus TURN_USERNAME and TURN_CREDENTIAL.";

  return {
    ...staticConfiguration,
    provider,
    hasTurn: cloudflareReady || staticConfiguration.hasTurn,
    hasTurnCredentials: cloudflareReady || staticConfiguration.hasTurnCredentials,
    validTurnUrls: cloudflareReady || staticConfiguration.validTurnUrls,
    productionReady,
    warning,
  };
}

export async function getRuntimeCallConfiguration(subjectId: string): Promise<RuntimeCallConfiguration> {
  const cloudflare = cloudflareSettings();
  if (cloudflare.selected && cloudflare.configured) {
    try {
      return await generateCloudflareTurnConfiguration(subjectId);
    } catch (error) {
      logger.warn({
        provider: "cloudflare-turn",
        error: error instanceof Error ? error.message : "unknown_error",
      }, "Cloudflare TURN credential generation failed; evaluating configured fallback");
    }
  }

  const configuration = getCallConfiguration();
  if (configuration.iceServers.length > 0 && staticCallConfiguration().productionReady) {
    return { ...configuration, credentialMode: "static" };
  }

  return {
    ...configuration,
    iceServers: [],
    productionReady: false,
    credentialMode: "none",
    warning: cloudflare.selected
      ? "Cloudflare TURN credentials could not be generated. Athoo will use the authenticated audio fallback until the service recovers."
      : configuration.warning,
  };
}

export function getCallConfigurationStatus() {
  const configuration = getCallConfiguration();
  const cloudflare = cloudflareSettings();
  return {
    provider: configuration.provider,
    credentialMode: cloudflare.selected && cloudflare.configured
      ? "short-lived"
      : configuration.productionReady
        ? "static"
        : "none",
    hasStun: configuration.hasStun,
    hasTurn: configuration.hasTurn,
    hasTurnCredentials: configuration.hasTurnCredentials,
    validStunUrls: configuration.validStunUrls,
    validTurnUrls: configuration.validTurnUrls,
    productionReady: configuration.productionReady,
    warning: configuration.warning,
  };
}

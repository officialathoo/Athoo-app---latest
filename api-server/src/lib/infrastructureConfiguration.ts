import { getCallConfigurationStatus } from "./callConfiguration";

export type QueueProvider = "postgres" | "disabled";
export type CacheProvider = "memory" | "redis" | "disabled";

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function getQueueProviderConfiguration() {
  const requested = normalized(process.env.QUEUE_PROVIDER || "postgres");
  const provider = oneOf<QueueProvider>(requested, ["postgres", "disabled"], "disabled");
  const configured = provider === "postgres";
  return {
    requestedProvider: requested || "postgres",
    provider,
    configured,
    durable: provider === "postgres",
    productionSafe: provider === "postgres",
    runtimeSwitchable: false,
    restartRequired: true,
    drainRequired: true,
    error: requested && requested !== provider
      ? `Unsupported queue provider: ${requested}`
      : provider === "disabled"
        ? "Background queue is disabled."
        : null,
  };
}

export function getCacheProviderConfiguration() {
  const requested = normalized(process.env.CACHE_PROVIDER || "memory");
  const supported = ["memory", "redis", "disabled"] as const;
  const requestedSupported = (supported as readonly string[]).includes(requested);
  const provider = oneOf<CacheProvider>(requested, supported, "disabled");
  const redisUrlConfigured = Boolean(String(process.env.REDIS_URL || "").trim());

  // Redis is reserved in the configuration vocabulary, but the current release deliberately
  // fails closed until every cache consumer is migrated to a real shared adapter.
  // Merely having REDIS_URL must never advertise horizontal-scaling safety.
  const adapterImplemented = provider !== "redis";
  const configured = requestedSupported && adapterImplemented;
  const productionSafe = configured;
  const sharedAcrossInstances = false;
  const horizontalScaleSafe = provider === "disabled";

  return {
    requestedProvider: requested || "memory",
    provider,
    configured,
    productionSafe,
    adapterImplemented,
    redisUrlConfigured,
    sharedAcrossInstances,
    horizontalScaleSafe,
    runtimeSwitchable: false,
    restartRequired: true,
    drainRequired: false,
    error: !requestedSupported
      ? `Unsupported cache provider: ${requested}`
      : provider === "redis"
        ? "CACHE_PROVIDER=redis is reserved, but no shared Redis cache adapter is installed. Keep CACHE_PROVIDER=memory for one API instance or disabled until the adapter migration is complete."
        : null,
  };
}

export function isInProcessCacheEnabled(): boolean {
  return getCacheProviderConfiguration().provider === "memory";
}

export function getInfrastructureProviderStatus() {
  return {
    queue: getQueueProviderConfiguration(),
    cache: getCacheProviderConfiguration(),
    calls: {
      ...getCallConfigurationStatus(),
      runtimeSwitchable: false,
      restartRequired: true,
      drainRequired: true,
    },
  };
}

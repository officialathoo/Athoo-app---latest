import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { logger } from "./logger";

const EXPO_ACCESS_TOKEN = String(process.env.EXPO_ACCESS_TOKEN || "").trim();
const PUSH_PROVIDER = String(process.env.PUSH_PROVIDER || "expo").toLowerCase().trim();
const PUSH_TIMEOUT_MS = Number(process.env.PUSH_TIMEOUT_MS || 10_000);
const EXPO_BATCH_SIZE = Number(process.env.EXPO_PUSH_BATCH_SIZE || 100);
const PUSH_MAX_ATTEMPTS = Number(process.env.PUSH_MAX_ATTEMPTS || 3);
const PUSH_RETRY_BASE_MS = Number(process.env.PUSH_RETRY_BASE_MS || 500);

export type PushPayload = {
  title: string;
  body: string;
  type?: string;
  data?: Record<string, unknown>;
  channelId?: string;
  sound?: string;
  ttl?: number;
};

export type PushMessage = {
  token: string;
  payload: PushPayload;
};

export type PushResult = {
  sent: number;
  accepted?: number;
  failed?: number;
  invalidTokens?: string[];
  error?: string;
  provider?: string;
};

type PushPolicy = {
  category: "job" | "message" | "general" | "call";
  channelId: string;
  sound: string;
  ttl: number;
};

const PUSH_POLICIES: Record<PushPolicy["category"], Omit<PushPolicy, "category">> = {
  job: { channelId: "jobs-v2", sound: "athoo_job.wav", ttl: 15 * 60 },
  message: { channelId: "messages-v2", sound: "athoo_message.wav", ttl: 24 * 60 * 60 },
  general: { channelId: "general-v2", sound: "athoo_general.wav", ttl: 24 * 60 * 60 },
  call: { channelId: "calls-v2", sound: "athoo_call.wav", ttl: 35 },
};

function categoryForType(type: unknown): PushPolicy["category"] {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "call" || normalized === "incoming_call") return "call";
  if (normalized === "message" || normalized === "chat") return "message";
  if (
    normalized === "booking" ||
    normalized === "broadcast" ||
    normalized === "job" ||
    normalized === "negotiation" ||
    normalized === "provider_response"
  ) {
    return "job";
  }
  return "general";
}

export function resolvePushPolicy(payload: PushPayload): PushPolicy {
  const category = categoryForType(payload.type || payload.data?.type);
  const base = PUSH_POLICIES[category];
  return {
    category,
    channelId: String(payload.channelId || base.channelId),
    sound: String(payload.sound || base.sound),
    ttl: Number.isFinite(payload.ttl) && Number(payload.ttl) > 0 ? Number(payload.ttl) : base.ttl,
  };
}

function uniqueTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens.map((token) => String(token || "").trim()).filter(Boolean)));
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const safeSize = Math.max(1, Math.min(100, size));
  for (let index = 0; index < items.length; index += safeSize) {
    out.push(items.slice(index, index + safeSize));
  }
  return out;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, Math.round(seconds * 1000));
    const timestamp = Date.parse(retryAfter);
    if (Number.isFinite(timestamp)) return Math.min(30_000, Math.max(0, timestamp - Date.now()));
  }
  return Math.min(10_000, PUSH_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1));
}

function isTransientExpoStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function toExpoMessage(message: PushMessage) {
  const policy = resolvePushPolicy(message.payload);
  const type = String(message.payload.type || message.payload.data?.type || "system");
  return {
    to: message.token,
    sound: policy.sound,
    priority: "high",
    channelId: policy.channelId,
    ttl: policy.ttl,
    badge: 1,
    title: message.payload.title,
    body: message.payload.body,
    data: {
      ...(message.payload.data || {}),
      type,
      notificationCategory: policy.category,
      channelId: policy.channelId,
    },
  };
}

async function sendExpoBatch(messages: PushMessage[]): Promise<PushResult> {
  const expoMessages = messages.map(toExpoMessage);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  if (EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;

  const maxAttempts = Math.min(5, Math.max(1, Number.isInteger(PUSH_MAX_ATTEMPTS) ? PUSH_MAX_ATTEMPTS : 3));
  let lastError = "expo_push_failed";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);
    let response: Response | null = null;
    try {
      response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers,
        body: JSON.stringify(expoMessages),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        lastError = `expo_http_${response.status}`;
        logger.warn({ status: response.status, attempt, body: text.slice(0, 500) }, "expo push rejected by provider");
        if (attempt < maxAttempts && isTransientExpoStatus(response.status)) {
          await sleep(retryDelayMs(response, attempt));
          continue;
        }
        return { sent: 0, accepted: 0, failed: messages.length, provider: "expo", error: lastError };
      }

      let tickets: any[] = [];
      try {
        const parsed = JSON.parse(text);
        tickets = Array.isArray(parsed?.data) ? parsed.data : [];
      } catch {
        return { sent: 0, accepted: 0, failed: messages.length, provider: "expo", error: "invalid_expo_response" };
      }

      let accepted = 0;
      let failed = 0;
      const invalidTokens: string[] = [];
      messages.forEach((message, index) => {
        const ticket = tickets[index];
        if (ticket?.status === "ok") {
          accepted += 1;
          return;
        }
        failed += 1;
        if (ticket?.details?.error === "DeviceNotRegistered") invalidTokens.push(message.token);
      });

      logger.info({ requested: messages.length, accepted, failed, attempt }, "expo push batch processed");
      return { sent: accepted, accepted, failed, invalidTokens, provider: "expo" };
    } catch (error) {
      lastError = String((error as Error)?.message || error);
      logger.warn({ err: error, count: messages.length, attempt }, "expo push batch send attempt failed");
      if (attempt < maxAttempts) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  logger.error({ count: messages.length, error: lastError }, "expo push batch exhausted retries");
  return { sent: 0, accepted: 0, failed: messages.length, provider: "expo", error: lastError };
}

export async function sendExpoPushMessages(messages: PushMessage[]): Promise<PushResult> {
  const cleanMessages = messages
    .map((message) => ({ ...message, token: String(message.token || "").trim() }))
    .filter((message) => Boolean(message.token));

  if (!cleanMessages.length) return { sent: 0, accepted: 0, failed: 0, provider: PUSH_PROVIDER };
  if (PUSH_PROVIDER !== "expo") {
    logger.warn({ provider: PUSH_PROVIDER }, "unsupported PUSH_PROVIDER; push not sent");
    return {
      sent: 0,
      accepted: 0,
      failed: cleanMessages.length,
      provider: PUSH_PROVIDER,
      error: "unsupported_push_provider",
    };
  }

  let sent = 0;
  let accepted = 0;
  let failed = 0;
  let lastError: string | undefined;
  const invalidTokens: string[] = [];

  for (const batch of chunks(cleanMessages, EXPO_BATCH_SIZE)) {
    const result = await sendExpoBatch(batch);
    sent += result.sent || 0;
    accepted += result.accepted || 0;
    failed += result.failed || 0;
    if (result.invalidTokens?.length) invalidTokens.push(...result.invalidTokens);
    if (result.error) lastError = result.error;
  }

  return {
    sent,
    accepted,
    failed,
    invalidTokens: uniqueTokens(invalidTokens),
    provider: PUSH_PROVIDER,
    ...(lastError ? { error: lastError } : {}),
  };
}

export async function sendExpoPushNotifications(tokens: string[], payload: PushPayload): Promise<PushResult> {
  return sendExpoPushMessages(uniqueTokens(tokens).map((token) => ({ token, payload })));
}

export async function getAudiencePushTokens(audience: string) {
  if (audience === "all") {
    const rows = await db
      .select({ token: usersTable.expoPushToken })
      .from(usersTable)
      .where(isNotNull(usersTable.expoPushToken));
    return rows.map((row) => row.token).filter(Boolean) as string[];
  }

  if (audience === "providers") {
    const rows = await db
      .select({ token: usersTable.expoPushToken })
      .from(usersTable)
      .where(and(eq(usersTable.role, "provider"), isNotNull(usersTable.expoPushToken)));
    return rows.map((row) => row.token).filter(Boolean) as string[];
  }

  if (audience === "customers") {
    const rows = await db
      .select({ token: usersTable.expoPushToken })
      .from(usersTable)
      .where(and(eq(usersTable.role, "customer"), isNotNull(usersTable.expoPushToken)));
    return rows.map((row) => row.token).filter(Boolean) as string[];
  }

  return [];
}

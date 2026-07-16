import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import { enqueueJob, registerJobHandler } from "./queue";

const EXPO_ACCESS_TOKEN = String(process.env.EXPO_ACCESS_TOKEN || "").trim();
const PUSH_PROVIDER = String(process.env.PUSH_PROVIDER || "expo").toLowerCase().trim();
const PUSH_PROVIDER_ENDPOINT = String(
  process.env.PUSH_PROVIDER_ENDPOINT || "https://exp.host/--/api/v2/push/send",
).trim();
const PUSH_RECEIPT_ENDPOINT = String(
  process.env.PUSH_RECEIPT_ENDPOINT || "https://exp.host/--/api/v2/push/getReceipts",
).trim();
const PUSH_TIMEOUT_MS = boundedInteger(process.env.PUSH_TIMEOUT_MS, 10_000, 1_000, 60_000);
const PUSH_RECEIPT_TIMEOUT_MS = boundedInteger(process.env.PUSH_RECEIPT_TIMEOUT_MS, 10_000, 1_000, 60_000);
const PUSH_RECEIPT_DELAY_MS = boundedInteger(process.env.PUSH_RECEIPT_DELAY_MS, 20_000, 5_000, 300_000);
const PUSH_RECEIPT_MAX_ATTEMPTS = boundedInteger(process.env.PUSH_RECEIPT_MAX_ATTEMPTS, 5, 1, 10);
const PUSH_RECEIPT_JOB_NAME = "expo_push_receipts";
const EXPO_BATCH_SIZE = boundedInteger(process.env.EXPO_PUSH_BATCH_SIZE, 100, 1, 100);
const PUSH_MAX_ATTEMPTS = boundedInteger(process.env.PUSH_MAX_ATTEMPTS, 3, 1, 5);
const PUSH_RETRY_BASE_MS = boundedInteger(process.env.PUSH_RETRY_BASE_MS, 500, 100, 10_000);
const PUSH_BADGE_COUNT = boundedInteger(process.env.PUSH_BADGE_COUNT, 1, 0, 999);
const NOTIFICATION_CHANNEL_VERSION = safeChannelVersion(process.env.NOTIFICATION_CHANNEL_VERSION || "4");

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function safeChannelVersion(value: unknown): string {
  const normalized = String(value || "").trim();
  return /^[a-z0-9._-]{1,20}$/i.test(normalized) ? normalized : "4";
}

function safeChannelId(value: unknown, fallback: string): string {
  const normalized = String(value || "").trim();
  return /^[a-z0-9._-]{1,100}$/i.test(normalized) ? normalized : fallback;
}

function safeSoundName(value: unknown, fallback: string): string {
  const normalized = String(value || "").trim();
  return /^[a-z0-9._-]+\.(wav|mp3|caf)$/i.test(normalized) ? normalized : fallback;
}

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
  failedTokens?: string[];
  ticketIds?: string[];
  receiptQueued?: boolean;
  error?: string;
  provider?: string;
};

type PushTicketToken = { id: string; token: string };
type PushBatchResult = PushResult & { ticketTokens?: PushTicketToken[] };
type PushReceiptJob = { tickets: PushTicketToken[] };

type PushPolicy = {
  category: "job" | "message" | "general" | "call";
  channelId: string;
  sound: string;
  ttl: number;
};

const PUSH_POLICIES: Record<PushPolicy["category"], Omit<PushPolicy, "category">> = {
  job: {
    channelId: safeChannelId(process.env.NOTIFICATION_JOB_CHANNEL_ID, `jobs-v${NOTIFICATION_CHANNEL_VERSION}`),
    sound: safeSoundName(process.env.NOTIFICATION_JOB_SOUND, "athoo_job.wav"),
    ttl: boundedInteger(process.env.NOTIFICATION_JOB_TTL_SECONDS, 15 * 60, 1, 86_400),
  },
  message: {
    channelId: safeChannelId(process.env.NOTIFICATION_MESSAGE_CHANNEL_ID, `messages-v${NOTIFICATION_CHANNEL_VERSION}`),
    sound: safeSoundName(process.env.NOTIFICATION_MESSAGE_SOUND, "athoo_message.wav"),
    ttl: boundedInteger(process.env.NOTIFICATION_MESSAGE_TTL_SECONDS, 24 * 60 * 60, 1, 604_800),
  },
  general: {
    channelId: safeChannelId(process.env.NOTIFICATION_GENERAL_CHANNEL_ID, `general-v${NOTIFICATION_CHANNEL_VERSION}`),
    sound: safeSoundName(process.env.NOTIFICATION_GENERAL_SOUND, "athoo_general.wav"),
    ttl: boundedInteger(process.env.NOTIFICATION_GENERAL_TTL_SECONDS, 24 * 60 * 60, 1, 604_800),
  },
  call: {
    channelId: safeChannelId(process.env.NOTIFICATION_CALL_CHANNEL_ID, `calls-v${NOTIFICATION_CHANNEL_VERSION}`),
    sound: safeSoundName(process.env.NOTIFICATION_CALL_SOUND, "athoo_call.wav"),
    ttl: boundedInteger(process.env.NOTIFICATION_CALL_TTL_SECONDS, 35, 5, 120),
  },
};

export function getPushConfigurationStatus() {
  return {
    provider: PUSH_PROVIDER,
    enabled: PUSH_PROVIDER !== "disabled" && PUSH_PROVIDER !== "none",
    endpointConfigured: Boolean(PUSH_PROVIDER_ENDPOINT),
    receiptEndpointConfigured: Boolean(PUSH_RECEIPT_ENDPOINT),
    accessTokenConfigured: Boolean(EXPO_ACCESS_TOKEN),
    receiptDelayMs: PUSH_RECEIPT_DELAY_MS,
    channelVersion: NOTIFICATION_CHANNEL_VERSION,
    policies: PUSH_POLICIES,
  };
}

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
    badge: PUSH_BADGE_COUNT,
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

async function sendExpoBatch(messages: PushMessage[]): Promise<PushBatchResult> {
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
      response = await fetch(PUSH_PROVIDER_ENDPOINT, {
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
        return { sent: 0, accepted: 0, failed: messages.length, failedTokens: messages.map((message) => message.token), provider: "expo", error: lastError };
      }

      let tickets: any[] = [];
      try {
        const parsed = JSON.parse(text);
        tickets = Array.isArray(parsed?.data) ? parsed.data : [];
      } catch {
        return { sent: 0, accepted: 0, failed: messages.length, failedTokens: messages.map((message) => message.token), provider: "expo", error: "invalid_expo_response" };
      }

      let accepted = 0;
      let failed = 0;
      const invalidTokens: string[] = [];
      const failedTokens: string[] = [];
      const ticketTokens: PushTicketToken[] = [];
      messages.forEach((message, index) => {
        const ticket = tickets[index];
        if (ticket?.status === "ok") {
          accepted += 1;
          if (typeof ticket?.id === "string" && ticket.id.trim()) {
            ticketTokens.push({ id: ticket.id.trim(), token: message.token });
          }
          return;
        }
        failed += 1;
        failedTokens.push(message.token);
        if (ticket?.details?.error === "DeviceNotRegistered") invalidTokens.push(message.token);
      });

      logger.info({ requested: messages.length, accepted, failed, ticketCount: ticketTokens.length, attempt }, "expo push batch processed");
      return {
        sent: accepted,
        accepted,
        failed,
        invalidTokens,
        failedTokens,
        ticketIds: ticketTokens.map((ticket) => ticket.id),
        ticketTokens,
        provider: "expo",
      };
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
  return { sent: 0, accepted: 0, failed: messages.length, failedTokens: messages.map((message) => message.token), provider: "expo", error: lastError };
}

async function fetchExpoReceipts(tickets: PushTicketToken[]): Promise<{ invalidTokens: string[]; missing: number; errors: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUSH_RECEIPT_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    };
    if (EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;

    const response = await fetch(PUSH_RECEIPT_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ ids: tickets.map((ticket) => ticket.id) }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`expo_receipt_http_${response.status}:${text.slice(0, 250)}`);
    }

    const parsed = JSON.parse(text);
    const receipts = parsed?.data && typeof parsed.data === "object" ? parsed.data as Record<string, any> : {};
    const invalidTokens: string[] = [];
    let missing = 0;
    let errors = 0;

    for (const ticket of tickets) {
      const receipt = receipts[ticket.id];
      if (!receipt) {
        missing += 1;
        continue;
      }
      if (receipt.status === "ok") continue;
      errors += 1;
      if (receipt?.details?.error === "DeviceNotRegistered") invalidTokens.push(ticket.token);
      logger.warn(
        { ticketId: ticket.id, error: receipt?.details?.error || receipt?.message || "unknown_receipt_error" },
        "expo push receipt reported delivery failure",
      );
    }

    return { invalidTokens: uniqueTokens(invalidTokens), missing, errors };
  } finally {
    clearTimeout(timeout);
  }
}

registerJobHandler<PushReceiptJob>(PUSH_RECEIPT_JOB_NAME, async (payload) => {
  const tickets = Array.isArray(payload?.tickets)
    ? payload.tickets
        .map((ticket) => ({ id: String(ticket?.id || "").trim(), token: String(ticket?.token || "").trim() }))
        .filter((ticket) => ticket.id && ticket.token)
        .slice(0, 1000)
    : [];
  if (!tickets.length) return;

  const result = await fetchExpoReceipts(tickets);
  if (result.invalidTokens.length) {
    // Clear only the exact tokens that Expo identified as unregistered.
    for (const token of result.invalidTokens) {
      await db.update(usersTable).set({ expoPushToken: null, updatedAt: new Date() }).where(eq(usersTable.expoPushToken, token));
    }
  }
  if (result.missing > 0) throw new Error(`expo_receipts_not_ready:${result.missing}`);
  logger.info({ checked: tickets.length, errors: result.errors, invalidTokens: result.invalidTokens.length }, "expo push receipts processed");
});

async function queueExpoReceiptCheck(tickets: PushTicketToken[]): Promise<boolean> {
  if (!tickets.length) return false;
  try {
    await enqueueJob(PUSH_RECEIPT_JOB_NAME, { tickets } satisfies PushReceiptJob, {
      attempts: PUSH_RECEIPT_MAX_ATTEMPTS,
      delayMs: PUSH_RECEIPT_DELAY_MS,
      dedupeKey: `expo-receipts:${tickets[0]!.id}:${tickets.length}`,
    });
    return true;
  } catch (error) {
    logger.warn({ err: error, ticketCount: tickets.length }, "expo receipt verification could not be queued");
    return false;
  }
}

export async function sendExpoPushMessages(messages: PushMessage[]): Promise<PushResult> {
  const cleanMessages = messages
    .map((message) => ({ ...message, token: String(message.token || "").trim() }))
    .filter((message) => Boolean(message.token));

  if (!cleanMessages.length) return { sent: 0, accepted: 0, failed: 0, provider: PUSH_PROVIDER };
  if (PUSH_PROVIDER === "disabled" || PUSH_PROVIDER === "none") {
    return {
      sent: 0,
      accepted: 0,
      failed: cleanMessages.length,
      provider: PUSH_PROVIDER,
      error: "push_disabled",
    };
  }
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
  const failedTokens: string[] = [];
  const ticketTokens: PushTicketToken[] = [];

  for (const batch of chunks(cleanMessages, EXPO_BATCH_SIZE)) {
    const result = await sendExpoBatch(batch);
    sent += result.sent || 0;
    accepted += result.accepted || 0;
    failed += result.failed || 0;
    if (result.invalidTokens?.length) invalidTokens.push(...result.invalidTokens);
    if (result.failedTokens?.length) failedTokens.push(...result.failedTokens);
    if (result.ticketTokens?.length) ticketTokens.push(...result.ticketTokens);
    if (result.error) lastError = result.error;
  }

  const receiptQueued = await queueExpoReceiptCheck(ticketTokens);
  return {
    sent,
    accepted,
    failed,
    invalidTokens: uniqueTokens(invalidTokens),
    failedTokens: uniqueTokens(failedTokens),
    ticketIds: ticketTokens.map((ticket) => ticket.id),
    receiptQueued,
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

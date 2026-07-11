import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { logger } from "./logger";

const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN || "";
const PUSH_PROVIDER = String(process.env.PUSH_PROVIDER || "expo").toLowerCase().trim();
const PUSH_TIMEOUT_MS = Number(process.env.PUSH_TIMEOUT_MS || 10_000);
const EXPO_BATCH_SIZE = Number(process.env.EXPO_PUSH_BATCH_SIZE || 100);
const PUSH_MAX_ATTEMPTS = Number(process.env.PUSH_MAX_ATTEMPTS || 3);
const PUSH_RETRY_BASE_MS = Number(process.env.PUSH_RETRY_BASE_MS || 500);

type PushPayload = { title: string; body: string; data?: Record<string, unknown> };
export type PushResult = { sent: number; accepted?: number; failed?: number; invalidTokens?: string[]; error?: string; provider?: string };

function uniqueTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens.map((t) => String(t || "").trim()).filter(Boolean)));
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const safeSize = Math.max(1, size);
  for (let i = 0; i < items.length; i += safeSize) out.push(items.slice(i, i + safeSize));
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

async function sendExpoBatch(tokens: string[], payload: PushPayload): Promise<PushResult> {
  const messages = tokens.map((to) => ({
    to,
    sound: "default",
    priority: "high",
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
  }));

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
        body: JSON.stringify(messages),
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
        return { sent: 0, accepted: 0, failed: tokens.length, provider: "expo", error: lastError };
      }

      let tickets: any[] = [];
      try {
        const parsed = JSON.parse(text);
        tickets = Array.isArray(parsed?.data) ? parsed.data : [];
      } catch {
        return { sent: 0, accepted: 0, failed: tokens.length, provider: "expo", error: "invalid_expo_response" };
      }

      let accepted = 0;
      let failed = 0;
      const invalidTokens: string[] = [];
      tokens.forEach((token, index) => {
        const ticket = tickets[index];
        if (ticket?.status === "ok") {
          accepted += 1;
          return;
        }
        failed += 1;
        if (ticket?.details?.error === "DeviceNotRegistered") invalidTokens.push(token);
      });

      logger.info({ requested: tokens.length, accepted, failed, attempt }, "expo push batch processed");
      return { sent: accepted, accepted, failed, invalidTokens, provider: "expo" };
    } catch (error) {
      lastError = String((error as Error)?.message || error);
      logger.warn({ err: error, count: tokens.length, attempt }, "expo push batch send attempt failed");
      if (attempt < maxAttempts) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  logger.error({ count: tokens.length, error: lastError }, "expo push batch exhausted retries");
  return { sent: 0, accepted: 0, failed: tokens.length, provider: "expo", error: lastError };
}

export async function sendExpoPushNotifications(tokens: string[], payload: PushPayload): Promise<PushResult> {
  const cleanTokens = uniqueTokens(tokens);
  if (!cleanTokens.length) return { sent: 0, accepted: 0, failed: 0, provider: PUSH_PROVIDER };

  // Provider switch is intentionally centralized. Expo remains supported for
  // dev-build/testing, while production can later route to FCM/APNs behind the
  // same function without changing booking/broadcast/admin routes.
  if (PUSH_PROVIDER !== "expo") {
    logger.warn({ provider: PUSH_PROVIDER }, "unsupported PUSH_PROVIDER; push not sent");
    return { sent: 0, accepted: 0, failed: cleanTokens.length, provider: PUSH_PROVIDER, error: "unsupported_push_provider" };
  }

  let sent = 0;
  let accepted = 0;
  let failed = 0;
  let lastError: string | undefined;
  const invalidTokens: string[] = [];
  for (const batch of chunks(cleanTokens, EXPO_BATCH_SIZE)) {
    const result = await sendExpoBatch(batch, payload);
    sent += result.sent || 0;
    accepted += result.accepted || 0;
    failed += result.failed || 0;
    if (result.invalidTokens?.length) invalidTokens.push(...result.invalidTokens);
    if (result.error) lastError = result.error;
  }
  return { sent, accepted, failed, invalidTokens: uniqueTokens(invalidTokens), provider: PUSH_PROVIDER, ...(lastError ? { error: lastError } : {}) };
}

export async function getAudiencePushTokens(audience: string) {
  if (audience === "all") {
    const rows = await db
      .select({ token: usersTable.expoPushToken })
      .from(usersTable)
      .where(isNotNull(usersTable.expoPushToken));
    return rows.map((r) => r.token).filter(Boolean) as string[];
  }

  if (audience === "providers") {
    const rows = await db
      .select({ token: usersTable.expoPushToken })
      .from(usersTable)
      .where(and(eq(usersTable.role, "provider"), isNotNull(usersTable.expoPushToken)));
    return rows.map((r) => r.token).filter(Boolean) as string[];
  }

  if (audience === "customers") {
    const rows = await db
      .select({ token: usersTable.expoPushToken })
      .from(usersTable)
      .where(and(eq(usersTable.role, "customer"), isNotNull(usersTable.expoPushToken)));
    return rows.map((r) => r.token).filter(Boolean) as string[];
  }

  return [];
}

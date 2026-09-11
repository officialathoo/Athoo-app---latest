import crypto from "crypto";
import { db } from "@workspace/db";
import {
  notificationsTable,
  pushTokensTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { categoryForType, removeInvalidPushTokens, sendExpoPushMessages, sendExpoPushNotifications } from "./push";
import { logger } from "./logger";
import { emitToUser } from "./eventBus";
import { queueEmail, type EmailCategory } from "./emailDelivery";
import { resolvePushTemplateOverride } from "./notificationTemplateRenderer";
import {
  getCategoryAllowances,
  type NotificationCategoryKey,
} from "./notificationPrefs";

type NotificationEmailOptions = {
  category: EmailCategory;
  templateKey?: string;
  variables?: Record<string, string | number | boolean | null | undefined>;
  dedupeKey?: string;
};

type NotifyInput = {
  userId: string;
  title: string;
  body: string;
  type?: string;
  link?: string;
  data?: Record<string, unknown>;
  email?: NotificationEmailOptions | false;
  /**
   * True when the recipient is already viewing the surface that produced this
   * notification (for example an open chat room). The row is still persisted
   * and delivered over realtime for inbox/badge purposes, but no native push,
   * sound or fallback alert is triggered.
   */
  suppressNativeAlert?: boolean;
};

type NotificationRow = {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  link: string | null;
  data: Record<string, unknown> | null;
};

export type NotifyResult = {
  /** true when the DB notification row was successfully created */
  created: boolean;
  /** true when the recipient has at least one expo push token on file */
  hasToken: boolean;
  /** true when push delivery was allowed by user preferences */
  pushAllowed: boolean;
  /** true when Expo accepted the push ticket */
  pushSent: boolean;
  /** number of active realtime connections that received the event */
  onlineConnections: number;
  /** true when an online native client was told to create a local fallback */
  fallbackSignaled: boolean;
  pushError?: string;
};

export type NotifyUsersResult = {
  requested: number;
  created: number;
  recipientsFound: number;
  withPushToken: number;
  onlineRecipients: number;
  pushAccepted: number;
  pushFailed: number;
  fallbackSignaled: number;
  invalidTokens: number;
  receiptQueued: boolean;
  pushError?: string;
};

/** Ring-style, security and account-critical alerts always attempt native delivery. */
const FORCED_ALERT_TYPES = new Set(["call", "incoming_call", "account"]);

function pushForcedByType(type: string): boolean {
  return FORCED_ALERT_TYPES.has(type) || type.startsWith("security");
}

function allowedCategoriesFor(
  allowance: Map<string, Set<NotificationCategoryKey>> | undefined,
  userId: string,
): Set<NotificationCategoryKey> | undefined {
  return allowance?.get(userId);
}

function pushDeliveryAllowed(
  userId: string,
  type: string,
  allowance: Map<string, Set<NotificationCategoryKey>> | undefined,
): boolean {
  if (pushForcedByType(type)) return true;
  const allowed = allowedCategoriesFor(allowance, userId);
  if (!allowed) return true;
  const category = categoryForType(type) as NotificationCategoryKey;
  return allowed.has(category);
}

function realtimePayload(
  row: NotificationRow,
  data: Record<string, unknown> | undefined,
  nativePushExpected: boolean,
) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    link: row.link,
    data: data || null,
    nativePushExpected,
  };
}

function signalPushFallback(
  userId: string,
  row: NotificationRow,
  data: Record<string, unknown> | undefined,
  reason: string,
): number {
  return emitToUser(userId, "notification:push-failed", {
    ...realtimePayload(row, data, false),
    reason,
  });
}

/**
 * Resolve every registered Expo push token for a user. The push_tokens
 * registry supports multiple devices per account; users.expo_push_token keeps
 * mirroring the latest registration so legacy readers and pre-registry rows
 * continue to work during rollout.
 */
async function resolveUserPushTokens(userId: string, legacyToken: string | null | undefined): Promise<string[]> {
  let registryTokens: string[] = [];
  try {
    const rows = await db
      .select({ token: pushTokensTable.token })
      .from(pushTokensTable)
      .where(eq(pushTokensTable.userId, userId));
    registryTokens = rows.map((row) => row.token);
  } catch (error) {
    logger.warn({ err: error, userId }, "push token registry lookup failed");
  }

  const tokens = new Set<string>();
  for (const token of registryTokens) {
    const trimmed = String(token || "").trim();
    if (trimmed) tokens.add(trimmed);
  }
  const legacy = typeof legacyToken === "string" ? legacyToken.trim() : "";
  if (legacy) tokens.add(legacy);
  return [...tokens];
}

export async function notifyUser(input: NotifyInput): Promise<NotifyResult> {
  const result: NotifyResult = {
    created: false,
    hasToken: false,
    pushAllowed: true,
    pushSent: false,
    onlineConnections: 0,
    fallbackSignaled: false,
  };

  const id = crypto.randomUUID();

  let user: { expoPushToken: string | null; email: string | null; name: string } | undefined;
  try {
    user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, input.userId),
      columns: { expoPushToken: true, email: true, name: true },
    });
  } catch (error) {
    logger.warn({ err: error, userId: input.userId }, "notification recipient lookup failed");
  }

  // Admin-authored templates override the built-in copy at send time when an
  // active template matches this notification type (see notificationTemplateRenderer).
  let effectiveTitle = input.title;
  let effectiveBody = input.body;
  try {
    const override = await resolvePushTemplateOverride(input.type || "info", input.data, { userName: user?.name || undefined });
    if (override) {
      if (override.title) effectiveTitle = override.title;
      if (override.body) effectiveBody = override.body;
    }
  } catch (templateError) {
    logger.warn({ err: templateError, userId: input.userId }, "notification template override failed");
  }

  const row: NotificationRow = {
    id,
    userId: input.userId,
    title: effectiveTitle,
    body: effectiveBody,
    type: input.type || "info",
    link: input.link || null,
    data: input.data || null,
  };

  try {
    await db.insert(notificationsTable).values({
      ...row,
      data: row.data as any,
    });
    result.created = true;
  } catch (error) {
    logger.error({ err: error, userId: input.userId }, "notification persistence failed");
    return result;
  }

  result.pushAllowed = pushDeliveryAllowed(input.userId, row.type, await getCategoryAllowances([input.userId]).catch((error) => {
    logger.warn({ err: error, userId: input.userId, notificationId: id }, "notification preference lookup failed");
    return undefined;
  }));
  if (input.suppressNativeAlert) result.pushAllowed = false;

  const tokens = result.pushAllowed
    ? await resolveUserPushTokens(input.userId, user?.expoPushToken)
    : [];
  result.hasToken = tokens.length > 0;

  // Realtime delivery is always attempted. The native client uses
  // nativePushExpected to decide whether it should schedule its own local sound
  // fallback, so foreground users do not silently miss message/job tones when a
  // device has no registered Expo token.
  result.onlineConnections = emitToUser(
    input.userId,
    "notification:new",
    realtimePayload(row, input.data, result.pushAllowed && result.hasToken),
  );

  if (!result.pushAllowed) return result;

  if (tokens.length > 0) {
    const pushRes = await sendExpoPushNotifications(tokens, {
      title: effectiveTitle,
      body: effectiveBody,
      type: row.type,
      data: {
        notificationId: id,
        type: row.type,
        link: row.link,
        ...(input.data || {}),
      },
    }).catch((error) => {
      logger.warn({ err: error, userId: input.userId, notificationId: id }, "notification push request failed");
      return undefined;
    });

    result.pushSent = Boolean(pushRes && pushRes.sent > 0);
    result.pushError = pushRes?.error;

    if (pushRes?.invalidTokens?.length) {
      const legacyToken = typeof user?.expoPushToken === "string" ? user.expoPushToken.trim() : "";
      if (legacyToken && pushRes.invalidTokens.includes(legacyToken)) {
        try {
          await db
            .update(usersTable)
            .set({ expoPushToken: null, updatedAt: new Date() })
            .where(eq(usersTable.id, input.userId));
        } catch (error) {
          logger.warn({ err: error, userId: input.userId, notificationId: id }, "invalid legacy push token cleanup failed");
        }
      }
      await removeInvalidPushTokens(pushRes.invalidTokens);
    }

    if (!result.pushSent && result.onlineConnections > 0) {
      result.fallbackSignaled = signalPushFallback(
        input.userId,
        row,
        input.data,
        pushRes?.error || "push_not_accepted",
      ) > 0;
    }
  }

  if (input.email && user?.email) {
    void queueEmail({
      userId: input.userId,
      to: user.email,
      templateKey: input.email.templateKey || "campaign_custom",
      category: input.email.category,
      dedupeKey: input.email.dedupeKey || `notification-email:${id}`,
      variables: {
        name: user.name || "there",
        subject: effectiveTitle,
        body: effectiveBody,
        category: input.email.category,
        ...(input.email.variables || {}),
      },
      metadata: {
        notificationId: id,
        notificationType: row.type,
        link: row.link,
      },
    }).catch((error) => logger.warn({ err: error, userId: input.userId, notificationId: id }, "notification email queue failed"));
  }

  return result;
}

export async function notifyUsers(
  userIds: string[],
  payload: {
    title: string;
    body: string;
    type?: string;
    link?: string;
    data?: Record<string, unknown>;
    email?: NotificationEmailOptions | false;
  },
): Promise<NotifyUsersResult> {
  const ids = [...new Set(userIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const result: NotifyUsersResult = {
    requested: ids.length,
    created: 0,
    recipientsFound: 0,
    withPushToken: 0,
    onlineRecipients: 0,
    pushAccepted: 0,
    pushFailed: 0,
    fallbackSignaled: 0,
    invalidTokens: 0,
    receiptQueued: false,
  };
  if (ids.length === 0) return result;

  // One template lookup per fan-out; the rendered copy is shared by every row.
  let effectiveTitle = payload.title;
  let effectiveBody = payload.body;
  try {
    const override = await resolvePushTemplateOverride(payload.type || "info", payload.data);
    if (override) {
      if (override.title) effectiveTitle = override.title;
      if (override.body) effectiveBody = override.body;
    }
  } catch (templateError) {
    logger.warn({ err: templateError, requested: ids.length }, "bulk notification template override failed");
  }

  const rows: NotificationRow[] = ids.map((userId) => ({
    id: crypto.randomUUID(),
    userId,
    title: effectiveTitle,
    body: effectiveBody,
    type: payload.type || "info",
    link: payload.link || null,
    data: payload.data || null,
  }));

  try {
    await db.insert(notificationsTable).values(rows.map((row) => ({ ...row, data: row.data as any })));
    result.created = rows.length;
  } catch (error) {
    logger.error({ err: error, requested: ids.length }, "bulk notification persistence failed");
    return result;
  }

  let recipients: Array<{
    id: string;
    expoPushToken: string | null;
    email: string | null;
    name: string;
  }> = [];
  try {
    recipients = await db
      .select({ id: usersTable.id, expoPushToken: usersTable.expoPushToken, email: usersTable.email, name: usersTable.name })
      .from(usersTable)
      .where(inArray(usersTable.id, ids));
  } catch (error) {
    logger.warn({ err: error, requested: ids.length }, "bulk notification recipient lookup failed");
  }
  result.recipientsFound = recipients.length;

  const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));
  const rowByUserId = new Map(rows.map((row) => [row.userId, row]));
  const tokenToUserId = new Map<string, string>();
  const onlineUserIds = new Set<string>();

  let allowance: Map<string, Set<NotificationCategoryKey>> | undefined;
  try {
    allowance = await getCategoryAllowances(ids);
  } catch (error) {
    logger.warn({ err: error, requested: ids.length }, "bulk notification preference lookup failed");
  }

  const tokensByUserId = new Map<string, Set<string>>(
    ids.map((id) => [id, new Set<string>()]),
  );
  try {
    const registryRows = await db
      .select({ userId: pushTokensTable.userId, token: pushTokensTable.token })
      .from(pushTokensTable)
      .where(inArray(pushTokensTable.userId, ids));
    for (const entry of registryRows) {
      const bucket = tokensByUserId.get(entry.userId);
      const token = String(entry.token || "").trim();
      if (bucket && token) bucket.add(token);
    }
  } catch (error) {
    logger.warn({ err: error, requested: ids.length }, "bulk push token registry lookup failed");
  }
  for (const recipient of recipients) {
    const bucket = tokensByUserId.get(recipient.id);
    const legacy = typeof recipient.expoPushToken === "string" ? recipient.expoPushToken.trim() : "";
    if (bucket && legacy) bucket.add(legacy);
  }

  for (const row of rows) {
    const pushAllowed = pushDeliveryAllowed(row.userId, row.type, allowance);
    const tokens = pushAllowed ? [...(tokensByUserId.get(row.userId) || [])] : [];
    for (const token of tokens) tokenToUserId.set(token, row.userId);
    const connections = emitToUser(
      row.userId,
      "notification:new",
      realtimePayload(row, payload.data, pushAllowed && tokens.length > 0),
    );
    if (connections > 0) onlineUserIds.add(row.userId);
  }
  result.onlineRecipients = onlineUserIds.size;
  result.withPushToken = tokenToUserId.size;

  const pushMessages = Array.from(tokenToUserId.entries()).map(([token, userId]) => {
    const notificationRow = rowByUserId.get(userId)!;
    return {
      token,
      payload: {
        title: effectiveTitle,
        body: effectiveBody,
        type: notificationRow.type,
        data: {
          notificationId: notificationRow.id,
          type: notificationRow.type,
          link: notificationRow.link,
          ...(payload.data || {}),
        },
      },
    };
  });

  if (pushMessages.length > 0) {
    const pushResult = await sendExpoPushMessages(pushMessages).catch((error) => {
      logger.warn({ err: error, recipientCount: pushMessages.length }, "bulk notification push request failed");
      return undefined;
    });
    result.pushAccepted = pushResult?.sent || 0;
    result.pushFailed = pushResult?.failed ?? Math.max(0, pushMessages.length - result.pushAccepted);
    result.invalidTokens = pushResult?.invalidTokens?.length || 0;
    result.receiptQueued = Boolean(pushResult?.receiptQueued);
    result.pushError = pushResult?.error;

    if (pushResult?.invalidTokens?.length) {
      await removeInvalidPushTokens(pushResult.invalidTokens);
    }

    const failedTokens = pushResult?.failedTokens?.length
      ? pushResult.failedTokens
      : (!pushResult || result.pushAccepted === 0 ? pushMessages.map((message) => message.token) : []);
    const failedUserIds = new Set(
      failedTokens.map((token) => tokenToUserId.get(token)).filter((value): value is string => Boolean(value)),
    );
    for (const userId of failedUserIds) {
      if (!onlineUserIds.has(userId)) continue;
      const row = rowByUserId.get(userId);
      if (!row) continue;
      if (signalPushFallback(userId, row, payload.data, pushResult?.error || "push_not_accepted") > 0) {
        result.fallbackSignaled += 1;
      }
    }
  }

  if (payload.email) {
    for (const recipient of recipients) {
      if (!recipient.email) continue;
      const notificationRow = rowByUserId.get(recipient.id)!;
      void queueEmail({
        userId: recipient.id,
        to: recipient.email,
        templateKey: payload.email.templateKey || "campaign_custom",
        category: payload.email.category,
        dedupeKey: payload.email.dedupeKey
          ? `${payload.email.dedupeKey}:${recipient.id}`
          : `notification-email:${notificationRow.id}`,
        variables: {
          name: recipient.name || "there",
          subject: effectiveTitle,
          body: effectiveBody,
          category: payload.email.category,
          ...(payload.email.variables || {}),
        },
        metadata: {
          notificationId: notificationRow.id,
          notificationType: notificationRow.type,
          link: notificationRow.link,
        },
      }).catch((error) => logger.warn({ err: error, userId: recipient.id, notificationId: notificationRow.id }, "bulk notification email queue failed"));
    }
  }

  return result;
}

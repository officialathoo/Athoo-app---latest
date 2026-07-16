import crypto from "crypto";
import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { sendExpoPushMessages, sendExpoPushNotifications } from "./push";
import { logger } from "./logger";
import { emitToUser } from "./eventBus";
import { queueEmail, type EmailCategory } from "./emailDelivery";

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
  /** true when the recipient has an expoPushToken on file */
  hasToken: boolean;
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

export async function notifyUser(input: NotifyInput): Promise<NotifyResult> {
  const result: NotifyResult = {
    created: false,
    hasToken: false,
    pushSent: false,
    onlineConnections: 0,
    fallbackSignaled: false,
  };

  const id = crypto.randomUUID();
  const row: NotificationRow = {
    id,
    userId: input.userId,
    title: input.title,
    body: input.body,
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

  let user: { expoPushToken: string | null; email: string | null; name: string } | undefined;
  try {
    user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, input.userId),
      columns: { expoPushToken: true, email: true, name: true },
    });
  } catch (error) {
    logger.warn({ err: error, userId: input.userId, notificationId: id }, "notification recipient lookup failed");
  }

  const token = typeof user?.expoPushToken === "string" && user.expoPushToken.trim()
    ? user.expoPushToken.trim()
    : null;
  result.hasToken = Boolean(token);

  // Realtime delivery is always attempted. The native client uses
  // nativePushExpected to decide whether it should schedule its own local sound
  // fallback, so foreground users do not silently miss message/job tones when a
  // device has no registered Expo token.
  result.onlineConnections = emitToUser(
    input.userId,
    "notification:new",
    realtimePayload(row, input.data, Boolean(token)),
  );

  if (token) {
    const pushRes = await sendExpoPushNotifications([token], {
      title: input.title,
      body: input.body,
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

    if (pushRes?.invalidTokens?.includes(token)) {
      await db
        .update(usersTable)
        .set({ expoPushToken: null, updatedAt: new Date() })
        .where(eq(usersTable.id, input.userId))
        .catch((error) => logger.warn({ err: error, userId: input.userId }, "invalid push token cleanup failed"));
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
        subject: input.title,
        body: input.body,
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

  const rows: NotificationRow[] = ids.map((userId) => ({
    id: crypto.randomUUID(),
    userId,
    title: payload.title,
    body: payload.body,
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

  for (const row of rows) {
    const recipient = recipientById.get(row.userId);
    const token = typeof recipient?.expoPushToken === "string" && recipient.expoPushToken.trim()
      ? recipient.expoPushToken.trim()
      : null;
    if (token) tokenToUserId.set(token, row.userId);
    const connections = emitToUser(
      row.userId,
      "notification:new",
      realtimePayload(row, payload.data, Boolean(token)),
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
        title: payload.title,
        body: payload.body,
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
      await db
        .update(usersTable)
        .set({ expoPushToken: null, updatedAt: new Date() })
        .where(inArray(usersTable.expoPushToken, pushResult.invalidTokens))
        .catch((error) => logger.warn({ err: error }, "bulk invalid push token cleanup failed"));
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
          subject: payload.title,
          body: payload.body,
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

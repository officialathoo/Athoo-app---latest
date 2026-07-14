import crypto from "crypto";
import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { sendExpoPushMessages, sendExpoPushNotifications } from "./push";
import { logger } from "./logger";
import { emitToUser } from "./eventBus";

type NotifyInput = {
  userId: string;
  title: string;
  body: string;
  type?: string;
  link?: string;
  data?: Record<string, unknown>;
};

export type NotifyResult = {
  /** true when the DB notification row was successfully created */
  created: boolean;
  /** true when the recipient has an expoPushToken on file */
  hasToken: boolean;
  /** true when a push was attempted AND Expo reported at least one accepted message */
  pushSent: boolean;
};

export async function notifyUser(input: NotifyInput): Promise<NotifyResult> {
  const result: NotifyResult = { created: false, hasToken: false, pushSent: false };
  try {
    const id = crypto.randomUUID();
    await db.insert(notificationsTable).values({
      id,
      userId: input.userId,
      title: input.title,
      body: input.body,
      type: input.type || "info",
      link: input.link || null,
      data: (input.data as any) || null,
    });
    result.created = true;

    // Push the notification instantly over the open WebSocket connection so the
    // user sees it in real-time without waiting for the next poll cycle.
    emitToUser(input.userId, "notification:new", {
      id,
      title: input.title,
      body: input.body,
      type: input.type || "info",
      link: input.link || null,
      data: input.data || null,
    });

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, input.userId),
      columns: { expoPushToken: true },
    });
    const token = user?.expoPushToken;
    if (token) {
      result.hasToken = true;
      const pushRes = await sendExpoPushNotifications([token], {
        title: input.title,
        body: input.body,
        type: input.type || "system",
        data: {
          notificationId: id,
          type: input.type || "system",
          link: input.link || null,
          ...(input.data || {}),
        },
      }).catch(() => undefined);
      if (pushRes && pushRes.sent > 0) result.pushSent = true;
      if (pushRes?.invalidTokens?.includes(token)) {
        await db.update(usersTable).set({ expoPushToken: null }).where(eq(usersTable.id, input.userId));
      }
    }
  } catch (e) {
    logger.error({ err: e }, "notifyUser failed");
  }
  return result;
}

export async function notifyUsers(
  userIds: string[],
  payload: { title: string; body: string; type?: string; link?: string; data?: Record<string, unknown> }
): Promise<number> {
  if (userIds.length === 0) return 0;
  const ids = [...new Set(userIds)];
  try {
    const rows = ids.map((userId) => ({
      id: crypto.randomUUID(),
      userId,
      title: payload.title,
      body: payload.body,
      type: payload.type || "info",
      link: payload.link || null,
      data: (payload.data as any) || null,
    }));
    await db.insert(notificationsTable).values(rows);

    // Realtime delivery for each recipient.
    for (const row of rows) {
      emitToUser(row.userId, "notification:new", {
        id: row.id,
        title: row.title,
        body: row.body,
        type: row.type,
        link: row.link || null,
        data: payload.data || null,
      });
    }

    const recipients = await db
      .select({ id: usersTable.id, expoPushToken: usersTable.expoPushToken })
      .from(usersTable)
      .where(inArray(usersTable.id, ids));
    const rowByUserId = new Map(rows.map((row) => [row.userId, row]));
    const pushMessages = recipients
      .filter((recipient): recipient is typeof recipient & { expoPushToken: string } =>
        typeof recipient.expoPushToken === "string" && recipient.expoPushToken.length > 0
      )
      .map((recipient) => {
        const notificationRow = rowByUserId.get(recipient.id)!;
        return {
          token: recipient.expoPushToken,
          payload: {
            title: payload.title,
            body: payload.body,
            type: payload.type || "system",
            data: {
              notificationId: notificationRow.id,
              type: payload.type || "system",
              link: payload.link || null,
              ...(payload.data || {}),
            },
          },
        };
      });
    if (pushMessages.length > 0) {
      const pushResult = await sendExpoPushMessages(pushMessages).catch(() => undefined);
      if (pushResult?.invalidTokens?.length) {
        await db.update(usersTable)
          .set({ expoPushToken: null })
          .where(inArray(usersTable.expoPushToken, pushResult.invalidTokens));
      }
    }
    return ids.length;
  } catch (e) {
    logger.error({ err: e }, "notifyUsers failed");
    return 0;
  }
}

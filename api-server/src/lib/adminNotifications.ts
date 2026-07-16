import crypto from "node:crypto";
import { db } from "@workspace/db";
import { adminNotificationsTable } from "@workspace/db/schema";
import { emitToRole, emitToUser } from "./eventBus";

export type CreateAdminNotificationInput = {
  title: string;
  message: string;
  type?: string;
  link?: string | null;
  targetAdminId?: string | null;
};

export function normalizeAdminNotificationLink(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.length > 500 || /[\r\n]/.test(raw) || /^(?:https?:)?\/\//i.test(raw)) return null;
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  if (!normalized.startsWith("/admin/") && normalized !== "/admin") return null;
  return normalized;
}

export async function createAdminNotification(input: CreateAdminNotificationInput) {
  const notification = {
    id: crypto.randomUUID(),
    title: input.title.trim().slice(0, 180),
    message: input.message.trim().slice(0, 1200),
    type: String(input.type || "info").trim().slice(0, 60) || "info",
    link: normalizeAdminNotificationLink(input.link),
    targetAdminId: input.targetAdminId || null,
    readByAdminIds: [] as string[],
  };

  if (!notification.title || !notification.message) {
    throw new Error("Admin notification title and message are required");
  }

  await db.insert(adminNotificationsTable).values(notification);
  const payload = {
    notificationId: notification.id,
    type: notification.type,
    link: notification.link,
    title: notification.title,
  };
  if (notification.targetAdminId) emitToUser(notification.targetAdminId, "notification:new", payload);
  else emitToRole("admin", "notification:new", payload);
  return notification;
}

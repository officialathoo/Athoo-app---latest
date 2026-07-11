import crypto from "crypto";
import { Router } from "express";
import type { Response } from "express";
import { and, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { bookingsTable, chatsTable, messagesTable, usersTable } from "@workspace/db/schema";
import { logger } from "../lib/logger";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { emitToUser } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";

const router = Router();
const generateId = () => crypto.randomUUID();

function isParticipant(chat: typeof chatsTable.$inferSelect, userId: string) {
  return chat.participant1Id === userId || chat.participant2Id === userId;
}

router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;
    if (cursor && Number.isNaN(cursor.getTime())) return res.status(400).json({ error: "Invalid chat cursor" });
    const visible = or(
      and(eq(chatsTable.participant1Id, userId), isNull(chatsTable.participant1HiddenAt)),
      and(eq(chatsTable.participant2Id, userId), isNull(chatsTable.participant2HiddenAt)),
    );
    const where = cursor ? and(visible, lt(chatsTable.lastMessageAt, cursor)) : visible;
    const rows = await db.select().from(chatsTable).where(where).orderBy(desc(chatsTable.lastMessageAt)).limit(limit + 1);
    const hasMore = rows.length > limit;
    const chats = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && chats.length ? chats[chats.length - 1]?.lastMessageAt?.toISOString() || null : null;
    return res.json({ chats, hasMore, nextCursor });
  } catch (error) {
    logger.error({ err: error }, "chat list error");
    return res.status(500).json({ error: "Failed to load chats" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const otherUserId = String(req.body?.otherUserId || "").trim();
    const bookingId = req.body?.bookingId ? String(req.body.bookingId) : null;
    if (!otherUserId || otherUserId === userId) return res.status(400).json({ error: "A valid otherUserId is required" });

    const [me, other] = await Promise.all([
      db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) }),
      db.query.usersTable.findFirst({ where: eq(usersTable.id, otherUserId) }),
    ]);
    if (!me || !other || other.isBlocked || other.isDeactivated || other.accountStatus === "deleted") {
      return res.status(404).json({ error: "Chat participant is unavailable" });
    }

    let service = req.body?.service ? String(req.body.service) : null;
    if (bookingId) {
      const booking = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, bookingId) });
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      const participants = new Set([booking.customerId, booking.providerId].filter(Boolean));
      if (!participants.has(userId) || !participants.has(otherUserId)) {
        return res.status(403).json({ error: "Chat participants must belong to this booking" });
      }
      service = booking.service || service;
    }

    const pairCondition = or(
      and(eq(chatsTable.participant1Id, userId), eq(chatsTable.participant2Id, otherUserId)),
      and(eq(chatsTable.participant1Id, otherUserId), eq(chatsTable.participant2Id, userId)),
    );
    const existing = await db.query.chatsTable.findFirst({
      where: bookingId ? and(pairCondition, eq(chatsTable.bookingId, bookingId)) : pairCondition,
    });
    if (existing) {
      await db.update(chatsTable).set(existing.participant1Id === userId
        ? { participant1HiddenAt: null, updatedAt: new Date() }
        : { participant2HiddenAt: null, updatedAt: new Date() }
      ).where(eq(chatsTable.id, existing.id));
      return res.json({ chat: { ...existing, participant1HiddenAt: existing.participant1Id === userId ? null : existing.participant1HiddenAt, participant2HiddenAt: existing.participant2Id === userId ? null : existing.participant2HiddenAt } });
    }

    const chat = {
      id: generateId(), participant1Id: userId, participant2Id: otherUserId,
      participant1Name: me.name, participant2Name: other.name, bookingId, service,
    };
    await db.insert(chatsTable).values(chat);
    return res.status(201).json({ chat });
  } catch (error) {
    logger.error({ err: error }, "chat create error");
    return res.status(500).json({ error: "Failed to create chat" });
  }
});

router.get("/:chatId/messages", requireAuth, async (req: AuthRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const userId = req.user!.userId;
    const chatId = String(req.params.chatId);
    const chat = await db.query.chatsTable.findFirst({ where: eq(chatsTable.id, chatId) });
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!isParticipant(chat, userId)) return res.status(403).json({ error: "Not a participant of this chat" });

    const limitNum = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 100);
    let whereCondition: any = eq(messagesTable.chatId, chatId);
    if (req.query.since) {
      const sinceDate = new Date(String(req.query.since));
      if (Number.isNaN(sinceDate.getTime())) return res.status(400).json({ error: "Invalid since timestamp" });
      whereCondition = and(whereCondition, sql`${messagesTable.createdAt} > ${sinceDate}`);
    }
    const messages = await db.select().from(messagesTable).where(whereCondition).orderBy(messagesTable.createdAt).limit(limitNum);
    return res.json({ messages, chatLocked: chat.isLocked, lockedReason: chat.lockedReason || null });
  } catch (error) {
    logger.error({ err: error }, "messages list error");
    return res.status(500).json({ error: "Failed to load messages" });
  }
});

router.post("/:chatId/messages", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = String(req.params.chatId);
    const normalizedText = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const mediaUrl = typeof req.body?.mediaUrl === "string" ? req.body.mediaUrl.trim() : "";
    const clientMessageId = typeof req.body?.clientMessageId === "string" ? req.body.clientMessageId.trim() : "";
    if (!normalizedText && !mediaUrl) return res.status(400).json({ error: "Message text or attachment is required" });
    if (normalizedText.length > 4000) return res.status(400).json({ error: "Message is too long" });
    if (!clientMessageId || clientMessageId.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(clientMessageId)) {
      return res.status(400).json({ error: "A valid clientMessageId is required" });
    }

    const chat = await db.query.chatsTable.findFirst({ where: eq(chatsTable.id, chatId) });
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!isParticipant(chat, userId)) return res.status(403).json({ error: "Not a participant of this chat" });
    if (chat.isLocked) return res.status(423).json({ error: chat.lockedReason || "This conversation is locked by Athoo support" });

    const existing = await db.query.messagesTable.findFirst({ where: and(
      eq(messagesTable.chatId, chatId), eq(messagesTable.senderId, userId), eq(messagesTable.clientMessageId, clientMessageId),
    ) });
    if (existing) return res.json({ message: existing, duplicate: true });

    const message = {
      id: generateId(), chatId, senderId: userId,
      senderName: chat.participant1Id === userId ? chat.participant1Name : chat.participant2Name,
      text: normalizedText || "Attachment", mediaUrl: mediaUrl || null,
      mediaType: req.body?.mediaType || null, fileName: req.body?.fileName || null,
      deliveryStatus: "sent", clientMessageId,
    };
    const inserted = await db.insert(messagesTable).values(message).onConflictDoNothing().returning();
    if (!inserted.length) {
      const duplicate = await db.query.messagesTable.findFirst({ where: and(
        eq(messagesTable.chatId, chatId), eq(messagesTable.senderId, userId), eq(messagesTable.clientMessageId, clientMessageId),
      ) });
      if (duplicate) return res.json({ message: duplicate, duplicate: true });
      return res.status(409).json({ error: "Message could not be committed" });
    }

    const recipientId = chat.participant1Id === userId ? chat.participant2Id : chat.participant1Id;
    await db.update(chatsTable).set({
      lastMessage: normalizedText || "Attachment", lastMessageAt: new Date(), updatedAt: new Date(),
      ...(chat.participant1Id === recipientId ? { participant1HiddenAt: null } : { participant2HiddenAt: null }),
      ...(chat.participant1Id === userId ? { participant1HiddenAt: null } : { participant2HiddenAt: null }),
    }).where(eq(chatsTable.id, chatId));

    emitToUser(recipientId, "chat:message", { message, chatId });
    emitToUser(userId, "chat:message", { message, chatId });
    notifyUser({
      userId: recipientId,
      title: `New message from ${message.senderName}`,
      body: normalizedText ? normalizedText.slice(0, 120) : "Sent an attachment",
      type: "chat", link: `/chat/${chat.id}`,
      data: { chatId: chat.id, senderId: userId, senderName: message.senderName },
    }).catch(() => undefined);

    return res.status(201).json({ message, duplicate: false });
  } catch (error) {
    logger.error({ err: error }, "message send error");
    return res.status(500).json({ error: "Failed to send message" });
  }
});

router.post("/:chatId/read", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.user!.userId;
    const chat = await db.query.chatsTable.findFirst({ where: eq(chatsTable.id, chatId) });
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!isParticipant(chat, userId)) return res.status(403).json({ error: "Not a participant of this chat" });
    await db.update(messagesTable).set({ isRead: true, deliveryStatus: "read" }).where(and(
      eq(messagesTable.chatId, chatId), ne(messagesTable.senderId, userId), eq(messagesTable.isRead, false),
    ));
    const otherUserId = chat.participant1Id === userId ? chat.participant2Id : chat.participant1Id;
    emitToUser(otherUserId, "chat:read", { chatId, readerId: userId, ts: Date.now() });
    return res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "chat read error");
    return res.status(500).json({ error: "Failed to mark as read" });
  }
});

// Hides a conversation only for the requesting participant. Shared evidence is retained.
router.delete("/:chatId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = String(req.params.chatId);
    const chat = await db.query.chatsTable.findFirst({ where: eq(chatsTable.id, chatId) });
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!isParticipant(chat, userId)) return res.status(403).json({ error: "Not a participant of this chat" });
    await db.update(chatsTable).set(chat.participant1Id === userId
      ? { participant1HiddenAt: new Date(), updatedAt: new Date() }
      : { participant2HiddenAt: new Date(), updatedAt: new Date() }
    ).where(eq(chatsTable.id, chatId));
    return res.json({ success: true, message: "Conversation hidden from your chat list" });
  } catch (error) {
    logger.error({ err: error }, "chat hide error");
    return res.status(500).json({ error: "Failed to hide chat" });
  }
});

export default router;

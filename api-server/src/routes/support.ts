import crypto from "node:crypto";
import { logger } from "../lib/logger";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { bookingsTable, supportTicketsTable, ticketNotesTable, usersTable } from "@workspace/db/schema";
import { and, desc, eq, or } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { validateOwnedUploadObjectPaths } from "../lib/storageSecurity";
import { createAdminNotification } from "../lib/adminNotifications";

const router = Router();
const VALID_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

function generateId(): string {
  return crypto.randomUUID();
}

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const raw = (req.body || {}) as Record<string, unknown>;
    const subject = String(raw.subject || raw.title || "").trim();
    const message = String(raw.message || raw.description || raw.body || "").trim();
    const bookingId = String(raw.bookingId || raw.relatedBookingId || "").trim() || null;
    const requestedPriority = String(raw.priority || "normal").trim().toLowerCase();
    const priority = VALID_PRIORITIES.has(requestedPriority) ? requestedPriority : "normal";

    if (subject.length < 3 || subject.length > 120) {
      res.status(400).json({ error: "Subject must be 3-120 characters" });
      return;
    }
    if (message.length < 20 || message.length > 4000) {
      res.status(400).json({ error: "Message must be 20-4000 characters" });
      return;
    }

    const mediaValidation = validateOwnedUploadObjectPaths(raw.mediaUrls, userId, { maxItems: 5 });
    if (!mediaValidation.ok) {
      res.status(400).json({ error: mediaValidation.error });
      return;
    }

    const [user, booking] = await Promise.all([
      db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) }),
      bookingId
        ? db.query.bookingsTable.findFirst({
            where: and(
              eq(bookingsTable.id, bookingId),
              or(eq(bookingsTable.customerId, userId), eq(bookingsTable.providerId, userId)),
            ),
          })
        : Promise.resolve(null),
    ]);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (bookingId && !booking) {
      res.status(400).json({ error: "The selected booking is not available for this account" });
      return;
    }

    const ticket = {
      id: generateId(),
      userId,
      userName: String(user.name || "User").trim() || "User",
      userPhone: String(user.phone || "N/A").trim() || "N/A",
      userRole: String(user.role || "customer").trim() || "customer",
      subject,
      message,
      bookingId,
      mediaUrls: mediaValidation.paths,
      status: "open",
      priority,
    };

    await db.insert(supportTicketsTable).values(ticket);

    try {
      await createAdminNotification({
        title: `New support ticket: ${ticket.subject}`,
        message: `${ticket.userName} (${ticket.userRole}) submitted a support request.`,
        type: "support",
        link: `/admin/support/${ticket.id}`,
      });
    } catch (adminNotificationError) {
      logger.error({ err: adminNotificationError }, "support admin notification error");
    }

    res.status(201).json({ ticket });
  } catch (e) {
    logger.error({ err: e }, "support ticket create error");
    res.status(500).json({ error: "Failed to submit support ticket" });
  }
});

router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const tickets = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.userId, userId))
      .orderBy(desc(supportTicketsTable.createdAt))
      .limit(50);
    res.json({ tickets });
  } catch (e) {
    res.status(500).json({ error: "Failed to load tickets" });
  }
});

router.get("/my", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const tickets = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.userId, userId))
      .orderBy(desc(supportTicketsTable.createdAt))
      .limit(50);
    res.json({ tickets });
  } catch (e) {
    res.status(500).json({ error: "Failed to load tickets" });
  }
});

router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const ticketId = String(req.params.id);

    const ticket = await db.query.supportTicketsTable.findFirst({
      where: eq(supportTicketsTable.id, ticketId),
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (req.user!.role !== "admin" && ticket.userId !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const notes = await db
      .select()
      .from(ticketNotesTable)
      .where(and(eq(ticketNotesTable.ticketId, ticketId), eq(ticketNotesTable.isInternal, false)))
      .orderBy(ticketNotesTable.createdAt);

    res.json({ ticket, replies: notes });
  } catch (e) {
    logger.error({ err: e }, "support ticket get error");
    res.status(500).json({ error: "Failed to load ticket" });
  }
});

export default router;

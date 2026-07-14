import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router } from "express";
import { db } from "@workspace/db";
import { adminNotificationsTable, supportTicketsTable, ticketNotesTable, usersTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { Response } from "express";
import { validateOwnedUploadObjectPaths } from "../lib/storageSecurity";

const router = Router();

function generateId(): string {
  return crypto.randomUUID();
}

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const raw = (req.body || {}) as Record<string, any>;
    const subject = String(raw.subject || raw.title || "").trim();
    const message = String(raw.message || raw.description || raw.body || "").trim();
    const bookingId = raw.bookingId || raw.relatedBookingId || null;
    const mediaValidation = validateOwnedUploadObjectPaths(raw.mediaUrls, userId, { maxItems: 5 });
    if (!mediaValidation.ok) {
      res.status(400).json({ error: mediaValidation.error });
      return;
    }
    const mediaUrls = mediaValidation.paths;
    const priority = String(raw.priority || "normal").trim().toLowerCase();

    if (!subject || !message) {
      res.status(400).json({ error: "Subject and message are required" });
      return;
    }

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const ticket = {
      id: generateId(),
      userId,
      userName: String(user.name || "User").trim() || "User",
      userPhone: String(user.phone || "N/A").trim() || "N/A",
      userRole: String(user.role || "customer").trim() || "customer",
      subject: subject.trim(),
      message: message.trim(),
      bookingId: bookingId || null,
      mediaUrls,
      status: "open",
      priority: priority || "normal",
    };

    await db.insert(supportTicketsTable).values(ticket);

    try {
      await db.insert(adminNotificationsTable).values({
        id: generateId(),
        title: `New support ticket: ${ticket.subject}`,
        message: `${ticket.userName} (${ticket.userRole}) submitted a support request.`,
        type: "support",
        link: `/complaints`,
        readByAdminIds: [],
      });
    } catch (adminNotificationError) {
      logger.error({ err: adminNotificationError }, "support admin notification error");
    }

    res.json({ ticket });
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

// Get a single ticket with admin replies (non-internal notes only)
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

    // Users can only view their own tickets; admins can view any
    if (req.user!.role !== "admin" && ticket.userId !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Return admin replies that are not marked as internal-only
    const notes = await db
      .select()
      .from(ticketNotesTable)
      .where(
        and(
          eq(ticketNotesTable.ticketId, ticketId),
          eq(ticketNotesTable.isInternal, false)
        )
      )
      .orderBy(ticketNotesTable.createdAt);

    res.json({ ticket, replies: notes });
  } catch (e) {
    logger.error({ err: e }, "support ticket get error");
    res.status(500).json({ error: "Failed to load ticket" });
  }
});

export default router;


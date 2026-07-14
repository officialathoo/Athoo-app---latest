import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { reportIssuesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import crypto from "crypto";

function generateId(): string { return crypto.randomUUID(); }

const userRouter = Router();
const adminRouter = Router();

// POST /report-issues — authenticated user reports an issue
userRouter.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { bookingId, reportedId, reportedName, category, description } = req.body as Record<string, any>;
    if (!category?.trim() || !description?.trim()) {
      return res.status(400).json({ error: "Category and description are required" });
    }
    const report = {
      id: generateId(),
      bookingId: bookingId || null,
      reporterId: req.user!.userId,
      reporterName: (req.user as any).name || "Unknown",
      reporterRole: req.user!.role,
      reportedId: reportedId || null,
      reportedName: reportedName || null,
      category: category.trim(),
      description: description.trim(),
      status: "open",
    };
    await db.insert(reportIssuesTable).values(report);
    return res.status(201).json({ report });
  } catch (e) {
    logger.error({ err: e }, "report-issues create error");
    return res.status(500).json({ error: "Failed to submit report" });
  }
});

// GET /report-issues/mine — user's own reports
userRouter.get("/mine", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const reports = await db
      .select()
      .from(reportIssuesTable)
      .where(eq(reportIssuesTable.reporterId, req.user!.userId))
      .orderBy(desc(reportIssuesTable.createdAt));
    return res.json({ reports });
  } catch {
    return res.status(500).json({ error: "Failed to load reports" });
  }
});

// Admin routes
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/", async (req, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const where = status ? eq(reportIssuesTable.status, status) : undefined;
    const reports = await db
      .select()
      .from(reportIssuesTable)
      .where(where)
      .orderBy(desc(reportIssuesTable.createdAt));
    return res.json({ reports });
  } catch {
    return res.status(500).json({ error: "Failed to load reports" });
  }
});

adminRouter.patch("/:id", requirePermission("support.write"), async (req: AuthRequest, res: Response) => {
  try {
    const { status, adminNote } = req.body as Record<string, any>;
    const update: Record<string, any> = { updatedAt: new Date() };
    if (status) update.status = status;
    if (adminNote !== undefined) update.adminNote = adminNote?.trim() || null;
    if (status === "resolved" || status === "dismissed") {
      update.resolvedBy = req.user!.userId;
      update.resolvedAt = new Date();
    }
    await db.update(reportIssuesTable).set(update).where(eq(reportIssuesTable.id, req.params.id as string));
    const updated = await db.query.reportIssuesTable.findFirst({
      where: eq(reportIssuesTable.id, req.params.id as string),
    });
    return res.json({ report: updated });
  } catch {
    return res.status(500).json({ error: "Failed to update report" });
  }
});

export { userRouter as reportIssuesRouter, adminRouter as reportIssuesAdminRouter };
export default userRouter;

import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable } from "@workspace/db/schema";
import { desc, eq, or } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(or(eq(invoicesTable.customerId, userId), eq(invoicesTable.providerId, userId)))
      .orderBy(desc(invoicesTable.createdAt));
    return res.json({ invoices });
  } catch (err) {
    logger.error({ err }, "invoices list error");
    return res.status(500).json({ error: "Failed to load invoices" });
  }
});

router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.customerId !== userId && invoice.providerId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }
    return res.json({ invoice });
  } catch (err) {
    logger.error({ err }, "invoice get error");
    return res.status(500).json({ error: "Failed to load invoice" });
  }
});

export default router;

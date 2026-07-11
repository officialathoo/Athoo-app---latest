import { Router, type Response } from "express";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { promotionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.post("/validate", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = String(req.body?.code || "").trim().toUpperCase();
    const bookingValue = Number(req.body?.bookingValue || 0);
    if (!code) {
      res.status(400).json({ error: "Promo code required" });
      return;
    }
    const promo = await db.query.promotionsTable.findFirst({
      where: eq(promotionsTable.code, code),
    });
    if (!promo || !promo.isActive) {
      res.status(404).json({ error: "Invalid or expired promo code" });
      return;
    }
    const now = new Date();
    if (promo.validFrom && promo.validFrom > now) {
      res.status(400).json({ error: "This promo is not active yet" });
      return;
    }
    if (promo.validUntil && promo.validUntil < now) {
      res.status(400).json({ error: "This promo has expired" });
      return;
    }
    if (promo.maxUses != null && (promo.usedCount || 0) >= promo.maxUses) {
      res.status(400).json({ error: "This promo has reached its usage limit" });
      return;
    }
    if (promo.minBookingValue && bookingValue < promo.minBookingValue) {
      res.status(400).json({
        error: `Minimum booking value is Rs. ${promo.minBookingValue}`,
      });
      return;
    }
    const discount = promo.discountType === "fixed"
      ? Math.min(promo.discountValue, bookingValue)
      : Math.round((bookingValue * promo.discountValue) / 100);
    res.json({
      promo: {
        id: promo.id,
        code: promo.code,
        description: promo.description,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
      },
      discount,
      finalAmount: Math.max(0, bookingValue - discount),
    });
  } catch (e) {
    logger.error({ err: e }, "promo validate error");
    res.status(500).json({ error: "Failed to validate promo code" });
  }
});

router.post("/redeem", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: "Promo code required" });
      return;
    }
    const promo = await db.query.promotionsTable.findFirst({
      where: eq(promotionsTable.code, code),
    });
    if (!promo || !promo.isActive) {
      res.status(404).json({ error: "Invalid promo code" });
      return;
    }
    if (promo.maxUses != null && (promo.usedCount || 0) >= promo.maxUses) {
      res.status(400).json({ error: "This promo has reached its usage limit" });
      return;
    }
    await db.update(promotionsTable)
      .set({ usedCount: (promo.usedCount || 0) + 1, updatedAt: new Date() })
      .where(eq(promotionsTable.id, promo.id));
    res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, "promo redeem error");
    res.status(500).json({ error: "Failed to redeem promo code" });
  }
});

export default router;


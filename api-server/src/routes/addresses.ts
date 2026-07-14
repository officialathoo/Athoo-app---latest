import crypto from "crypto";
import { Router } from "express";
import { db } from "@workspace/db";
import { savedAddressesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { Response } from "express";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const addresses = await db
      .select()
      .from(savedAddressesTable)
      .where(eq(savedAddressesTable.userId, userId))
      .orderBy(savedAddressesTable.createdAt);
    res.json({ addresses });
  } catch (e) {
    res.status(500).json({ error: "Failed to load addresses" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { label, address, icon, latitude, longitude } = req.body;

    if (!label?.trim() || !address?.trim()) {
      res.status(400).json({ error: "Label and address are required" });
      return;
    }

    const existing = await db
      .select()
      .from(savedAddressesTable)
      .where(eq(savedAddressesTable.userId, userId));

    if (existing.length >= 10) {
      res.status(409).json({ error: "You can save up to 10 addresses" });
      return;
    }
    const normalizedAddress = address.trim().replace(/\s+/g, " ").toLowerCase();
    const duplicate = existing.some((item) => item.address.trim().replace(/\s+/g, " ").toLowerCase() === normalizedAddress);
    if (duplicate) {
      res.status(409).json({ error: "This address is already saved" });
      return;
    }

    const lat = latitude == null ? null : Number(latitude);
    const lng = longitude == null ? null : Number(longitude);
    if ((lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
        (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180))) {
      res.status(400).json({ error: "Invalid address coordinates" });
      return;
    }

    const isDefault = existing.length === 0;

    const newAddress = {
      id: crypto.randomUUID(),
      userId,
      label: label.trim(),
      address: address.trim(),
      icon: icon || "map-pin",
      isDefault,
      latitude: lat,
      longitude: lng,
    };

    await db.insert(savedAddressesTable).values(newAddress);
    const saved = await db
      .select()
      .from(savedAddressesTable)
      .where(eq(savedAddressesTable.id, newAddress.id));
    res.json({ address: saved[0] });
  } catch (e) {
    res.status(500).json({ error: "Failed to add address" });
  }
});

router.patch("/:id/default", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const target = await db
      .select()
      .from(savedAddressesTable)
      .where(and(eq(savedAddressesTable.id, id), eq(savedAddressesTable.userId, userId)));

    if (!target.length) {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(savedAddressesTable)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(savedAddressesTable.userId, userId));

      await tx
        .update(savedAddressesTable)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(and(eq(savedAddressesTable.id, id), eq(savedAddressesTable.userId, userId)));
    });

    const addresses = await db
      .select()
      .from(savedAddressesTable)
      .where(eq(savedAddressesTable.userId, userId))
      .orderBy(savedAddressesTable.createdAt);

    res.json({ addresses });
  } catch (e) {
    res.status(500).json({ error: "Failed to set default address" });
  }
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const target = await db
      .select()
      .from(savedAddressesTable)
      .where(and(eq(savedAddressesTable.id, id), eq(savedAddressesTable.userId, userId)));

    if (!target.length) {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    await db
      .delete(savedAddressesTable)
      .where(eq(savedAddressesTable.id, id));

    if (target[0].isDefault) {
      const remaining = await db
        .select()
        .from(savedAddressesTable)
        .where(eq(savedAddressesTable.userId, userId))
        .orderBy(savedAddressesTable.createdAt)
        .limit(1);

      if (remaining.length > 0) {
        await db
          .update(savedAddressesTable)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(savedAddressesTable.id, remaining[0].id));
      }
    }

    const addresses = await db
      .select()
      .from(savedAddressesTable)
      .where(eq(savedAddressesTable.userId, userId))
      .orderBy(savedAddressesTable.createdAt);

    res.json({ addresses });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete address" });
  }
});

export default router;


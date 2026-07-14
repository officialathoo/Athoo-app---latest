import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { productionReadinessSnapshot } from "../lib/productionReadiness";
import { ok, fail } from "../lib/standardResponse";

const router = Router();

router.get("/readiness", requireAuth, requireAdmin, async (_req, res) => {
  return ok(res, productionReadinessSnapshot(), "Production readiness snapshot generated");
});

router.get("/admin-360/:userId", requireAuth, requireAdmin, async (req, res) => {
  const userId = String(req.params.userId || "");
  if (!userId) return fail(res, 400, "User ID is required", "VALIDATION_ERROR");
  const data = await db.execute(sql`
    select
      (select row_to_json(u) from users u where u.id = ${userId}) as profile,
      (select coalesce(json_agg(b order by b.created_at desc), '[]'::json) from bookings b where b.customer_id = ${userId} or b.provider_id = ${userId}) as bookings,
      (select coalesce(json_agg(i order by i.created_at desc), '[]'::json) from invoices i where i.customer_id = ${userId} or i.provider_id = ${userId}) as invoices,
      (select coalesce(json_agg(n order by n.created_at desc), '[]'::json) from notifications n where n.user_id = ${userId}) as notifications,
      (select coalesce(json_agg(t order by t.created_at desc), '[]'::json) from support_tickets t where t.user_id = ${userId}) as complaints,
      (select coalesce(json_agg(l order by l.created_at desc), '[]'::json) from login_history l where l.user_id = ${userId}) as login_history
  `);
  return ok(res, data.rows?.[0] || {}, "User 360 loaded");
});

router.get("/booking-360/:bookingId", requireAuth, requireAdmin, async (req, res) => {
  const bookingId = String(req.params.bookingId || "");
  if (!bookingId) return fail(res, 400, "Booking ID is required", "VALIDATION_ERROR");
  const data = await db.execute(sql`
    select
      (select row_to_json(b) from bookings b where b.id = ${bookingId}) as booking,
      (select coalesce(json_agg(br order by br.created_at desc), '[]'::json) from broadcast_requests br where br.booking_id = ${bookingId}) as broadcasts,
      (select coalesce(json_agg(n order by n.created_at desc), '[]'::json) from negotiations n where n.booking_id = ${bookingId}) as negotiations,
      (select coalesce(json_agg(i order by i.created_at desc), '[]'::json) from invoices i where i.booking_id = ${bookingId}) as invoices,
      (select coalesce(json_agg(a order by a.created_at desc), '[]'::json) from audit_log a where a.target_id = ${bookingId}) as audit_timeline
  `);
  return ok(res, data.rows?.[0] || {}, "Booking 360 loaded");
});

export default router;

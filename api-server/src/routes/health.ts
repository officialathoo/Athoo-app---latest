import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getMigrationHealth } from "../lib/databaseMigrations";
import { queueStats } from "../lib/queue";
import { bookingSweeperStats } from "../lib/bookingSweeper";
import { runtimeMetricsSnapshot } from "../lib/runtimeMetrics";
import { getEmailConfigurationStatus } from "../lib/email";
import { getMapConfigurationStatus } from "../lib/mapConfiguration";
import { getPushConfigurationStatus } from "../lib/push";
import { getOtpDeliveryConfigurationStatus } from "../lib/otpDelivery";
import { getStorageConfigurationStatus } from "../lib/storageProvider";
import { getReleaseIdentity } from "../lib/releaseIdentity";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({ ...data, release: getReleaseIdentity() });
});

// Deep health: pings the database. Use for production monitoring / load balancer.
router.get("/healthz/deep", async (_req, res) => {
  const startedAt = Date.now();
  try {
    const result = await db.execute(sql`SELECT 1 AS ok`);
    const dbMs = Date.now() - startedAt;
    const migrations = await getMigrationHealth();
    res.status(migrations.ok ? 200 : 503).json({
      status: migrations.ok ? "ok" : "degraded",
      uptimeSeconds: Math.round(process.uptime()),
      release: getReleaseIdentity(),
      checks: {
        database: { ok: true, latencyMs: dbMs, rows: result.rows?.length ?? 0 },
        migrations,
        queue: queueStats(),
        bookingSweeper: bookingSweeperStats(),
        email: getEmailConfigurationStatus(),
        maps: getMapConfigurationStatus(),
        push: getPushConfigurationStatus(),
        storage: getStorageConfigurationStatus(),
        otpDelivery: getOtpDeliveryConfigurationStatus(),
      },
    });
  } catch (e) {
    res.status(503).json({
      status: "degraded",
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database: { ok: false, error: (e as Error).message } },
    });
  }
});

router.get("/healthz/metrics", (req, res) => {
  const configuredToken = String(process.env.METRICS_TOKEN || "").trim();
  const suppliedToken = String(req.headers["x-metrics-token"] || "").trim();
  if (process.env.NODE_ENV === "production" && (!configuredToken || suppliedToken !== configuredToken)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({
    status: "ok",
    runtime: runtimeMetricsSnapshot(Number(req.query.limit || 25)),
    queue: queueStats(),
    bookingSweeper: bookingSweeperStats(),
  });
});

export default router;


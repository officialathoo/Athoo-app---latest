import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { serviceAreasTable } from "@workspace/db/schema";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getMigrationHealth } from "../lib/databaseMigrations";
import { queueStats } from "../lib/queue";
import { bookingSweeperStats } from "../lib/bookingSweeper";
import { runtimeMetricsSnapshot } from "../lib/runtimeMetrics";
import { getRuntimeEmailConfigurationStatus } from "../lib/email";
import { getMapConfigurationStatus } from "../lib/mapConfiguration";
import { getRuntimeMapOverrides } from "../lib/mapRuntime";
import { getRuntimePushConfigurationStatus } from "../lib/push";
import { getOtpDeliveryConfigurationStatus } from "../lib/otpDelivery";
import { getStorageConfigurationStatus } from "../lib/storageProvider";
import { getReleaseIdentity } from "../lib/releaseIdentity";
import { getInfrastructureProviderStatus } from "../lib/infrastructureConfiguration";
import { getUploadScannerStatus } from "../lib/uploadScanner";
import { uploadSecurityMaintenanceStats } from "../lib/uploadSecurityMaintenance";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({ ...data, release: getReleaseIdentity() });
});

// Deep health verifies dependencies that must be ready before a deployment is
// considered safe to receive traffic. Keep the shallow endpoint available for
// liveness while failing readiness closed when the mandatory scanner is unsafe.
router.get("/healthz/deep", async (_req, res) => {
  const startedAt = Date.now();
  try {
    const result = await db.execute(sql`SELECT 1 AS ok`);
    const dbMs = Date.now() - startedAt;
    const migrations = await getMigrationHealth();
    const [serviceAreaSummary] = await db
      .select({ active: sql<number>`count(*)::int` })
      .from(serviceAreasTable)
      .where(eq(serviceAreasTable.isActive, true));
    const activeServiceAreas = Number(serviceAreaSummary?.active || 0);
    const [runtimeMapOverrides, emailStatus, pushStatus, otpDeliveryStatus] = await Promise.all([
      getRuntimeMapOverrides(),
      getRuntimeEmailConfigurationStatus(),
      getRuntimePushConfigurationStatus(),
      getOtpDeliveryConfigurationStatus(),
    ]);
    const infrastructure = getInfrastructureProviderStatus();
    const uploadScanner = getUploadScannerStatus();
    const deployedEnvironment = ["production", "staging"].includes(
      String(process.env.NODE_ENV || "").trim().toLowerCase(),
    );
    const healthy = migrations.ok
      && (!deployedEnvironment || uploadScanner.productionSafe)
      && (!deployedEnvironment || activeServiceAreas > 0);

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      uptimeSeconds: Math.round(process.uptime()),
      release: getReleaseIdentity(),
      checks: {
        database: { ok: true, latencyMs: dbMs, rows: result.rows?.length ?? 0 },
        migrations,
        serviceAreas: { ok: activeServiceAreas > 0, active: activeServiceAreas },
        queue: queueStats(),
        cache: infrastructure.cache,
        bookingSweeper: bookingSweeperStats(),
        email: emailStatus,
        maps: getMapConfigurationStatus(runtimeMapOverrides),
        push: pushStatus,
        storage: getStorageConfigurationStatus(),
        uploadScanner,
        uploadSecurityMaintenance: uploadSecurityMaintenanceStats(),
        otpDelivery: otpDeliveryStatus,
        calls: infrastructure.calls,
      },
    });
  } catch {
    res.status(503).json({
      status: "degraded",
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database: { ok: false, error: "Database readiness check failed" } },
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

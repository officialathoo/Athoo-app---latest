import { and, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, uploadSecurityRecordsTable } from "@workspace/db";
import { logger } from "./logger";
import { getConfiguredStorageProvider } from "./storageProvider";

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastRunAt: string | null = null;
let lastExpiredCount = 0;
let lastCleanupCount = 0;
let lastError: string | null = null;

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function uploadLogReference(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export async function sweepExpiredUploadQuarantine(): Promise<number> {
  if (running) return 0;
  running = true;
  const now = new Date();
  const staleScanBefore = new Date(now.getTime() - 30 * 60_000);
  try {
    const batchSize = boundedInteger(process.env.UPLOAD_QUARANTINE_SWEEP_BATCH_SIZE, 100, 1, 500);
    const candidates = await db.select({ objectPath: uploadSecurityRecordsTable.objectPath })
      .from(uploadSecurityRecordsTable)
      .where(and(
        lt(uploadSecurityRecordsTable.expiresAt, now),
        or(
          inArray(uploadSecurityRecordsTable.scanStatus, ["pending", "error"]),
          and(
            inArray(uploadSecurityRecordsTable.scanStatus, ["scanning"]),
            lt(uploadSecurityRecordsTable.scanStartedAt, staleScanBefore),
          ),
        ),
      ))
      .limit(batchSize);

    const paths = candidates.map((candidate) => candidate.objectPath);
    if (paths.length) {
      const expired = await db.update(uploadSecurityRecordsTable).set({
        scanStatus: "expired",
        rejectionReason: "upload_expired",
        updatedAt: now,
      }).where(and(
        inArray(uploadSecurityRecordsTable.objectPath, paths),
        or(
          inArray(uploadSecurityRecordsTable.scanStatus, ["pending", "error"]),
          and(
            inArray(uploadSecurityRecordsTable.scanStatus, ["scanning"]),
            lt(uploadSecurityRecordsTable.scanStartedAt, staleScanBefore),
          ),
        ),
      )).returning({ objectPath: uploadSecurityRecordsTable.objectPath });
      lastExpiredCount = expired.length;
    } else {
      lastExpiredCount = 0;
    }

    // A signed incoming PUT can be reused until its TTL expires, including
    // after a successful scan. Therefore every terminal record gets one more
    // idempotent cleanup pass after expiry. The locked scan copy is removed in
    // the same pass and the record is marked only when both deletions succeed.
    const cleanupCandidates = await db.select({
      objectPath: uploadSecurityRecordsTable.objectPath,
      quarantinePath: uploadSecurityRecordsTable.quarantinePath,
      scanPath: uploadSecurityRecordsTable.scanPath,
    }).from(uploadSecurityRecordsTable).where(and(
      lt(uploadSecurityRecordsTable.expiresAt, now),
      isNull(uploadSecurityRecordsTable.quarantineDeletedAt),
      inArray(uploadSecurityRecordsTable.scanStatus, ["clean", "rejected", "expired"]),
    )).limit(batchSize);

    const provider = getConfiguredStorageProvider();
    const concurrency = boundedInteger(process.env.UPLOAD_QUARANTINE_DELETE_CONCURRENCY, 4, 1, 10);
    const cleanedPaths: string[] = [];
    for (let index = 0; index < cleanupCandidates.length; index += concurrency) {
      await Promise.all(cleanupCandidates.slice(index, index + concurrency).map(async (candidate) => {
        try {
          await Promise.all([
            provider.deleteObject(candidate.quarantinePath),
            provider.deleteObject(candidate.scanPath),
          ]);
          cleanedPaths.push(candidate.objectPath);
        } catch (error) {
          logger.warn({ err: error, uploadRef: uploadLogReference(candidate.objectPath) }, "Expired quarantine object deletion failed");
        }
      }));
    }
    if (cleanedPaths.length) {
      await db.update(uploadSecurityRecordsTable).set({
        quarantineDeletedAt: now,
        updatedAt: now,
      }).where(and(
        inArray(uploadSecurityRecordsTable.objectPath, cleanedPaths),
        isNull(uploadSecurityRecordsTable.quarantineDeletedAt),
      ));
    }
    lastCleanupCount = cleanedPaths.length;

    const retentionDays = boundedInteger(process.env.UPLOAD_SECURITY_RECORD_RETENTION_DAYS, 30, 7, 365);
    await db.delete(uploadSecurityRecordsTable).where(and(
      inArray(uploadSecurityRecordsTable.scanStatus, ["expired", "rejected"]),
      isNotNull(uploadSecurityRecordsTable.quarantineDeletedAt),
      lt(uploadSecurityRecordsTable.updatedAt, new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)),
    ));
    lastRunAt = now.toISOString();
    lastError = null;
    return lastExpiredCount;
  } catch (error) {
    lastError = "upload_quarantine_sweep_failed";
    logger.error({ err: error }, "Upload quarantine maintenance failed");
    return 0;
  } finally {
    running = false;
  }
}

export function uploadSecurityMaintenanceStats() {
  return { running, lastRunAt, lastExpiredCount, lastCleanupCount, lastError };
}

export function startUploadSecurityMaintenance(): void {
  if (timer) return;
  const intervalMs = boundedInteger(process.env.UPLOAD_QUARANTINE_SWEEP_INTERVAL_MS, 15 * 60_000, 60_000, 24 * 60 * 60_000);
  timer = setInterval(() => { void sweepExpiredUploadQuarantine(); }, intervalMs);
  timer.unref?.();
  setTimeout(() => { void sweepExpiredUploadQuarantine(); }, Math.min(30_000, intervalMs)).unref?.();
}

export function stopUploadSecurityMaintenance(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

import { Router, type IRouter, type Request, type Response } from "express";
import { getConfiguredStorageProvider, objectPathFromKey, StorageObjectNotFoundError, StorageNotConfiguredError, type StorageProvider } from "../lib/storageProvider";
import { verifyActiveAccessToken, verifyActivePurposeToken } from "../middlewares/auth";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, lt, or } from "drizzle-orm";
import { db, uploadSecurityRecordsTable } from "@workspace/db";
import { isPublicStorageKey, safeUploadName, uploadScopeForName, userQuarantineKey, userScanQuarantineKey, userUploadKey, validateUploadPolicy } from "../lib/storageSecurity";
import { scanStoredUpload, UploadScanUnavailableError } from "../lib/uploadScanner";
import { getUploadSecurityRecord, isUploadReadyForServing } from "../lib/verifiedUploads";
import { canReadStoredUploadObject } from "../lib/storageObjectAuthorization";

interface UploadUrlBody {
  name: string;
  size?: number;
  contentType?: string;
  scope?: "private" | "shared";
}

function parseUploadUrlBody(body: unknown): { success: true; data: UploadUrlBody } | { success: false } {
  if (!body || typeof body !== "object") return { success: false };
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) return { success: false };
  return {
    success: true,
    data: {
      name: b.name as string,
      size: typeof b.size === "number" ? b.size : undefined,
      contentType: typeof b.contentType === "string" ? b.contentType : undefined,
      scope: b.scope === "private" || b.scope === "shared" ? b.scope : undefined,
    },
  };
}

const router: IRouter = Router();

function storageProvider() {
  return getConfiguredStorageProvider();
}

function uploadLogReference(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

async function deleteTemporaryUploadObjects(
  provider: StorageProvider,
  paths: Array<string | null | undefined>,
  req: Request,
): Promise<void> {
  await Promise.all([...new Set(paths.filter((value): value is string => Boolean(value)))].map(async (temporaryPath) => {
    try {
      await provider.deleteObject(temporaryPath);
    } catch (error) {
      req.log.warn({ err: error, uploadRef: uploadLogReference(temporaryPath) }, "Temporary upload object deletion will be retried by maintenance");
    }
  }));
}


// Sanitized, non-leaking error response for storage failures. Configuration
// errors (missing provider environment variables) are surfaced as 503 with a diagnostic message
// naming which setting is absent -- never the secret values themselves -- so
// ops can fix the deployment without exposing anything to end users beyond
// "storage is unavailable". Any other failure (network or provider outage, etc.)
// stays a generic, already-sanitized 500 with details only in server logs.
function respondStorageError(req: Request, res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof StorageNotConfiguredError) {
    req.log.error({ err: error }, "Storage is not configured");
    res.status(503).json({ error: "Storage is not configured. Please contact support." });
    return;
  }
  req.log.error({ err: error }, fallbackMessage);
  res.status(500).json({ error: fallbackMessage });
}

/**
 * Extract JWT from the request — checks Authorization header first, then the
 * `?token=` query param so that browser <img src="…?token=…"> tags and the
 * mobile <Image> component (which can append query params) work.
 */
function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  if (typeof req.query.token === "string" && req.query.token) return req.query.token;
  return null;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request direct-upload instructions for the configured storage provider.
 * The client sends JSON metadata (name, size, contentType) — NOT the file —
 * then PUTs the file bytes directly to the returned presigned URL.
 * Returns a temporary quarantine objectPath. Completion returns the separate,
 * immutable clean objectPath that application routes are allowed to persist.
 * Requires a valid JWT.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const decoded = await verifyActiveAccessToken(token, req.headers["x-athoo-device-id"]);
  if (!decoded) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const parsed = parseUploadUrlBody(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const policyError = validateUploadPolicy(parsed.data);
    if (policyError) {
      res.status(400).json({ error: policyError });
      return;
    }

    const { name, size, contentType, scope } = parsed.data;
    const inferredScope = uploadScopeForName(name);
    const resolvedScope = inferredScope === "private" ? "private" : (scope || "shared");
    const ttlSeconds = Math.max(60, Math.min(3600, Number(process.env.SIGNED_UPLOAD_TTL_SECONDS || 900)));
    const uploadId = randomUUID();
    const requestedAt = new Date();
    const finalKey = userUploadKey(decoded.userId, name, uploadId, requestedAt, resolvedScope);
    const quarantineKey = userQuarantineKey(decoded.userId, name, uploadId, requestedAt);
    const scanKey = userScanQuarantineKey(decoded.userId, name, uploadId, requestedAt);

    const signed = await storageProvider().getSignedUploadUrl({
      key: quarantineKey,
      fileName: name,
      contentType,
      size,
      ttlSeconds,
    });

    await db.insert(uploadSecurityRecordsTable).values({
      objectPath: objectPathFromKey(finalKey),
      quarantinePath: signed.objectPath,
      scanPath: objectPathFromKey(scanKey),
      ownerId: decoded.userId,
      scope: resolvedScope,
      originalName: safeUploadName(name),
      declaredContentType: String(contentType || "").trim().toLowerCase(),
      declaredSize: Number(size),
      scanStatus: "pending",
      expiresAt: new Date(Date.now() + (ttlSeconds + 300) * 1000),
    });

    res.json({
      provider: signed.provider,
      method: signed.method,
      uploadURL: signed.uploadURL,
      objectPath: signed.objectPath,
      key: signed.key,
      headers: signed.headers,
      metadata: { name: safeUploadName(name), size, contentType, scope: resolvedScope, securityStatus: "pending" },
    });
  } catch (error) {
    respondStorageError(req, res, error, "Failed to generate upload URL");
  }
});

router.post("/storage/uploads/complete", async (req: Request, res: Response) => {
  const token = extractToken(req);
  const decoded = token ? await verifyActiveAccessToken(token, req.headers["x-athoo-device-id"]) : null;
  if (!decoded) { res.status(401).json({ error: "Unauthorized" }); return; }
  const objectPath = typeof req.body?.objectPath === "string" ? req.body.objectPath.trim() : "";
  const expectedSize = Number(req.body?.size);
  const expectedContentType = typeof req.body?.contentType === "string" ? req.body.contentType.trim().toLowerCase() : "";
  const expectedPrefix = `/objects/uploads/quarantine/incoming/${decoded.userId}/`;
  if (!objectPath.startsWith(expectedPrefix)) {
    res.status(400).json({ error: "Invalid upload reference" }); return;
  }
  let securityRecordPath: string | null = null;
  try {
    const provider = storageProvider();
    const record = await db.query.uploadSecurityRecordsTable.findFirst({
      where: and(
        eq(uploadSecurityRecordsTable.quarantinePath, objectPath),
        eq(uploadSecurityRecordsTable.ownerId, decoded.userId),
      ),
    });
    if (!record) {
      await provider.deleteObject(objectPath).catch(() => undefined);
      res.status(409).json({ error: "Upload security record was not found. Please upload the file again.", code: "UPLOAD_NOT_REGISTERED" });
      return;
    }
    securityRecordPath = record.objectPath;
    if (record.scanStatus === "clean") {
      res.json({
        success: true,
        objectPath: record.objectPath,
        size: record.actualSize,
        contentType: record.detectedContentType,
        sha256: record.sha256,
        securityStatus: "clean",
        duplicate: true,
      });
      return;
    }
    if (record.scanStatus === "rejected" || record.scanStatus === "expired") {
      res.status(422).json({ error: "This file did not pass Athoo security checks. Choose a different file.", code: "UPLOAD_REJECTED" });
      return;
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      await db.update(uploadSecurityRecordsTable).set({ scanStatus: "expired", rejectionReason: "upload_expired", updatedAt: new Date() })
        .where(eq(uploadSecurityRecordsTable.objectPath, record.objectPath));
      await deleteTemporaryUploadObjects(provider, [record.quarantinePath, record.scanPath], req);
      res.status(410).json({ error: "This upload expired. Please upload the file again.", code: "UPLOAD_EXPIRED" });
      return;
    }
    if (expectedSize !== record.declaredSize || expectedContentType !== record.declaredContentType) {
      await db.update(uploadSecurityRecordsTable).set({ scanStatus: "rejected", rejectionReason: "metadata_mismatch", scannedAt: new Date(), updatedAt: new Date() })
        .where(eq(uploadSecurityRecordsTable.objectPath, record.objectPath));
      await deleteTemporaryUploadObjects(provider, [record.quarantinePath, record.scanPath], req);
      res.status(409).json({ error: "Uploaded file metadata could not be verified", code: "UPLOAD_METADATA_MISMATCH" });
      return;
    }

    const reclaimBefore = new Date(Date.now() - Math.max(60_000, Math.min(30 * 60_000, Number(process.env.UPLOAD_SCAN_RECLAIM_MS || 10 * 60_000))));
    const claimed = await db.update(uploadSecurityRecordsTable).set({
      scanStatus: "scanning",
      scanStartedAt: new Date(),
      rejectionReason: null,
      updatedAt: new Date(),
    }).where(and(
      eq(uploadSecurityRecordsTable.objectPath, record.objectPath),
      eq(uploadSecurityRecordsTable.ownerId, decoded.userId),
      or(
        inArray(uploadSecurityRecordsTable.scanStatus, ["pending", "error"]),
        and(eq(uploadSecurityRecordsTable.scanStatus, "scanning"), lt(uploadSecurityRecordsTable.scanStartedAt, reclaimBefore)),
      ),
    )).returning({ objectPath: uploadSecurityRecordsTable.objectPath });
    if (!claimed.length) {
      res.status(409).json({ error: "This file is already being checked. Please wait and try again.", code: "UPLOAD_SCAN_IN_PROGRESS" });
      return;
    }

    // Snapshot the client-writable object into a server-only path first. The
    // signed incoming PUT can be reused until it expires, so scanning it in
    // place would allow a post-scan overwrite (TOCTOU). Only this locked copy
    // is scanned and promoted.
    const incomingMetadata = await provider.statObject(record.quarantinePath);
    const incomingType = String(incomingMetadata.contentType || "").trim().toLowerCase();
    if (incomingMetadata.contentLength !== record.declaredSize || incomingType !== record.declaredContentType) {
      await db.update(uploadSecurityRecordsTable).set({
        scanStatus: "rejected",
        rejectionReason: "stored_metadata_mismatch",
        scannedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(uploadSecurityRecordsTable.objectPath, record.objectPath));
      await deleteTemporaryUploadObjects(provider, [record.quarantinePath, record.scanPath], req);
      res.status(409).json({ error: "Uploaded file metadata could not be verified", code: "UPLOAD_METADATA_MISMATCH" });
      return;
    }
    await provider.copyObject(record.quarantinePath, {
      key: record.scanPath,
      contentType: record.declaredContentType,
      metadata: { "athoo-security-state": "locked-quarantine" },
    });
    const metadata = await provider.statObject(record.scanPath);
    if (!metadata.contentLength || metadata.contentLength !== record.declaredSize) {
      await db.update(uploadSecurityRecordsTable).set({
        scanStatus: "rejected",
        rejectionReason: "snapshot_size_mismatch",
        scannedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(uploadSecurityRecordsTable.objectPath, record.objectPath));
      await deleteTemporaryUploadObjects(provider, [record.quarantinePath, record.scanPath], req);
      res.status(409).json({ error: "Uploaded file size could not be verified", code: "UPLOAD_SIZE_MISMATCH" });
      return;
    }
    const actualPolicyError = validateUploadPolicy({
      name: record.originalName,
      size: metadata.contentLength,
      contentType: record.declaredContentType,
    });
    if (actualPolicyError) {
      await db.update(uploadSecurityRecordsTable).set({
        scanStatus: "rejected",
        rejectionReason: "current_policy_rejected",
        scannedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(uploadSecurityRecordsTable.objectPath, record.objectPath));
      await deleteTemporaryUploadObjects(provider, [record.quarantinePath, record.scanPath], req);
      res.status(409).json({ error: actualPolicyError, code: "UPLOAD_POLICY_REJECTED" });
      return;
    }

    const object = await provider.getObject(record.scanPath);
    const scan = await scanStoredUpload({
      object,
      declaredContentType: record.declaredContentType,
      expectedSize: metadata.contentLength,
      maxBytes: record.declaredSize,
    });
    if (!scan.clean) {
      await db.update(uploadSecurityRecordsTable).set({
        scanStatus: "rejected",
        detectedContentType: scan.detectedContentType,
        actualSize: scan.size || metadata.contentLength,
        sha256: scan.sha256,
        scanner: scan.scanner,
        rejectionReason: scan.reason || "security_rejected",
        scannedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(uploadSecurityRecordsTable.objectPath, record.objectPath));
      await deleteTemporaryUploadObjects(provider, [record.quarantinePath, record.scanPath], req);
      req.log.warn({ uploadRef: uploadLogReference(record.objectPath), reasonCode: scan.reason }, "Upload rejected by security policy");
      res.status(422).json({ error: "This file did not pass Athoo security checks. Choose a different file.", code: "UPLOAD_REJECTED" });
      return;
    }

    const promoted = await provider.copyObject(record.scanPath, {
      key: record.objectPath,
      contentType: scan.detectedContentType || record.declaredContentType,
      metadata: {
        "athoo-security-state": "clean",
        "athoo-scan-sha256": scan.sha256,
      },
    });
    if (promoted.objectPath !== record.objectPath) throw new Error("UPLOAD_PROMOTION_PATH_MISMATCH");
    const promotedMetadata = await provider.statObject(record.objectPath);
    if (promotedMetadata.contentLength !== scan.size) {
      await provider.deleteObject(record.objectPath).catch(() => undefined);
      throw new Error("UPLOAD_PROMOTION_SIZE_MISMATCH");
    }

    const finalized = await db.update(uploadSecurityRecordsTable).set({
      scanStatus: "clean",
      detectedContentType: scan.detectedContentType,
      actualSize: scan.size,
      sha256: scan.sha256,
      scanner: scan.scanner,
      rejectionReason: null,
      scannedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(uploadSecurityRecordsTable.objectPath, record.objectPath),
      eq(uploadSecurityRecordsTable.scanStatus, "scanning"),
    )).returning({ objectPath: uploadSecurityRecordsTable.objectPath });
    if (!finalized.length) throw new Error("UPLOAD_FINALIZATION_RACE");
    await deleteTemporaryUploadObjects(provider, [record.quarantinePath, record.scanPath], req);
    res.json({
      success: true,
      objectPath: record.objectPath,
      size: scan.size,
      contentType: scan.detectedContentType,
      sha256: scan.sha256,
      securityStatus: "clean",
    });
  } catch (error) {
    if (error instanceof UploadScanUnavailableError) {
      if (securityRecordPath) {
        await db.update(uploadSecurityRecordsTable).set({ scanStatus: "error", rejectionReason: error.reasonCode, updatedAt: new Date() })
          .where(and(
            eq(uploadSecurityRecordsTable.objectPath, securityRecordPath),
            eq(uploadSecurityRecordsTable.scanStatus, "scanning"),
          )).catch(() => undefined);
      }
      req.log.error({ reasonCode: error.reasonCode, ownerId: decoded.userId }, "Upload malware scanner unavailable");
      res.status(503).json({ error: "File security checking is temporarily unavailable. Your file was not accepted; please retry shortly.", code: "UPLOAD_SCAN_UNAVAILABLE" });
      return;
    }
    if (securityRecordPath) {
      await db.update(uploadSecurityRecordsTable).set({ scanStatus: "error", rejectionReason: "scan_failed", updatedAt: new Date() })
        .where(and(
          eq(uploadSecurityRecordsTable.objectPath, securityRecordPath),
          eq(uploadSecurityRecordsTable.scanStatus, "scanning"),
        )).catch(() => undefined);
    }
    if (error instanceof StorageObjectNotFoundError) { res.status(409).json({ error: "Uploaded file was not found in storage" }); return; }
    respondStorageError(req, res, error, "Failed to verify uploaded file");
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS — no auth.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = (req.params as Record<string, unknown>).filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : String(raw ?? "");
    if (!isPublicStorageKey(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    const object = await storageProvider().getObject(filePath);
    res.setHeader("Cache-Control", object.cacheControl || "public, max-age=86400, stale-while-revalidate=604800");
    res.setHeader("Content-Type", object.contentType || "application/octet-stream");
    if (object.contentLength) res.setHeader("Content-Length", String(object.contentLength));
    object.body.pipe(res);
  } catch (error) {
    if (error instanceof StorageObjectNotFoundError) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    respondStorageError(req, res, error, "Failed to serve public object");
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve uploaded object entities. Requires a valid access/purpose token and
 * entity-level authorization. Possessing an opaque object URL is not permission:
 * shared media is only readable by its owner, an authorized entity participant,
 * an administrator, or as an authenticated public profile image.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  const token = extractToken(req);
  const decoded = token ? (await verifyActiveAccessToken(token, req.headers["x-athoo-device-id"]) || await verifyActivePurposeToken(token, "object-read")) : null;
  if (!decoded) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const raw = (req.params as Record<string, unknown>).path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : String(raw ?? "");
    const objectPath = `/objects/${wildcardPath}`;
    if (!(await isUploadReadyForServing(wildcardPath))) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const securityRecord = await getUploadSecurityRecord(objectPath);
    if (wildcardPath.startsWith("uploads/") && !(await canReadStoredUploadObject(objectPath, decoded, securityRecord))) {
      res.status(403).json({ error: "You do not have access to this file" });
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("X-Download-Options", "noopen");
    if (req.query.redirect === "1" && wildcardPath.startsWith("uploads/")) {
      res.status(400).json({ error: "Direct redirects are disabled for uploaded files" });
      return;
    }
    if (req.query.redirect === "1") {
      const signedUrl = await storageProvider().getSignedReadUrl(objectPath, Number(process.env.SIGNED_READ_TTL_SECONDS || 900));
      res.redirect(302, signedUrl);
      return;
    }

    const object = await storageProvider().getObject(objectPath);
    const verifiedType = securityRecord?.detectedContentType || object.contentType || "application/octet-stream";
    const fileName = safeUploadName(wildcardPath.split("/").pop() || "athoo-file");
    res.setHeader("Cache-Control", req.query.token ? "private, no-store" : (object.cacheControl || "private, max-age=86400, stale-while-revalidate=604800"));
    res.setHeader("Content-Type", verifiedType);
    res.setHeader("Content-Disposition", `${verifiedType === "application/pdf" ? "attachment" : "inline"}; filename="${fileName}"`);
    if (object.contentLength) res.setHeader("Content-Length", String(object.contentLength));
    object.body.pipe(res);
  } catch (error) {
    if (error instanceof StorageObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    respondStorageError(req, res, error, "Failed to serve object");
  }
});

/**
 * PUT /storage/local-upload/*
 * Development-only direct upload target for LocalStorageProvider. Production must use a configured remote provider with signed URLs.
 */
router.put("/storage/local-upload/*path", async (req: Request, res: Response) => {
  if (["production", "staging"].includes(String(process.env.NODE_ENV || "").trim().toLowerCase())) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const token = extractToken(req);
  const decoded = token ? await verifyActiveAccessToken(token, req.headers["x-athoo-device-id"]) : null;
  if (!decoded) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const raw = (req.params as Record<string, unknown>).path;
    const key = Array.isArray(raw) ? raw.join("/") : String(raw ?? "");
    if (!key.startsWith(`uploads/quarantine/incoming/${decoded.userId}/`) || key.includes("..")) {
      res.status(403).json({ error: "Invalid upload destination" });
      return;
    }
    const quarantinePath = objectPathFromKey(key);
    const record = await db.query.uploadSecurityRecordsTable.findFirst({
      where: and(
        eq(uploadSecurityRecordsTable.quarantinePath, quarantinePath),
        eq(uploadSecurityRecordsTable.ownerId, decoded.userId),
      ),
    });
    const suppliedType = typeof req.headers["content-type"] === "string" ? req.headers["content-type"].trim().toLowerCase() : "";
    const suppliedSize = Number(req.headers["content-length"]);
    if (!record || !["pending", "error"].includes(record.scanStatus)
      || suppliedType !== record.declaredContentType
      || (Number.isFinite(suppliedSize) && suppliedSize !== record.declaredSize)) {
      res.status(409).json({ error: "Upload authorization does not match this file" });
      return;
    }
    const saved = await storageProvider().uploadFile({
      key,
      body: req,
      contentType: suppliedType,
      size: Number.isFinite(suppliedSize) ? suppliedSize : undefined,
    });
    res.json(saved);
  } catch (error) {
    respondStorageError(req, res, error, "Local upload failed");
  }
});

export default router;

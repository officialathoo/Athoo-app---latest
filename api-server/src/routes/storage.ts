import { Router, type IRouter, type Request, type Response } from "express";
import { getConfiguredStorageProvider, StorageObjectNotFoundError } from "../lib/storageProvider";
import { verifyActiveAccessToken, verifyActivePurposeToken } from "../middlewares/auth";
import { randomUUID } from "node:crypto";
import { canReadStorageKey, isPublicStorageKey, userUploadKey, validateUploadPolicy } from "../lib/storageSecurity";

interface UploadUrlBody {
  name: string;
  size?: number;
  contentType?: string;
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
    },
  };
}

const router: IRouter = Router();

function storageProvider() {
  return getConfiguredStorageProvider();
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
 * Returns the stable objectPath (/objects/<id>) to persist in the database.
 * Requires a valid JWT.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const decoded = await verifyActiveAccessToken(token);
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

    const { name, size, contentType } = parsed.data;

    const signed = await storageProvider().getSignedUploadUrl({
      key: userUploadKey(decoded.userId, name, randomUUID()),
      fileName: name,
      contentType,
      ttlSeconds: Number(process.env.SIGNED_UPLOAD_TTL_SECONDS || 900),
    });

    res.json({
      provider: signed.provider,
      method: signed.method,
      uploadURL: signed.uploadURL,
      objectPath: signed.objectPath,
      key: signed.key,
      headers: signed.headers,
      metadata: { name, size, contentType },
    });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
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
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve uploaded object entities. Requires a valid JWT (any authenticated
 * user) so customer/provider/admin can all view shared media (chat images,
 * KYC documents, payment screenshots, profile photos) while sensitive PII is
 * not exposed by unguessable-but-public URL.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  const token = extractToken(req);
  const decoded = token ? (await verifyActiveAccessToken(token) || await verifyActivePurposeToken(token, "object-read")) : null;
  if (!decoded) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const raw = (req.params as Record<string, unknown>).path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : String(raw ?? "");
    const objectPath = `/objects/${wildcardPath}`;
    if (!canReadStorageKey(wildcardPath, decoded)) {
      res.status(403).json({ error: "You do not have access to this file" });
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    if (req.query.redirect === "1") {
      const signedUrl = await storageProvider().getSignedReadUrl(objectPath, Number(process.env.SIGNED_READ_TTL_SECONDS || 900));
      res.redirect(302, signedUrl);
      return;
    }

    const object = await storageProvider().getObject(objectPath);
    res.setHeader("Cache-Control", req.query.token ? "private, no-store" : (object.cacheControl || "private, max-age=86400, stale-while-revalidate=604800"));
    res.setHeader("Content-Type", object.contentType || "application/octet-stream");
    if (object.contentLength) res.setHeader("Content-Length", String(object.contentLength));
    object.body.pipe(res);
  } catch (error) {
    if (error instanceof StorageObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

/**
 * PUT /storage/local-upload/*
 * Development-only direct upload target for LocalStorageProvider. Production must use R2 signed URLs.
 */
router.put("/storage/local-upload/*path", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const token = extractToken(req);
  const decoded = token ? await verifyActiveAccessToken(token) : null;
  if (!decoded) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const raw = (req.params as Record<string, unknown>).path;
    const key = Array.isArray(raw) ? raw.join("/") : String(raw ?? "");
    if (!key.startsWith(`uploads/shared/${decoded.userId}/`) && !key.startsWith(`uploads/private/${decoded.userId}/`)) {
      res.status(403).json({ error: "Invalid upload destination" });
      return;
    }
    const saved = await storageProvider().uploadFile({
      key,
      body: req,
      contentType: typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : undefined,
    });
    res.json(saved);
  } catch (error) {
    req.log.error({ err: error }, "Local upload failed");
    res.status(500).json({ error: "Local upload failed" });
  }
});

export default router;

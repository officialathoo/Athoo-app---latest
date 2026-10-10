import { and, eq } from "drizzle-orm";
import { db, uploadSecurityRecordsTable } from "@workspace/db";
import {
  isOwnedUploadObjectPath,
  normalizeStoredObjectPath,
  type UploadScope,
} from "./storageSecurity";

export async function getUploadSecurityRecord(objectPath: unknown) {
  const normalized = normalizeStoredObjectPath(objectPath);
  if (!normalized.startsWith("/objects/uploads/")) return null;
  return db.query.uploadSecurityRecordsTable.findFirst({
    where: eq(uploadSecurityRecordsTable.objectPath, normalized),
  });
}

export async function isCleanOwnedUploadObjectPath(
  value: unknown,
  userId: string,
  allowedScopes: UploadScope[] = ["private", "shared"],
): Promise<boolean> {
  const normalized = normalizeStoredObjectPath(value);
  if (!isOwnedUploadObjectPath(normalized, userId, allowedScopes)) return false;
  const record = await db.query.uploadSecurityRecordsTable.findFirst({
    where: and(
      eq(uploadSecurityRecordsTable.objectPath, normalized),
      eq(uploadSecurityRecordsTable.ownerId, userId),
      eq(uploadSecurityRecordsTable.scanStatus, "clean"),
    ),
  });
  return Boolean(record && allowedScopes.includes(record.scope as UploadScope) && record.sha256 && record.detectedContentType);
}

export async function validateCleanOwnedUploadObjectPaths(
  values: unknown,
  userId: string,
  options: { maxItems?: number; scopes?: UploadScope[] } = {},
): Promise<{ ok: true; paths: string[] } | { ok: false; error: string }> {
  if (!Array.isArray(values)) return { ok: true, paths: [] };
  const maxItems = Math.max(0, Math.min(20, options.maxItems ?? 5));
  if (values.length > maxItems) return { ok: false, error: `A maximum of ${maxItems} media files is allowed` };
  const paths = values.map(normalizeStoredObjectPath).filter(Boolean);
  if (paths.length !== values.filter(Boolean).length) return { ok: false, error: "Invalid media path" };
  const scopes = options.scopes ?? ["private", "shared"];
  const results = await Promise.all(paths.map((path) => isCleanOwnedUploadObjectPath(path, userId, scopes)));
  if (results.some((clean) => !clean)) return { ok: false, error: "Media must pass Athoo security scanning before use" };
  return { ok: true, paths };
}

export async function isUploadReadyForServing(key: string): Promise<boolean> {
  const normalizedKey = String(key || "").replace(/^\/+/, "");
  if (!normalizedKey.startsWith("uploads/")) return true;
  const record = await getUploadSecurityRecord(`/objects/${normalizedKey}`);
  if (record?.scanStatus === "clean" && record.sha256 && record.detectedContentType) return true;
  // Legacy bypass is deliberately restricted to local/test development.
  const runtime = String(process.env.NODE_ENV || "development").trim().toLowerCase();
  return !["production", "staging"].includes(runtime) && process.env.UPLOAD_LEGACY_READ_POLICY === "allow";
}

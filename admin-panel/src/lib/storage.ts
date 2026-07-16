/**
 * Replit Object Storage helpers for the ATHOO admin panel.
 *
 * Upload flow:
 *   1. Call uploadFile(file) → objectPath (/objects/<id>)
 *   2. Save objectPath to the API
 *
 * Display:
 *   - objectPath (/objects/<id>) is served through the API with ?token=
 *   - Legacy Cloudinary https URLs (pre-migration) are still rendered directly
 */
import { createPurposeToken, getAdminDeviceId, getApiBase, getToken } from "@/lib/api";

export type UploadUrlResult = {
  uploadURL: string;
  objectPath: string;
};

/**
 * Returns true when value is a stored objectPath.
 */
export function isStoragePath(value: string | null | undefined): boolean {
  if (!value) return false;
  return (
    value.startsWith("/objects/") ||
    value.startsWith("https://res.cloudinary.com/")
  );
}

/**
 * Build the display URL for an objectPath.
 * - /objects/ paths: proxied through the API with ?token=
 * - data: URIs / https URLs (legacy Cloudinary): returned as-is
 */
export function getPrivateFileUrl(objectPath: string | null | undefined): string { if (!objectPath) return ""; if (objectPath.startsWith("data:") || objectPath.startsWith("http")) return objectPath; return `${getApiBase()}/api/storage${objectPath}`; }

export async function getPrivateFileAccessUrl(objectPath: string): Promise<string> {
  const base = getPrivateFileUrl(objectPath);
  if (!objectPath.startsWith("/objects/")) return base;
  const token = await createPurposeToken("object-read");
  return `${base}?token=${encodeURIComponent(token)}`;
}

/**
 * Build the URL for a public storage object.
 */
export function getPublicFileUrl(filePath: string | null | undefined): string {
  if (!filePath) return "";
  if (filePath.startsWith("http")) return filePath;
  const base = getApiBase();
  return `${base}/api/storage/public-objects/${filePath.replace(/^\//, "")}`;
}

/**
 * Request a presigned upload URL from the API server.
 */
export async function getUploadUrl(
  name: string,
  size: number,
  contentType: string,
  scope: "private" | "shared" = "shared",
): Promise<UploadUrlResult> {
  const token = getToken();
  const base = getApiBase();
  const res = await fetch(`${base}/api/storage/uploads/request-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-Athoo-Device-Id": getAdminDeviceId(),
    },
    body: JSON.stringify({ name, size, contentType, scope }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `Failed to get upload URL (${res.status})`);
  }
  return res.json() as Promise<UploadUrlResult>;
}

/**
 * Upload a browser File directly to the presigned URL (GCS).
 * Returns the stable objectPath to persist.
 */
export async function uploadFile(file: File, scope: "private" | "shared" = "shared"): Promise<string> {
  const mime = file.type || "application/octet-stream";
  const { uploadURL, objectPath } = await getUploadUrl(file.name, file.size, mime, scope);

  const res = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }
  const completed = await fetch(`${getApiBase()}/api/storage/uploads/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      "X-Athoo-Device-Id": getAdminDeviceId(),
    },
    body: JSON.stringify({ objectPath, size: file.size, contentType: mime }),
  });
  if (!completed.ok) throw new Error("Uploaded file could not be verified");
  return objectPath;
}

/**
 * Portable storage helpers for the ATHOO mobile app.
 *
 * Upload flow:
 *   1. getUploadUrl() → provider-specific direct-upload instructions
 *   2. PUT into Athoo's non-readable quarantine object
 *   3. Complete server-side scan and persist only the returned clean objectPath
 *
 * Display flow:
 *   - objectPath (/objects/<id>) is served through authenticated API access
 *   - Native clients send short-lived purpose tokens in Authorization headers
 *   - Web falls back to a short-lived query token because browser image tags cannot attach headers
 *   - Legacy Cloudinary https URLs (pre-migration) still render directly
 *   - <PrivateImage objectPath={...} /> handles both transparently
 */
import React, { useEffect, useState } from "react";
import { Image, Platform, type ImageStyle, type StyleProp } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { api, getToken } from "@/services/api";
import { getDeviceId } from "@/services/deviceIdentity";

// ─── Resolve API base ─────────────────────────────────────────────────────────

export const STORAGE_API_BASE: string = api.baseUrl;

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true when the value is a stored objectPath.
 */
export function isStoragePath(value: string | null | undefined): boolean {
  if (!value) return false;
  return (
    value.startsWith("/objects/") ||
    value.startsWith("https://res.cloudinary.com/")
  );
}

/**
 * Returns the display URL for an objectPath.
 * - /objects/ paths: proxied through the authenticated API
 * - data: URIs and https URLs (legacy Cloudinary): returned as-is
 */
export function getPrivateFileUrl(objectPath: string | null | undefined): string {
  if (!objectPath) return "";
  if (objectPath.startsWith("data:")) return objectPath;
  if (objectPath.startsWith("http")) return objectPath;
  return `${STORAGE_API_BASE}/api/storage${objectPath}`;
}

/**
 * Returns the full URL for a public storage object.
 */
export function getPublicFileUrl(filePath: string | null | undefined): string {
  if (!filePath) return "";
  if (filePath.startsWith("http")) return filePath;
  return `${STORAGE_API_BASE}/api/storage/public-objects/${filePath.replace(/^\//, "")}`;
}

function optimizeCloudinaryImageUrl(url: string): string {
  if (!url.includes("res.cloudinary.com") || url.includes("/video/upload/")) return url;
  if (url.includes("/image/upload/") && !url.includes("/image/upload/f_auto")) {
    return url.replace("/image/upload/", "/image/upload/f_auto,q_auto,w_600,c_limit/");
  }
  return url;
}

export function optimizeCloudinaryVideoUrl(url: string): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) return url;
  if (url.includes("/video/upload/q_auto")) return url;
  return url.replace("/video/upload/", "/video/upload/f_auto,q_auto:eco,w_640,c_limit/");
}

// ─── Upload helpers ───────────────────────────────────────────────────────────

export type UploadProgress = { loaded: number; total?: number; percent?: number; stage: "preparing" | "uploading" | "processing" | "done" };
export type UploadProgressCallback = (progress: UploadProgress) => void;

function emitProgress(onProgress: UploadProgressCallback | undefined, progress: UploadProgress) {
  if (onProgress) onProgress(progress);
}


const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/x-m4v": ".m4v",
};

function inferContentType(filename: string, contentType: string): string {
  const normalized = String(contentType || "").toLowerCase().trim();
  if (normalized && normalized !== "application/octet-stream") return normalized;
  const extension = String(filename || "").toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1];
  const inferred: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    pdf: "application/pdf", mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v",
  };
  return (extension && inferred[extension]) || "application/octet-stream";
}

function normalizeUploadMetadata(filename: string, contentType: string): { filename: string; contentType: string } {
  const safeBase = String(filename || "upload").replace(/[\\/]/g, "-").trim() || "upload";
  const normalizedType = inferContentType(safeBase, contentType);
  if (["image/heic", "image/heif"].includes(normalizedType) || /\.hei[cf]$/i.test(safeBase)) {
    throw new Error("This HEIC/HEIF photo cannot be uploaded directly. Choose a compatible JPG, PNG, or WebP image.");
  }
  const expectedExtension = MIME_EXTENSION[normalizedType];
  if (!expectedExtension) return { filename: safeBase, contentType: normalizedType };
  const withoutExtension = safeBase.replace(/\.[a-z0-9]{1,8}$/i, "");
  return { filename: `${withoutExtension}${expectedExtension}`, contentType: normalizedType };
}

async function prepareLocalUploadUri(uri: string, filename: string): Promise<{ uri: string; temporary: boolean }> {
  const raw = String(uri || "").trim();
  if (!raw) throw new Error("The selected file has no readable location. Please select it again.");
  if (raw.startsWith("file://") || Platform.OS === "web") return { uri: raw, temporary: false };

  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) return { uri: raw, temporary: false };
  const safeName = String(filename || "upload").replace(/[^a-zA-Z0-9._-]/g, "-");
  const target = `${cacheRoot}athoo-upload-${Date.now()}-${safeName}`;
  try {
    await FileSystem.copyAsync({ from: raw, to: target });
    return { uri: target, temporary: true };
  } catch {
    // Some Android providers expose content:// URIs that fetch() can read even
    // when FileSystem.copyAsync cannot. Keep the original URI for the fallback.
    return { uri: raw, temporary: false };
  }
}

async function resolveFileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof (info as any).size === "number" && (info as any).size > 0) return (info as any).size;
  } catch {}
  try {
    const blob = await (await fetch(uri)).blob();
    if (blob.size > 0) return blob.size;
  } catch {}
  throw new Error("The selected file could not be read. Please select it again.");
}


function professionalUploadError(error: unknown): Error {
  const raw = String((error as any)?.message || error || "").trim();
  const lower = raw.toLowerCase();
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return new Error("Upload timed out. Please try again on a stronger connection.");
  }
  if (lower.includes("network") || lower.includes("failed to fetch") || lower.includes("request failed")) {
    return new Error("The upload could not reach Athoo. Check your internet connection and try again.");
  }
  if (lower.includes("too large") || lower.includes("maximum") || lower.includes("413")) {
    return new Error("This file is too large. Choose a smaller file and try again.");
  }
  if (lower.includes("unauthorized") || lower.includes("forbidden") || lower.includes("401") || lower.includes("403")) {
    return new Error("Your session cannot upload this file. Sign in again and retry.");
  }
  if (lower.includes("storage is not configured") || lower.includes("credential") || lower.includes("access key") || lower.includes("signature") || lower.includes("invalidaccesskeyid") || lower.includes("authorizationheadermalformed")) {
    return new Error("Media upload is temporarily unavailable. Please try again shortly or contact Athoo support.");
  }
  if (/<\?xml|<error>|amazon|cloudflare|x-amz-|requestid|hostid/i.test(raw)) {
    return new Error("Media upload could not be completed. Please try again shortly.");
  }
  if (raw && raw.length <= 180 && !/[<>]/.test(raw)) return new Error(raw);
  return new Error("Media upload could not be completed. Please try again.");
}

export type UploadUrlResult = {
  provider?: "cloudinary" | "gcs" | "replit-object-storage" | string;
  method?: "POST" | "PUT" | string;
  uploadURL: string;
  objectPath: string;
  fields?: Record<string, string | number | boolean>;
  metadata?: Record<string, unknown>;
  headers?: Record<string, string>;
};

/**
 * Request a presigned PUT URL + objectPath from the API server.
 */
type ConfirmedUpload = {
  objectPath: string;
  size: number;
  contentType: string;
  sha256: string;
  securityStatus: "clean";
};

async function confirmUploadedObject(objectPath: string, size: number, contentType: string): Promise<ConfirmedUpload> {
  const [token, deviceId] = await Promise.all([getToken(), getDeviceId()]);
  const res = await fetch(`${STORAGE_API_BASE}/api/storage/uploads/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Athoo-Device-Id": deviceId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ objectPath, size, contentType }),
  });
  const raw = await res.text();
  let parsed: any = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
  if (!res.ok) {
    throw professionalUploadError(parsed?.error || parsed?.message || `Upload verification failed (${res.status})`);
  }
  const finalPath = typeof parsed?.objectPath === "string" ? parsed.objectPath.trim() : "";
  if (parsed?.securityStatus !== "clean"
    || !/^\/objects\/uploads\/(?:private|shared)\/[^/]+\//.test(finalPath)
    || !Number.isFinite(Number(parsed?.size))
    || typeof parsed?.contentType !== "string"
    || !/^[a-f0-9]{64}$/.test(String(parsed?.sha256 || ""))) {
    throw new Error("Athoo could not verify the final secure file reference. Please upload the file again.");
  }
  return {
    objectPath: finalPath,
    size: Number(parsed.size),
    contentType: parsed.contentType,
    sha256: parsed.sha256,
    securityStatus: "clean",
  };
}

export type UploadScope = "private" | "shared";

export async function getUploadUrl(
  name: string,
  size: number,
  contentType: string,
  scope?: UploadScope,
): Promise<UploadUrlResult> {
  const [token, deviceId] = await Promise.all([getToken(), getDeviceId()]);
  const res = await fetch(`${STORAGE_API_BASE}/api/storage/uploads/request-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Athoo-Device-Id": deviceId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ name, size, contentType, scope }),
  });
  if (!res.ok) {
    const raw = await res.text();
    let parsed: any = {};
    try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
    throw professionalUploadError(parsed?.error || parsed?.message || `Upload service unavailable (${res.status})`);
  }
  return res.json() as Promise<UploadUrlResult>;
}

/**
 * Upload a local file to a presigned PUT URL.
 * On native, uses expo-file-system binary upload (reliable for file:// URIs).
 * On web, fetches the local blob and PUTs it.
 */
async function putFileToPresignedUrl(
  localUri: string,
  uploadURL: string,
  contentType: string,
  onProgress?: UploadProgressCallback,
  requiredHeaders: Record<string, string> = {},
): Promise<void> {
  emitProgress(onProgress, { loaded: 0, percent: 0, stage: "uploading" });
  if (Platform.OS === "web") {
    const blob = await (await fetch(localUri)).blob();
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.timeout = 300000;
      xhr.open("PUT", uploadURL);
      Object.entries({ "Content-Type": contentType, ...requiredHeaders }).forEach(([key, value]) => xhr.setRequestHeader(key, value));
      xhr.upload.onprogress = (event) => {
        const total = event.lengthComputable ? event.total : blob.size;
        const percent = total ? Math.min(99, Math.round((event.loaded / total) * 100)) : undefined;
        emitProgress(onProgress, { loaded: event.loaded, total, percent, stage: "uploading" });
      };
      xhr.onerror = () => reject(new Error("Upload failed due to a network error. Check internet and try again."));
      xhr.ontimeout = () => reject(new Error("Upload timed out. Please try again on a stronger connection or use a shorter video."));
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(professionalUploadError(xhr.responseText || `Upload failed (${xhr.status})`));
      xhr.send(blob);
    });
    emitProgress(onProgress, { loaded: 1, total: 1, percent: 100, stage: "done" });
    return;
  }

  const task = FileSystem.createUploadTask(uploadURL, localUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType, ...requiredHeaders },
  }, (event) => {
    const total = event.totalBytesExpectedToSend || undefined;
    const loaded = event.totalBytesSent || 0;
    const percent = total ? Math.min(99, Math.round((loaded / total) * 100)) : undefined;
    emitProgress(onProgress, { loaded, total, percent, stage: "uploading" });
  });
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw professionalUploadError(result?.body || `Upload failed (${result?.status || "unknown"})`);
  }
  emitProgress(onProgress, { loaded: 1, total: 1, percent: 100, stage: "done" });
}

/**
 * Convenience: get presigned URL → upload bytes → return the stable objectPath.
 */
export async function uploadPickedImage(
  uri: string,
  filename = "image.jpg",
  contentType = "image/jpeg",
  onProgress?: UploadProgressCallback,
  scope: UploadScope = "shared",
): Promise<string> {
  const metadata = normalizeUploadMetadata(filename, contentType);
  const prepared = await prepareLocalUploadUri(uri, metadata.filename);
  try {
    const size = await resolveFileSize(prepared.uri);
    emitProgress(onProgress, { loaded: 0, total: size, percent: 0, stage: "preparing" });
    const uploadInstructions = await getUploadUrl(metadata.filename, size, metadata.contentType, scope);
    if (uploadInstructions.provider === "cloudinary" || uploadInstructions.method === "POST") {
      throw new Error("This storage provider cannot use Athoo file security scanning. Please update the app or contact support.");
    }
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await putFileToPresignedUrl(prepared.uri, uploadInstructions.uploadURL, metadata.contentType, onProgress, uploadInstructions.headers || {});
        const confirmed = await confirmUploadedObject(uploadInstructions.objectPath, size, metadata.contentType);
        emitProgress(onProgress, { loaded: 1, total: 1, percent: 100, stage: "done" });
        return confirmed.objectPath;
      } catch (error) {
        lastError = error;
        if (attempt >= 2 || !String((error as any)?.message || error).toLowerCase().match(/network|timeout|timed out|failed to fetch/)) break;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
    throw lastError;
  } catch (error) {
    throw professionalUploadError(error);
  } finally {
    if (prepared.temporary) await FileSystem.deleteAsync(prepared.uri, { idempotent: true }).catch(() => undefined);
  }
}

/**
 * Legacy alias kept for any remaining callers.
 */
export async function uploadFileToStorage(
  localUri: string,
  uploadURL: string,
  contentType: string,
): Promise<void> {
  await putFileToPresignedUrl(localUri, uploadURL, contentType);
}

// ─── React Native component ───────────────────────────────────────────────────

interface PrivateImageProps {
  objectPath: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  fallback?: React.ReactNode;
  resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
  accessibilityLabel?: string;
}

/**
 * Renders a storage image from an objectPath (/objects/<id>) or legacy URL.
 * Native requests keep the short-lived purpose token out of URLs by using an
 * Authorization header. Browser image tags use the query-token fallback.
 * data:/https URLs render directly.
 * Returns null (or `fallback`) when objectPath is empty.
 */
export function PrivateImage({
  objectPath,
  style,
  fallback,
  resizeMode = "cover",
  accessibilityLabel,
}: PrivateImageProps): React.ReactElement | null {
  const [source, setSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);

  useEffect(() => {
    if (!objectPath) {
      setSource(null);
      return;
    }
    // data: or plain https URL (legacy Cloudinary) — render directly
    if (objectPath.startsWith("data:") || objectPath.startsWith("http")) {
      setSource({ uri: optimizeCloudinaryImageUrl(objectPath) });
      return;
    }
    const base = getPrivateFileUrl(objectPath);
    api.createPurposeToken("object-read")
      .then(({ token }) => {
        if (Platform.OS === "web") {
          setSource({ uri: `${base}?token=${encodeURIComponent(token)}` });
        } else {
          setSource({ uri: base, headers: { Authorization: `Bearer ${token}` } });
        }
      })
      .catch(() => setSource(null));
  }, [objectPath]);

  if (!source) return fallback ? (fallback as React.ReactElement) : null;

  return React.createElement(Image, {
    source,
    style,
    resizeMode,
    progressiveRenderingEnabled: true,
    fadeDuration: 120,
    accessible: Boolean(accessibilityLabel),
    accessibilityRole: accessibilityLabel ? "image" : undefined,
    accessibilityLabel,
  });
}

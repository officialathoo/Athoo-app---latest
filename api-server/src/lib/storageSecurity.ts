import path from "node:path";

const DEFAULT_ALLOWED = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf",
  "video/mp4", "video/quicktime", "video/mov", "video/x-m4v",
]);

const MIME_EXTENSIONS: Record<string, Set<string>> = {
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
  "image/webp": new Set([".webp"]),
  "application/pdf": new Set([".pdf"]),
  "video/mp4": new Set([".mp4"]),
  "video/quicktime": new Set([".mov"]),
  "video/mov": new Set([".mov"]),
  "video/x-m4v": new Set([".m4v"]),
};

const SENSITIVE_NAME = /(cnic|nic[_-]?front|nic[_-]?back|selfie|identity|license|payment|receipt|commission|refund|evidence|bank)/i;

export interface UploadPolicyInput { name: string; size?: number; contentType?: string }

export function safeUploadName(name: string): string {
  const base = path.basename(String(name || "file")).replace(/[\u0000-\u001f\u007f]/g, "");
  return base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120) || "file";
}

export function uploadScopeForName(name: string): "private" | "shared" {
  return SENSITIVE_NAME.test(name) ? "private" : "shared";
}

export function userUploadKey(userId: string, name: string, id: string, date = new Date()): string {
  const scope = uploadScopeForName(name);
  return `uploads/${scope}/${userId}/${date.toISOString().slice(0, 10)}/${id}-${safeUploadName(name)}`;
}


export function normalizeStoredObjectPath(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/objects/")) return raw;
  if (raw.startsWith("objects/")) return `/${raw}`;
  if (raw.startsWith("uploads/")) return `/objects/${raw}`;
  return raw;
}

export function isOwnedUploadObjectPath(value: unknown, userId: string, allowedScopes: Array<"private" | "shared"> = ["private", "shared"]): boolean {
  const normalized = normalizeStoredObjectPath(value);
  return allowedScopes.some((scope) => normalized.startsWith(`/objects/uploads/${scope}/${userId}/`));
}

export function validateOwnedUploadObjectPaths(values: unknown, userId: string, options: { maxItems?: number; scopes?: Array<"private" | "shared"> } = {}): { ok: true; paths: string[] } | { ok: false; error: string } {
  if (!Array.isArray(values)) return { ok: true, paths: [] };
  const maxItems = Math.max(0, Math.min(20, options.maxItems ?? 5));
  if (values.length > maxItems) return { ok: false, error: `A maximum of ${maxItems} media files is allowed` };
  const paths = values.map(normalizeStoredObjectPath).filter(Boolean);
  if (paths.length !== values.filter(Boolean).length) return { ok: false, error: "Invalid media path" };
  if (paths.some((path) => !isOwnedUploadObjectPath(path, userId, options.scopes ?? ["private", "shared"]))) {
    return { ok: false, error: "Media must be uploaded through your Athoo account" };
  }
  return { ok: true, paths };
}

export function canReadStorageKey(key: string, user: { userId: string; role: string }): boolean {
  const normalized = String(key || "").replace(/^\/+/, "");
  if (!normalized.startsWith("uploads/private/")) return true; // shared and legacy objects remain compatible
  if (user.role === "admin") return true;
  return normalized.startsWith(`uploads/private/${user.userId}/`);
}

export function validateUploadPolicy(input: UploadPolicyInput): string | null {
  const type = String(input.contentType || "").toLowerCase().trim();
  if (!type) return "contentType is required";
  const configured = String(process.env.ALLOWED_UPLOAD_MIME_TYPES || "").trim();
  const allowed = configured ? new Set(configured.split(",").map(v => v.trim()).filter(Boolean)) : DEFAULT_ALLOWED;
  if (!allowed.has(type)) return `File type not allowed: ${type}`;
  if (!Number.isFinite(input.size) || Number(input.size) <= 0) return "A valid positive file size is required";
  const globalMax = Number(process.env.MAX_UPLOAD_BYTES || 200 * 1024 * 1024);
  const categoryMax = type.startsWith("image/") ? 15 * 1024 * 1024 : type === "application/pdf" ? 25 * 1024 * 1024 : 200 * 1024 * 1024;
  const max = Math.min(Number.isFinite(globalMax) && globalMax > 0 ? globalMax : categoryMax, categoryMax);
  if (Number(input.size) > max) return `File is too large. Maximum allowed size is ${Math.round(max / 1024 / 1024)}MB.`;
  const ext = path.extname(safeUploadName(input.name)).toLowerCase();
  const expected = MIME_EXTENSIONS[type];
  if (!ext || (expected && !expected.has(ext))) return "File extension does not match the declared content type";
  return null;
}

export function isPublicStorageKey(key: string): boolean {
  const normalized = String(key || "").replace(/^\/+/, "");
  const configured = String(process.env.PUBLIC_OBJECT_SEARCH_PATHS || "public").split(",")
    .map(value => value.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return configured.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Storage as GoogleCloudStorage } from "@google-cloud/storage";

export interface UploadFileInput {
  key: string;
  body: Buffer | Uint8Array | string | Readable;
  contentType?: string;
  size?: number;
  metadata?: Record<string, string>;
}

export interface StoredObjectMetadata {
  contentType?: string;
  contentLength?: number;
  cacheControl?: string;
}

export interface StoredObjectResponse extends StoredObjectMetadata {
  body: Readable;
  contentType?: string;
  contentLength?: number;
  cacheControl?: string;
}

export interface SignedUploadInput {
  key?: string;
  fileName?: string;
  contentType?: string;
  size?: number;
  metadata?: Record<string, string>;
  ttlSeconds?: number;
}

export interface SignedUploadResult {
  provider: string;
  method: "PUT";
  uploadURL: string;
  objectPath: string;
  key: string;
  headers?: Record<string, string>;
}

export interface StorageProvider {
  readonly name: string;
  uploadFile(input: UploadFileInput): Promise<{ key: string; objectPath: string }>;
  deleteObject(keyOrObjectPath: string): Promise<void>;
  replaceObject(input: UploadFileInput): Promise<{ key: string; objectPath: string }>;
  getSignedReadUrl(keyOrObjectPath: string, ttlSeconds?: number): Promise<string>;
  getSignedUploadUrl(input: SignedUploadInput): Promise<SignedUploadResult>;
  statObject(keyOrObjectPath: string): Promise<StoredObjectMetadata>;
  getObject(keyOrObjectPath: string): Promise<StoredObjectResponse>;
}

export class StorageObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "StorageObjectNotFoundError";
  }
}

/** Safe configuration error. It names missing settings but never their values. */
export class StorageNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageNotConfiguredError";
  }
}

const DEFAULT_UPLOAD_PREFIX = "uploads";

export type StorageProviderKind =
  | "r2"
  | "s3"
  | "minio"
  | "wasabi"
  | "backblaze_b2"
  | "digitalocean_spaces"
  | "custom_s3"
  | "gcs"
  | "local";

const STORAGE_PROVIDER_ALIASES: Record<string, StorageProviderKind> = {
  r2: "r2",
  "cloudflare-r2": "r2",
  cloudflare_r2: "r2",
  s3: "s3",
  aws: "s3",
  "aws-s3": "s3",
  aws_s3: "s3",
  minio: "minio",
  wasabi: "wasabi",
  b2: "backblaze_b2",
  backblaze: "backblaze_b2",
  "backblaze-b2": "backblaze_b2",
  backblaze_b2: "backblaze_b2",
  spaces: "digitalocean_spaces",
  "digitalocean-spaces": "digitalocean_spaces",
  digitalocean_spaces: "digitalocean_spaces",
  custom: "custom_s3",
  "custom-s3": "custom_s3",
  custom_s3: "custom_s3",
  gcs: "gcs",
  google: "gcs",
  "google-cloud-storage": "gcs",
  google_cloud_storage: "gcs",
  local: "local",
  dev: "local",
  filesystem: "local",
};

export function normalizeStorageProvider(value = process.env.STORAGE_PROVIDER): StorageProviderKind {
  const normalized = String(value || "r2").trim().toLowerCase();
  const provider = STORAGE_PROVIDER_ALIASES[normalized];
  if (!provider) {
    throw new StorageNotConfiguredError(
      `Unsupported STORAGE_PROVIDER '${normalized}'. Use r2, s3, minio, wasabi, backblaze_b2, digitalocean_spaces, custom_s3, gcs, or local.`,
    );
  }
  return provider;
}

export function objectPathFromKey(key: string): string {
  return `/objects/${key.replace(/^\/+/, "")}`;
}

export function keyFromObjectPath(keyOrObjectPath: string): string {
  const raw = String(keyOrObjectPath || "").trim();
  if (!raw) throw new StorageObjectNotFoundError();
  if (raw.startsWith("/objects/")) return raw.slice("/objects/".length).replace(/^\/+/, "");
  return raw.replace(/^\/+/, "");
}

function safeFileName(fileName?: string): string {
  const base = String(fileName || "file").split(/[\\/]/).pop() || "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "file";
}

function buildUploadKey(fileName?: string): string {
  const prefix = String(process.env.STORAGE_UPLOAD_PREFIX || DEFAULT_UPLOAD_PREFIX)
    .replace(/^\/+|\/+$/g, "") || DEFAULT_UPLOAD_PREFIX;
  return `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeFileName(fileName)}`;
}

function envValue(...names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function boolEnv(names: string[], fallback: boolean): boolean {
  const raw = envValue(...names);
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

interface S3CompatibleConfiguration {
  provider: Exclude<StorageProviderKind, "gcs" | "local">;
  endpoint?: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket: string;
  forcePathStyle: boolean;
  useDefaultCredentials: boolean;
}

function defaultS3Endpoint(provider: S3CompatibleConfiguration["provider"], region: string, accountId: string): string {
  if (provider === "r2" && accountId) return `https://${accountId}.r2.cloudflarestorage.com`;
  if (provider === "wasabi" && region) return `https://s3.${region}.wasabisys.com`;
  if (provider === "digitalocean_spaces" && region) return `https://${region}.digitaloceanspaces.com`;
  return "";
}

export function getS3CompatibleConfiguration(
  provider = normalizeStorageProvider(),
): S3CompatibleConfiguration {
  if (["gcs", "local"].includes(provider)) {
    throw new StorageNotConfiguredError(`Storage provider '${provider}' is not S3-compatible.`);
  }

  const s3Provider = provider as S3CompatibleConfiguration["provider"];
  const accountId = envValue("CLOUDFLARE_R2_ACCOUNT_ID");
  const region = envValue("STORAGE_S3_REGION", "S3_REGION", "AWS_REGION", "AWS_DEFAULT_REGION") || (s3Provider === "r2" ? "auto" : "us-east-1");
  const endpoint = envValue("STORAGE_S3_ENDPOINT", "S3_ENDPOINT") || defaultS3Endpoint(s3Provider, region, accountId);
  const accessKeyId = envValue(
    "STORAGE_S3_ACCESS_KEY_ID",
    "S3_ACCESS_KEY_ID",
    "AWS_ACCESS_KEY_ID",
    ...(s3Provider === "r2" ? ["CLOUDFLARE_R2_ACCESS_KEY_ID"] : []),
  );
  const secretAccessKey = envValue(
    "STORAGE_S3_SECRET_ACCESS_KEY",
    "S3_SECRET_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
    ...(s3Provider === "r2" ? ["CLOUDFLARE_R2_SECRET_ACCESS_KEY"] : []),
  );
  const bucket = envValue(
    "STORAGE_S3_BUCKET",
    "S3_BUCKET",
    ...(s3Provider === "r2" ? ["CLOUDFLARE_R2_BUCKET"] : []),
  );
  const forcePathStyle = boolEnv(
    ["STORAGE_S3_FORCE_PATH_STYLE", "S3_FORCE_PATH_STYLE"],
    ["r2", "minio", "custom_s3"].includes(s3Provider),
  );
  const useDefaultCredentials = boolEnv(["STORAGE_S3_USE_DEFAULT_CREDENTIALS"], false);

  const missing: string[] = [];
  const endpointRequired = s3Provider !== "s3";
  if (endpointRequired && !endpoint) missing.push("STORAGE_S3_ENDPOINT (or provider-specific endpoint settings)");
  if (!useDefaultCredentials && !accessKeyId) missing.push("STORAGE_S3_ACCESS_KEY_ID (or set STORAGE_S3_USE_DEFAULT_CREDENTIALS=true)");
  if (!useDefaultCredentials && !secretAccessKey) missing.push("STORAGE_S3_SECRET_ACCESS_KEY (or set STORAGE_S3_USE_DEFAULT_CREDENTIALS=true)");
  if (!bucket) missing.push("STORAGE_S3_BUCKET (or compatible legacy bucket setting)");
  if (missing.length) {
    throw new StorageNotConfiguredError(`Storage provider '${s3Provider}' is missing required configuration: ${missing.join(", ")}.`);
  }

  const invalid: string[] = [];
  if (s3Provider === "r2" && accountId && !/^[a-f0-9]{32}$/i.test(accountId)) {
    invalid.push("CLOUDFLARE_R2_ACCOUNT_ID must be a 32-character account identifier");
  }
  if (endpoint) {
    try {
      const parsed = new URL(endpoint);
      if (!["https:", "http:"].includes(parsed.protocol)) invalid.push("storage endpoint must use HTTP or HTTPS");
      if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") invalid.push("storage endpoint must use HTTPS in production");
    } catch {
      invalid.push("storage endpoint must be a valid URL");
    }
  }
  if (accessKeyId && accessKeyId.length < 3) invalid.push("storage access key is invalid");
  if (secretAccessKey && secretAccessKey.length < 8) invalid.push("storage secret key is invalid");
  if (useDefaultCredentials && s3Provider !== "s3") invalid.push("default credential-chain mode is supported only for the AWS S3 adapter");
  if (!/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/i.test(bucket)) invalid.push("storage bucket name is invalid");
  if (invalid.length) {
    throw new StorageNotConfiguredError(`Storage provider '${s3Provider}' has invalid configuration: ${invalid.join("; ")}.`);
  }

  return { provider: s3Provider, endpoint: endpoint || undefined, region, accessKeyId: accessKeyId || undefined, secretAccessKey: secretAccessKey || undefined, bucket, forcePathStyle, useDefaultCredentials };
}

export class S3CompatibleStorageProvider implements StorageProvider {
  readonly name: string;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(provider: Exclude<StorageProviderKind, "gcs" | "local"> = "r2") {
    const configuration = getS3CompatibleConfiguration(provider);
    this.name = configuration.provider;
    this.bucket = configuration.bucket;
    const config: S3ClientConfig = {
      region: configuration.region,
      ...(configuration.endpoint ? { endpoint: configuration.endpoint } : {}),
      ...(!configuration.useDefaultCredentials && configuration.accessKeyId && configuration.secretAccessKey
        ? { credentials: { accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey } }
        : {}),
      forcePathStyle: configuration.forcePathStyle,
    };
    this.client = new S3Client(config);
  }

  async uploadFile(input: UploadFileInput): Promise<{ key: string; objectPath: string }> {
    const key = keyFromObjectPath(input.key || buildUploadKey());
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: Number.isFinite(input.size) && Number(input.size) > 0 ? Number(input.size) : undefined,
      Metadata: input.metadata,
    }));
    return { key, objectPath: objectPathFromKey(key) };
  }

  async deleteObject(keyOrObjectPath: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: keyFromObjectPath(keyOrObjectPath) }));
  }

  async replaceObject(input: UploadFileInput): Promise<{ key: string; objectPath: string }> {
    await this.deleteObject(input.key).catch(() => undefined);
    return this.uploadFile(input);
  }

  async getSignedReadUrl(keyOrObjectPath: string, ttlSeconds = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: keyFromObjectPath(keyOrObjectPath) }),
      { expiresIn: ttlSeconds },
    );
  }

  async getSignedUploadUrl(input: SignedUploadInput): Promise<SignedUploadResult> {
    const key = keyFromObjectPath(input.key || buildUploadKey(input.fileName));
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: input.contentType,
      Metadata: input.metadata,
    });
    const uploadURL = await getSignedUrl(this.client, command, { expiresIn: input.ttlSeconds || 900 });
    return {
      provider: this.name,
      method: "PUT",
      uploadURL,
      objectPath: objectPathFromKey(key),
      key,
      headers: input.contentType ? { "Content-Type": input.contentType } : undefined,
    };
  }

  async statObject(keyOrObjectPath: string): Promise<StoredObjectMetadata> {
    try {
      const key = keyFromObjectPath(keyOrObjectPath);
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { contentType: head.ContentType, contentLength: head.ContentLength, cacheControl: head.CacheControl };
    } catch (error: any) {
      if (error?.name === "NoSuchKey" || error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
        throw new StorageObjectNotFoundError();
      }
      throw error;
    }
  }

  async getObject(keyOrObjectPath: string): Promise<StoredObjectResponse> {
    try {
      const key = keyFromObjectPath(keyOrObjectPath);
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!object.Body) throw new StorageObjectNotFoundError();
      return {
        body: object.Body as Readable,
        contentType: object.ContentType,
        contentLength: object.ContentLength,
        cacheControl: object.CacheControl,
      };
    } catch (error: any) {
      if (error?.name === "NoSuchKey" || error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
        throw new StorageObjectNotFoundError();
      }
      throw error;
    }
  }
}

/** Backward-compatible class name retained for existing imports. */
export class R2StorageProvider extends S3CompatibleStorageProvider {
  constructor() {
    super("r2");
  }
}

function parseGcsCredentials(): any | undefined {
  const raw = envValue("GCS_CREDENTIALS_JSON", "GOOGLE_CREDENTIALS_JSON");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      return parsed;
    } catch {
      throw new StorageNotConfiguredError("GCS_CREDENTIALS_JSON must contain a valid service-account JSON object.");
    }
  }
  const clientEmail = envValue("GCS_CLIENT_EMAIL");
  const privateKey = envValue("GCS_PRIVATE_KEY").replace(/\\n/g, "\n");
  if (clientEmail || privateKey) {
    if (!clientEmail || !privateKey) {
      throw new StorageNotConfiguredError("GCS_CLIENT_EMAIL and GCS_PRIVATE_KEY must be configured together.");
    }
    return { client_email: clientEmail, private_key: privateKey };
  }
  return undefined;
}

export class GcsStorageProvider implements StorageProvider {
  readonly name = "gcs";
  private readonly storage: GoogleCloudStorage;
  private readonly bucketName: string;

  constructor() {
    this.bucketName = envValue("GCS_BUCKET", "STORAGE_GCS_BUCKET");
    const projectId = envValue("GCS_PROJECT_ID", "GOOGLE_CLOUD_PROJECT");
    const keyFilename = envValue("GCS_KEY_FILE", "GOOGLE_APPLICATION_CREDENTIALS");
    const credentials = parseGcsCredentials();
    if (!this.bucketName) throw new StorageNotConfiguredError("Storage provider 'gcs' requires GCS_BUCKET.");
    this.storage = new GoogleCloudStorage({
      ...(projectId ? { projectId } : {}),
      ...(keyFilename ? { keyFilename } : {}),
      ...(credentials ? { credentials } : {}),
    });
  }

  private file(keyOrObjectPath: string) {
    return this.storage.bucket(this.bucketName).file(keyFromObjectPath(keyOrObjectPath));
  }

  async uploadFile(input: UploadFileInput): Promise<{ key: string; objectPath: string }> {
    const key = keyFromObjectPath(input.key || buildUploadKey());
    const file = this.file(key);
    const body = input.body instanceof Readable ? input.body : Readable.from(input.body as any);
    await new Promise<void>((resolve, reject) => {
      const output = file.createWriteStream({
        resumable: false,
        metadata: {
          ...(input.contentType ? { contentType: input.contentType } : {}),
          metadata: input.metadata || {},
        },
      });
      body.pipe(output).on("finish", resolve).on("error", reject);
    });
    return { key, objectPath: objectPathFromKey(key) };
  }

  async deleteObject(keyOrObjectPath: string): Promise<void> {
    await this.file(keyOrObjectPath).delete({ ignoreNotFound: true });
  }

  async replaceObject(input: UploadFileInput): Promise<{ key: string; objectPath: string }> {
    await this.deleteObject(input.key).catch(() => undefined);
    return this.uploadFile(input);
  }

  async getSignedReadUrl(keyOrObjectPath: string, ttlSeconds = 900): Promise<string> {
    const [url] = await this.file(keyOrObjectPath).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + ttlSeconds * 1000,
    });
    return url;
  }

  async getSignedUploadUrl(input: SignedUploadInput): Promise<SignedUploadResult> {
    const key = keyFromObjectPath(input.key || buildUploadKey(input.fileName));
    const [uploadURL] = await this.file(key).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + (input.ttlSeconds || 900) * 1000,
      ...(input.contentType ? { contentType: input.contentType } : {}),
    });
    return {
      provider: this.name,
      method: "PUT",
      uploadURL,
      objectPath: objectPathFromKey(key),
      key,
      headers: input.contentType ? { "Content-Type": input.contentType } : undefined,
    };
  }

  async statObject(keyOrObjectPath: string): Promise<StoredObjectMetadata> {
    try {
      const [metadata] = await this.file(keyOrObjectPath).getMetadata();
      return {
        contentType: metadata.contentType,
        contentLength: metadata.size ? Number(metadata.size) : undefined,
        cacheControl: metadata.cacheControl,
      };
    } catch (error: any) {
      if (error?.code === 404) throw new StorageObjectNotFoundError();
      throw error;
    }
  }

  async getObject(keyOrObjectPath: string): Promise<StoredObjectResponse> {
    try {
      const file = this.file(keyOrObjectPath);
      const [metadata] = await file.getMetadata();
      return {
        body: file.createReadStream(),
        contentType: metadata.contentType,
        contentLength: metadata.size ? Number(metadata.size) : undefined,
        cacheControl: metadata.cacheControl,
      };
    } catch (error: any) {
      if (error?.code === 404) throw new StorageObjectNotFoundError();
      throw error;
    }
  }
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private readonly root: string;

  constructor() {
    if (process.env.NODE_ENV === "production") {
      throw new StorageNotConfiguredError("LocalStorageProvider is disabled in production.");
    }
    this.root = process.env.LOCAL_STORAGE_DIR || path.resolve(process.cwd(), ".local-storage");
  }

  private fullPath(keyOrObjectPath: string): string {
    const key = keyFromObjectPath(keyOrObjectPath);
    const root = path.resolve(this.root);
    const full = path.resolve(root, key);
    if (full !== root && !full.startsWith(`${root}${path.sep}`)) throw new Error("Invalid storage path");
    return full;
  }

  async uploadFile(input: UploadFileInput): Promise<{ key: string; objectPath: string }> {
    const key = keyFromObjectPath(input.key || buildUploadKey());
    const full = this.fullPath(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const output = createWriteStream(full);
    const body = input.body instanceof Readable ? input.body : Readable.from(input.body as any);
    await new Promise<void>((resolve, reject) => body.pipe(output).on("finish", resolve).on("error", reject));
    if (input.contentType) await fs.writeFile(`${full}.meta.json`, JSON.stringify({ contentType: input.contentType }));
    return { key, objectPath: objectPathFromKey(key) };
  }

  async deleteObject(keyOrObjectPath: string): Promise<void> {
    const full = this.fullPath(keyOrObjectPath);
    await Promise.all([fs.rm(full, { force: true }), fs.rm(`${full}.meta.json`, { force: true })]);
  }

  async replaceObject(input: UploadFileInput): Promise<{ key: string; objectPath: string }> {
    await this.deleteObject(input.key).catch(() => undefined);
    return this.uploadFile(input);
  }

  async getSignedReadUrl(keyOrObjectPath: string, ttlSeconds = 900): Promise<string> {
    return `/api/storage/objects/${keyFromObjectPath(keyOrObjectPath)}?ttl=${ttlSeconds}`;
  }

  async getSignedUploadUrl(input: SignedUploadInput): Promise<SignedUploadResult> {
    const key = keyFromObjectPath(input.key || buildUploadKey(input.fileName));
    return {
      provider: this.name,
      method: "PUT",
      uploadURL: `/api/storage/local-upload/${key}`,
      objectPath: objectPathFromKey(key),
      key,
      headers: input.contentType ? { "Content-Type": input.contentType } : undefined,
    };
  }

  async statObject(keyOrObjectPath: string): Promise<StoredObjectMetadata> {
    const full = this.fullPath(keyOrObjectPath);
    try {
      const stat = await fs.stat(full);
      let contentType: string | undefined;
      try { contentType = JSON.parse(await fs.readFile(`${full}.meta.json`, "utf8")).contentType; } catch {}
      return { contentType, contentLength: stat.size };
    } catch (error: any) {
      if (error?.code === "ENOENT") throw new StorageObjectNotFoundError();
      throw error;
    }
  }

  async getObject(keyOrObjectPath: string): Promise<StoredObjectResponse> {
    const full = this.fullPath(keyOrObjectPath);
    try {
      const stat = await fs.stat(full);
      let contentType: string | undefined;
      try { contentType = JSON.parse(await fs.readFile(`${full}.meta.json`, "utf8")).contentType; } catch {}
      return { body: createReadStream(full), contentType, contentLength: stat.size };
    } catch (error: any) {
      if (error?.code === "ENOENT") throw new StorageObjectNotFoundError();
      throw error;
    }
  }
}

let cachedProvider: StorageProvider | null = null;
let cachedProviderName: StorageProviderKind | null = null;

export function resetConfiguredStorageProvider(): void {
  cachedProvider = null;
  cachedProviderName = null;
}

export function getConfiguredStorageProvider(): StorageProvider {
  const provider = normalizeStorageProvider();
  if (cachedProvider && cachedProviderName === provider) return cachedProvider;
  if (provider === "local") cachedProvider = new LocalStorageProvider();
  else if (provider === "gcs") cachedProvider = new GcsStorageProvider();
  else cachedProvider = new S3CompatibleStorageProvider(provider);
  cachedProviderName = provider;
  return cachedProvider;
}

export interface StorageConfigurationStatus {
  provider: string;
  adapter: "s3-compatible" | "gcs" | "local" | "invalid";
  configured: boolean;
  productionSafe: boolean;
  runtimeSwitchable: false;
  restartRequired: true;
  migrationRequired: true;
  endpointConfigured: boolean;
  accessKeyConfigured: boolean;
  secretConfigured: boolean;
  bucketConfigured: boolean;
  projectConfigured?: boolean;
  credentialsConfigured?: boolean;
  error?: string;
}

export function getStorageConfigurationStatus(): StorageConfigurationStatus {
  let provider: StorageProviderKind;
  try {
    provider = normalizeStorageProvider();
  } catch (error) {
    return {
      provider: String(process.env.STORAGE_PROVIDER || "").trim().toLowerCase() || "unknown",
      adapter: "invalid",
      configured: false,
      productionSafe: false,
      runtimeSwitchable: false,
      restartRequired: true,
      migrationRequired: true,
      endpointConfigured: false,
      accessKeyConfigured: false,
      secretConfigured: false,
      bucketConfigured: false,
      error: error instanceof Error ? error.message : "Invalid storage provider",
    };
  }

  if (provider === "local") {
    const configured = process.env.NODE_ENV !== "production";
    return {
      provider,
      adapter: "local",
      configured,
      productionSafe: false,
      runtimeSwitchable: false,
      restartRequired: true,
      migrationRequired: true,
      endpointConfigured: false,
      accessKeyConfigured: false,
      secretConfigured: false,
      bucketConfigured: true,
      ...(!configured ? { error: "Local storage is disabled in production." } : {}),
    };
  }

  if (provider === "gcs") {
    const bucket = envValue("GCS_BUCKET", "STORAGE_GCS_BUCKET");
    const project = envValue("GCS_PROJECT_ID", "GOOGLE_CLOUD_PROJECT");
    const credentialsConfigured = Boolean(
      envValue("GCS_CREDENTIALS_JSON", "GOOGLE_CREDENTIALS_JSON", "GCS_KEY_FILE", "GOOGLE_APPLICATION_CREDENTIALS") ||
      (envValue("GCS_CLIENT_EMAIL") && envValue("GCS_PRIVATE_KEY")),
    );
    return {
      provider,
      adapter: "gcs",
      configured: Boolean(bucket),
      productionSafe: Boolean(bucket),
      runtimeSwitchable: false,
      restartRequired: true,
      migrationRequired: true,
      endpointConfigured: true,
      accessKeyConfigured: credentialsConfigured,
      secretConfigured: credentialsConfigured,
      bucketConfigured: Boolean(bucket),
      projectConfigured: Boolean(project),
      credentialsConfigured,
      ...(!bucket ? { error: "GCS_BUCKET is required." } : {}),
    };
  }

  try {
    const configuration = getS3CompatibleConfiguration(provider);
    return {
      provider,
      adapter: "s3-compatible",
      configured: true,
      productionSafe: process.env.NODE_ENV !== "production" || !configuration.endpoint || configuration.endpoint.startsWith("https://"),
      runtimeSwitchable: false,
      restartRequired: true,
      migrationRequired: true,
      endpointConfigured: provider === "s3" ? true : Boolean(configuration.endpoint),
      accessKeyConfigured: Boolean(configuration.accessKeyId) || configuration.useDefaultCredentials,
      secretConfigured: Boolean(configuration.secretAccessKey) || configuration.useDefaultCredentials,
      bucketConfigured: Boolean(configuration.bucket),
    };
  } catch (error) {
    return {
      provider,
      adapter: "s3-compatible",
      configured: false,
      productionSafe: false,
      runtimeSwitchable: false,
      restartRequired: true,
      migrationRequired: true,
      endpointConfigured: Boolean(envValue("STORAGE_S3_ENDPOINT", "S3_ENDPOINT", "CLOUDFLARE_R2_ACCOUNT_ID")) || provider === "s3",
      accessKeyConfigured: Boolean(envValue("STORAGE_S3_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID")),
      secretConfigured: Boolean(envValue("STORAGE_S3_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_SECRET_ACCESS_KEY")),
      bucketConfigured: Boolean(envValue("STORAGE_S3_BUCKET", "S3_BUCKET", "CLOUDFLARE_R2_BUCKET")),
      error: error instanceof Error ? error.message : "Storage is not configured.",
    };
  }
}

export async function testConfiguredStorageProvider(): Promise<{
  ok: boolean;
  provider: string;
  adapter: string;
  latencyMs: number;
  writeVerified: boolean;
  statVerified: boolean;
  deleteVerified: boolean;
}> {
  const startedAt = Date.now();
  const provider = getConfiguredStorageProvider();
  const key = `.athoo-health/${randomUUID()}.txt`;
  let writeVerified = false;
  let statVerified = false;
  let deleteVerified = false;
  try {
    await provider.uploadFile({ key, body: Buffer.from("athoo-storage-health", "utf8"), contentType: "text/plain", size: 20 });
    writeVerified = true;
    const metadata = await provider.statObject(key);
    statVerified = Number(metadata.contentLength || 0) > 0;
  } finally {
    try {
      await provider.deleteObject(key);
      deleteVerified = true;
    } catch {
      deleteVerified = false;
    }
  }
  const status = getStorageConfigurationStatus();
  return {
    ok: writeVerified && statVerified && deleteVerified,
    provider: provider.name,
    adapter: status.adapter,
    latencyMs: Date.now() - startedAt,
    writeVerified,
    statVerified,
    deleteVerified,
  };
}

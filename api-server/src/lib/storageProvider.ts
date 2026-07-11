import { createReadStream, createWriteStream, promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface UploadFileInput {
  key: string;
  body: Buffer | Uint8Array | string | Readable;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface StoredObjectResponse {
  body: Readable;
  contentType?: string;
  contentLength?: number;
  cacheControl?: string;
}

export interface SignedUploadInput {
  key?: string;
  fileName?: string;
  contentType?: string;
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
  getObject(keyOrObjectPath: string): Promise<StoredObjectResponse>;
}

export class StorageObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "StorageObjectNotFoundError";
  }
}

const DEFAULT_UPLOAD_PREFIX = "uploads";

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

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export class R2StorageProvider implements StorageProvider {
  readonly name = "r2";
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
    const endpoint = process.env.S3_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;
    this.bucket = process.env.CLOUDFLARE_R2_BUCKET || process.env.S3_BUCKET || "";

    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucket) {
      throw new Error(
        "R2 storage selected but S3_ENDPOINT/CLOUDFLARE_R2_ACCOUNT_ID, access key, secret key, or bucket is missing."
      );
    }

    const config: S3ClientConfig = {
      region: process.env.S3_REGION || "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: boolEnv("S3_FORCE_PATH_STYLE", true),
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
      { expiresIn: ttlSeconds }
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

  async getObject(keyOrObjectPath: string): Promise<StoredObjectResponse> {
    try {
      const key = keyFromObjectPath(keyOrObjectPath);
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!object.Body) throw new StorageObjectNotFoundError();
      return {
        body: object.Body as Readable,
        contentType: object.ContentType || head.ContentType,
        contentLength: object.ContentLength || head.ContentLength,
        cacheControl: object.CacheControl || head.CacheControl,
      };
    } catch (error: any) {
      if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
        throw new StorageObjectNotFoundError();
      }
      throw error;
    }
  }
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private readonly root: string;

  constructor() {
    if (process.env.NODE_ENV === "production") {
      throw new Error("LocalStorageProvider is disabled in production.");
    }
    this.root = process.env.LOCAL_STORAGE_DIR || path.resolve(process.cwd(), ".local-storage");
  }

  private fullPath(keyOrObjectPath: string): string {
    const key = keyFromObjectPath(keyOrObjectPath);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root))) throw new Error("Invalid storage path");
    return full;
  }

  async uploadFile(input: UploadFileInput): Promise<{ key: string; objectPath: string }> {
    const key = keyFromObjectPath(input.key || buildUploadKey());
    const full = this.fullPath(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const out = createWriteStream(full);
    const body = input.body instanceof Readable ? input.body : Readable.from(input.body as any);
    await new Promise<void>((resolve, reject) => body.pipe(out).on("finish", resolve).on("error", reject));
    if (input.contentType) await fs.writeFile(`${full}.meta.json`, JSON.stringify({ contentType: input.contentType }));
    return { key, objectPath: objectPathFromKey(key) };
  }

  async deleteObject(keyOrObjectPath: string): Promise<void> {
    await fs.rm(this.fullPath(keyOrObjectPath), { force: true });
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

  async getObject(keyOrObjectPath: string): Promise<StoredObjectResponse> {
    const full = this.fullPath(keyOrObjectPath);
    try {
      const stat = await fs.stat(full);
      let contentType: string | undefined;
      try {
        const meta = JSON.parse(await fs.readFile(`${full}.meta.json`, "utf8"));
        contentType = meta.contentType;
      } catch {}
      return { body: createReadStream(full), contentType, contentLength: stat.size };
    } catch (error: any) {
      if (error?.code === "ENOENT") throw new StorageObjectNotFoundError();
      throw error;
    }
  }
}

let cachedProvider: StorageProvider | null = null;

export function getConfiguredStorageProvider(): StorageProvider {
  if (cachedProvider) return cachedProvider;
  const provider = String(process.env.STORAGE_PROVIDER || "r2").toLowerCase().trim();
  if (["r2", "cloudflare-r2", "s3"].includes(provider)) {
    cachedProvider = new R2StorageProvider();
  } else if (["local", "dev", "filesystem"].includes(provider)) {
    cachedProvider = new LocalStorageProvider();
  } else {
    throw new Error(`Unsupported STORAGE_PROVIDER '${provider}'. Use 'r2' for production or 'local' for development.`);
  }
  return cachedProvider;
}

#!/usr/bin/env node
import process from "node:process";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Storage as GoogleCloudStorage } from "@google-cloud/storage";

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const verifyOnly = args.has("--verify-only");
const prefix = String(process.env.STORAGE_MIGRATION_PREFIX || "").replace(/^\/+/, "");
const concurrency = Math.max(1, Math.min(20, Number(process.env.STORAGE_MIGRATION_CONCURRENCY || 4)));

function env(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function normalizeProvider(value) {
  const aliases = new Map([
    ["r2", "s3"], ["cloudflare-r2", "s3"], ["cloudflare_r2", "s3"],
    ["s3", "s3"], ["aws", "s3"], ["aws-s3", "s3"], ["aws_s3", "s3"],
    ["minio", "s3"], ["wasabi", "s3"], ["backblaze_b2", "s3"], ["backblaze-b2", "s3"],
    ["digitalocean_spaces", "s3"], ["digitalocean-spaces", "s3"], ["custom_s3", "s3"], ["custom-s3", "s3"],
    ["gcs", "gcs"], ["google", "gcs"], ["google-cloud-storage", "gcs"],
  ]);
  const normalized = aliases.get(String(value || "").trim().toLowerCase());
  if (!normalized) throw new Error(`Unsupported migration provider '${value}'. Use an S3-compatible provider or gcs.`);
  return normalized;
}

function parseJson(name, value) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new Error(`${name} must contain valid JSON`);
  }
}

function createS3Adapter(side) {
  const upper = side.toUpperCase();
  const endpoint = env(`STORAGE_${upper}_S3_ENDPOINT`);
  const region = env(`STORAGE_${upper}_S3_REGION`) || "us-east-1";
  const accessKeyId = env(`STORAGE_${upper}_S3_ACCESS_KEY_ID`);
  const secretAccessKey = env(`STORAGE_${upper}_S3_SECRET_ACCESS_KEY`);
  const bucket = env(`STORAGE_${upper}_S3_BUCKET`);
  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(`${side} S3 configuration requires STORAGE_${upper}_S3_ACCESS_KEY_ID, STORAGE_${upper}_S3_SECRET_ACCESS_KEY, and STORAGE_${upper}_S3_BUCKET`);
  }
  const forcePathStyle = ["1", "true", "yes", "on"].includes(env(`STORAGE_${upper}_S3_FORCE_PATH_STYLE`).toLowerCase());
  const client = new S3Client({
    region,
    ...(endpoint ? { endpoint } : {}),
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle,
  });
  return {
    kind: "s3",
    label: `${side}:s3:${bucket}`,
    async *list() {
      let continuationToken;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, ContinuationToken: continuationToken }));
        for (const item of page.Contents || []) {
          if (item.Key) yield { key: item.Key, size: Number(item.Size || 0), contentType: undefined };
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
    },
    async stat(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { exists: true, size: Number(head.ContentLength || 0), contentType: head.ContentType, metadata: head.Metadata || {} };
      } catch (error) {
        if (error?.name === "NotFound" || error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) return { exists: false };
        throw error;
      }
    },
    async read(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) throw new Error(`Source object '${key}' returned no body`);
      return { body: result.Body, size: Number(result.ContentLength || 0), contentType: result.ContentType, metadata: result.Metadata || {} };
    },
    async write(key, object) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: object.body,
        ContentLength: object.size || undefined,
        ContentType: object.contentType,
        Metadata: object.metadata,
      }));
    },
  };
}

function createGcsAdapter(side) {
  const upper = side.toUpperCase();
  const bucketName = env(`STORAGE_${upper}_GCS_BUCKET`);
  const projectId = env(`STORAGE_${upper}_GCS_PROJECT_ID`);
  const keyFilename = env(`STORAGE_${upper}_GCS_KEY_FILE`);
  const credentials = parseJson(`STORAGE_${upper}_GCS_CREDENTIALS_JSON`, env(`STORAGE_${upper}_GCS_CREDENTIALS_JSON`));
  if (!bucketName) throw new Error(`${side} GCS configuration requires STORAGE_${upper}_GCS_BUCKET`);
  const storage = new GoogleCloudStorage({
    ...(projectId ? { projectId } : {}),
    ...(keyFilename ? { keyFilename } : {}),
    ...(credentials ? { credentials } : {}),
  });
  const bucket = storage.bucket(bucketName);
  return {
    kind: "gcs",
    label: `${side}:gcs:${bucketName}`,
    async *list() {
      let pageToken;
      do {
        const [files, , response] = await bucket.getFiles({ prefix: prefix || undefined, autoPaginate: false, pageToken });
        for (const file of files) {
          const [metadata] = await file.getMetadata();
          yield { key: file.name, size: Number(metadata.size || 0), contentType: metadata.contentType };
        }
        pageToken = response?.nextPageToken;
      } while (pageToken);
    },
    async stat(key) {
      try {
        const [metadata] = await bucket.file(key).getMetadata();
        return { exists: true, size: Number(metadata.size || 0), contentType: metadata.contentType, metadata: metadata.metadata || {} };
      } catch (error) {
        if (error?.code === 404) return { exists: false };
        throw error;
      }
    },
    async read(key) {
      const file = bucket.file(key);
      const [metadata] = await file.getMetadata();
      return { body: file.createReadStream(), size: Number(metadata.size || 0), contentType: metadata.contentType, metadata: metadata.metadata || {} };
    },
    async write(key, object) {
      await new Promise((resolve, reject) => {
        const output = bucket.file(key).createWriteStream({
          resumable: false,
          metadata: {
            ...(object.contentType ? { contentType: object.contentType } : {}),
            metadata: object.metadata || {},
          },
        });
        object.body.pipe(output).on("finish", resolve).on("error", reject);
      });
    },
  };
}

function createAdapter(side) {
  const provider = normalizeProvider(env(`STORAGE_MIGRATION_${side.toUpperCase()}_PROVIDER`));
  return provider === "gcs" ? createGcsAdapter(side) : createS3Adapter(side);
}

async function mapWithConcurrency(items, limit, worker) {
  const pending = new Set();
  for (const item of items) {
    const task = Promise.resolve().then(() => worker(item)).finally(() => pending.delete(task));
    pending.add(task);
    if (pending.size >= limit) await Promise.race(pending);
  }
  await Promise.all(pending);
}

const source = createAdapter("source");
const target = createAdapter("target");
if (source.label === target.label) throw new Error("Source and target storage configurations are identical");

const objects = [];
for await (const item of source.list()) objects.push(item);

const summary = {
  mode: verifyOnly ? "verify" : execute ? "execute" : "dry-run",
  source: source.label,
  target: target.label,
  prefix,
  objectsScanned: objects.length,
  bytesScanned: objects.reduce((sum, item) => sum + item.size, 0),
  copied: 0,
  skippedMatching: 0,
  wouldCopy: 0,
  mismatched: 0,
  failed: 0,
  failures: [],
};

await mapWithConcurrency(objects, concurrency, async (item) => {
  try {
    const targetStat = await target.stat(item.key);
    if (targetStat.exists && Number(targetStat.size || 0) === item.size) {
      summary.skippedMatching += 1;
      return;
    }
    if (verifyOnly) {
      summary.mismatched += 1;
      return;
    }
    if (!execute) {
      summary.wouldCopy += 1;
      return;
    }
    const object = await source.read(item.key);
    await target.write(item.key, object);
    const verified = await target.stat(item.key);
    if (!verified.exists || Number(verified.size || 0) !== item.size) {
      throw new Error(`Target verification failed for '${item.key}'`);
    }
    summary.copied += 1;
  } catch (error) {
    summary.failed += 1;
    if (summary.failures.length < 50) summary.failures.push({ key: item.key, error: error instanceof Error ? error.message : String(error) });
  }
});

console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0 || (verifyOnly && summary.mismatched > 0)) process.exitCode = 1;
if (!execute && !verifyOnly) {
  console.error("Dry run only. Re-run with --execute after reviewing the summary. Use --verify-only after migration.");
}

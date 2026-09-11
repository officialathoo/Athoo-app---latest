/**
 * Apply Cloudflare R2 bucket CORS rules so browser clients (admin panel Vercel
 * origin, local dev) can upload files directly to presigned PUT URLs.
 *
 * Run from the api-server package so @aws-sdk/client-s3 and dotenv resolve:
 *   node ../scripts/tools/apply-r2-cors.mjs
 *
 * Reads credentials from the repository root .env (CLOUDFLARE_R2_* /
 * STORAGE_S3_* / CORS_ORIGINS / ADMIN_BASE_URL). Prints only the resulting
 * bucket CORS configuration -- never secret values.
 */
import dotenv from "dotenv";
import path from "node:path";
import { createRequire } from "node:module";
// @ts-check
const ROOT = path.resolve(import.meta.dirname, "../..") || path.resolve(process.cwd(), "..");

dotenv.config({ path: path.join(ROOT, ".env") });

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || "";
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.STORAGE_S3_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.STORAGE_S3_SECRET_ACCESS_KEY || "";
const bucket = process.env.CLOUDFLARE_R2_BUCKET || process.env.STORAGE_S3_BUCKET || "";
const endpoint = process.env.STORAGE_S3_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
const region = process.env.STORAGE_S3_REGION || "auto";

if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) {
  console.error("Missing R2 configuration in .env (need STORAGE_S3_ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET/ENDPOINT or CLOUDFLARE_R2_* equivalents).");
  process.exit(1);
}

const configuredOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "")
  .split(",").map((item) => item.trim().replace(/\/+$/, "")).filter(Boolean);
const adminBase = (process.env.ADMIN_BASE_URL || "").trim().replace(/\/+$/, "");

const allowedOrigins = [
  "https://athoo-app-latest-admin-panel.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  ...(adminBase ? [adminBase] : []),
  ...configuredOrigins,
].filter((origin, index, all) => origin && all.indexOf(origin) === index);

const apiServerRequire = createRequire(path.join(ROOT, "api-server/package.json"));
const { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } = apiServerRequire("@aws-sdk/client-s3");

const client = new S3Client({
  region,
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

const corsRules = [
  {
    AllowedOrigins: allowedOrigins,
    AllowedMethods: ["GET", "PUT", "POST", "HEAD"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag", "Content-Length"],
    MaxAgeSeconds: 3600,
  },
];

console.log(`Applying CORS to R2 bucket "${bucket}" at ${endpoint}`);
console.log(`Allowed origins (${allowedOrigins.length}): ${JSON.stringify(allowedOrigins, null, 2)}`);

try {
  await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: corsRules } }));
  const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log("OK. Bucket CORS now:");
  console.log(JSON.stringify(current.CORSRules, null, 2));
} catch (error) {
  console.error("Failed to apply R2 bucket CORS:", error?.name || error, error?.message || "");
  console.error("If the credentials lack Apply-CORS scope, add this rule in the Cloudflare R2 dashboard for bucket region:");
  process.exit(1);
}
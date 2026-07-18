import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");


test("storage uses provider-neutral S3-compatible, GCS, and local adapters", () => {
  const storage = read("api-server/src/lib/storageProvider.ts");
  assert.match(storage, /export type StorageProviderKind/);
  assert.match(storage, /class S3CompatibleStorageProvider/);
  assert.match(storage, /class GcsStorageProvider/);
  assert.match(storage, /class LocalStorageProvider/);
  for (const provider of ["r2", "s3", "minio", "wasabi", "backblaze_b2", "digitalocean_spaces", "custom_s3", "gcs"]) {
    assert.match(storage, new RegExp(provider));
  }
  assert.match(storage, /STORAGE_S3_ENDPOINT/);
  assert.match(storage, /STORAGE_S3_ACCESS_KEY_ID/);
  assert.match(storage, /STORAGE_S3_SECRET_ACCESS_KEY/);
  assert.match(storage, /STORAGE_S3_BUCKET/);
  assert.match(storage, /CLOUDFLARE_R2_ACCESS_KEY_ID/);
});


test("storage selection remains deployment-controlled and migration-safe", () => {
  const storage = read("api-server/src/lib/storageProvider.ts");
  const admin = read("api-server/src/routes/admin.ts");
  assert.match(storage, /runtimeSwitchable: false/);
  assert.match(storage, /restartRequired: true/);
  assert.match(storage, /migrationRequired: true/);
  assert.match(storage, /testConfiguredStorageProvider/);
  assert.match(admin, /\/settings\/integrations\/storage\/test/);
  assert.match(admin, /storage_provider_connectivity_tested/);
  assert.match(admin, /writeVerified|adapter: storage\.adapter/);
});


test("migration tooling defaults to dry run and never deletes source objects", () => {
  const migration = read("api-server/scripts/storage-migrate.mjs");
  const pkg = JSON.parse(read("package.json"));
  assert.match(migration, /const execute = args\.has\("--execute"\)/);
  assert.match(migration, /const verifyOnly = args\.has\("--verify-only"\)/);
  assert.match(migration, /Dry run only/);
  assert.match(migration, /ListObjectsV2Command/);
  assert.match(migration, /GetObjectCommand/);
  assert.match(migration, /PutObjectCommand/);
  assert.doesNotMatch(migration, /DeleteObjectCommand|bucket\.file\([^)]*\)\.delete\(/);
  assert.equal(pkg.scripts["storage:migrate"], "node ./api-server/scripts/storage-migrate.mjs");
  assert.equal(pkg.scripts["storage:verify"], "node ./api-server/scripts/storage-migrate.mjs --verify-only");
});


test("obsolete Replit sidecar storage source and direct auth dependency are removed", () => {
  assert.equal(fs.existsSync(path.join(root, "api-server/src/lib/objectStorage.ts")), false);
  assert.equal(fs.existsSync(path.join(root, "api-server/src/lib/objectAcl.ts")), false);
  const apiPackage = JSON.parse(read("api-server/package.json"));
  assert.equal(apiPackage.dependencies["google-auth-library"], undefined);
  assert.equal(apiPackage.dependencies["@google-cloud/storage"], "^7.19.0");
  const runtimeSource = read("api-server/src/lib/storageProvider.ts");
  assert.doesNotMatch(runtimeSource, /127\.0\.0\.1:1106|REPLIT_SIDECAR_ENDPOINT|audience:\s*"replit"/);
});


test("deployment templates and validator support portable storage settings", () => {
  const env = read(".env.production.example");
  const render = read("render.yaml");
  const validator = read("scripts/tools/validate-environment.mjs");
  for (const key of [
    "STORAGE_S3_ENDPOINT",
    "STORAGE_S3_REGION",
    "STORAGE_S3_ACCESS_KEY_ID",
    "STORAGE_S3_SECRET_ACCESS_KEY",
    "STORAGE_S3_BUCKET",
    "GCS_BUCKET",
    "GCS_CREDENTIALS_JSON",
  ]) {
    assert.match(env, new RegExp(`${key}=`));
    assert.match(render, new RegExp(`key: ${key}`));
    assert.match(validator, new RegExp(key));
  }
  assert.match(validator, /STORAGE_PROVIDER must be r2, s3, minio, wasabi, backblaze_b2, digitalocean_spaces, custom_s3, gcs, or local/);
});


test("admin UI exposes secret-safe storage testing and migration warning", () => {
  const settings = read("admin-panel/src/pages/SettingsPage.tsx");
  assert.match(settings, /Test Storage/);
  assert.match(settings, /\/api\/admin\/settings\/integrations\/storage\/test/);
  assert.match(settings, /migration check required/);
  assert.match(settings, /without source changes/);
  assert.doesNotMatch(settings, /STORAGE_S3_SECRET_ACCESS_KEY|GCS_PRIVATE_KEY/);
});


test("EAS project identity remains deployment configured", () => {
  const config = read("athoo-app/app.config.js");
  assert.match(config, /readEnv\(\s*"EAS_PROJECT_ID"/);
  assert.doesNotMatch(config, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

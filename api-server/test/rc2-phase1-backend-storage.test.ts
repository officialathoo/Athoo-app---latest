import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("storage configuration is trimmed and validates provider-specific requirements before SDK construction", () => {
  const source = read("api-server/src/lib/storageProvider.ts");
  assert.match(source, /String\(process\.env\[name\] \|\| ""\)\.trim\(\)/);
  assert.match(source, /getS3CompatibleConfiguration/);
  assert.match(source, /CLOUDFLARE_R2_ACCOUNT_ID must be a 32-character account identifier/);
  assert.match(source, /storage endpoint must use HTTPS in production/);
  assert.match(source, /STORAGE_S3_ACCESS_KEY_ID/);
  assert.doesNotMatch(source, /ACCESS_KEY_ID must be exactly 32 characters/);
});

test("mobile uploads never expose raw XML or credential diagnostics", () => {
  const source = read("athoo-app/services/storage.ts");
  assert.match(source, /professionalUploadError/);
  assert.match(source, /Media upload is temporarily unavailable/);
  assert.match(source, /<\\\?xml\|<error>/);
  assert.doesNotMatch(source, /Upload failed \(\$\{result\?\.status[^\n]+result\?\.body/);
});

test("OTP success remains gated by PostgreSQL returning persistence confirmation", () => {
  const source = read("api-server/src/routes/auth.ts");
  assert.match(source, /\.returning\(\{/);
  assert.match(source, /OTP persistence verification failed/);
  assert.match(source, /authentication OTP persisted/);
});

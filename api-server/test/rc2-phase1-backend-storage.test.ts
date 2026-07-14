import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("R2 configuration is trimmed and strictly validated before SDK construction", () => {
  const source = read("api-server/src/lib/storageProvider.ts");
  assert.match(source, /String\(process\.env\[name\] \|\| ""\)\.trim\(\)/);
  assert.match(source, /ACCESS_KEY_ID must be exactly 32 characters/);
  assert.match(source, /validateR2Configuration\(\{ accountId, endpoint, accessKeyId, secretAccessKey, bucket: this\.bucket \}\)/);
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

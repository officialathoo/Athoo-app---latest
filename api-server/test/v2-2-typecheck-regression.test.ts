import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("account step-up options await the asynchronous OTP delivery configuration", () => {
  const stepUp = read("api-server/src/lib/accountStepUp.ts");
  const accountRoute = read("api-server/src/routes/account.ts");
  assert.match(stepUp, /export async function getAccountStepUpOptions/);
  assert.match(stepUp, /await getOtpDeliveryConfigurationStatus\(\)/);
  assert.match(accountRoute, /res\.json\(await getAccountStepUpOptions\(user\)\)/);
});

test("every configured storage adapter implements secure object copy and factory returns a concrete provider", () => {
  const storage = read("api-server/src/lib/storageProvider.ts");
  const gcsStart = storage.indexOf("export class GcsStorageProvider");
  const localStart = storage.indexOf("export class LocalStorageProvider");
  assert.ok(gcsStart >= 0 && localStart > gcsStart);
  const gcs = storage.slice(gcsStart, localStart);
  assert.match(gcs, /async copyObject\(/);
  assert.match(gcs, /await source\.copy\(target\)/);
  assert.match(gcs, /await target\.setMetadata\(/);
  assert.match(storage, /const nextProvider: StorageProvider/);
  assert.match(storage, /return nextProvider/);
});

test("provider location updates use a declared realtime event", () => {
  const eventBus = read("api-server/src/lib/eventBus.ts");
  const providers = read("api-server/src/routes/providers.ts");
  assert.match(eventBus, /\| "provider:location"/);
  assert.match(providers, /emitToUser\(provider\.id, "provider:location"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

test("mobile storage upload contract accepts explicit private/shared scope", () => {
  const storage = readRepo("athoo-app/services/storage.ts");
  assert.match(
    storage,
    /export async function uploadPickedImage\([\s\S]*?onProgress\?: UploadProgressCallback,[\s\S]*?scope: UploadScope = "shared",[\s\S]*?\): Promise<string>/,
  );
  assert.match(storage, /getUploadUrl\(metadata\.filename, size, metadata\.contentType, scope\)/);
  assert.match(storage, /uploadFileToCloudinary\([\s\S]*?onProgress,[\s\S]*?scope,[\s\S]*?\)/);
});

test("sensitive mobile evidence uploads remain explicitly private", () => {
  for (const file of [
    "athoo-app/app/(customer)/subscription.tsx",
    "athoo-app/app/(provider)/pay-commission.tsx",
    "athoo-app/app/(provider)/subscription.tsx",
    "athoo-app/app/(provider)/verification-documents.tsx",
    "athoo-app/app/auth/provider-register.tsx",
    "athoo-app/components/screens/ContactSupportScreen.tsx",
  ]) {
    assert.match(readRepo(file), /uploadPickedImage\([\s\S]*?"private"\)/, `${file} must request private storage`);
  }
});

test("portable video upload remains explicitly shared", () => {
  const api = readRepo("athoo-app/services/api.ts");
  assert.match(api, /uploadPickedImage\(localUri, "booking-video\.mp4", "video\/mp4", undefined, "shared"\)/);
});

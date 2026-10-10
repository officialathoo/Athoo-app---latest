import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

import {
  validatedCleanUploadObjectPath,
} from "../../admin-panel/src/lib/cleanUploadResult.ts";

const adminStorageSource =
  readFileSync(
    new URL(
      "../../admin-panel/src/lib/storage.ts",
      import.meta.url,
    ),
    "utf8",
  );

const adminImageSource =
  readFileSync(
    new URL(
      "../../admin-panel/src/components/ui/StorageImage.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const mobileStorageSource =
  readFileSync(
    new URL(
      "../../athoo-app/services/storage.ts",
      import.meta.url,
    ),
    "utf8",
  );

test(
  "clean completion returns only the promoted object path",
  () => {
    const finalPath =
      "/objects/uploads/shared/user-1/2026-08-06/final.jpg";

    assert.equal(
      validatedCleanUploadObjectPath({
        success: true,
        objectPath: finalPath,
        size: 1234,
        contentType: "image/jpeg",
        sha256: "a".repeat(64),
        securityStatus: "clean",
      }),
      finalPath,
    );
  },
);

test(
  "quarantine and incomplete completion payloads are rejected",
  () => {
    assert.throws(
      () =>
        validatedCleanUploadObjectPath({
          success: true,
          objectPath:
            "/objects/uploads/quarantine/incoming/user-1/file.jpg",
          size: 1234,
          contentType: "image/jpeg",
          sha256: "a".repeat(64),
          securityStatus: "clean",
        }),
      /could not be verified/i,
    );

    assert.throws(
      () =>
        validatedCleanUploadObjectPath({
          success: true,
          objectPath:
            "/objects/uploads/shared/user-1/file.jpg",
          size: 1234,
          contentType: "image/jpeg",
          securityStatus: "clean",
        }),
      /could not be verified/i,
    );
  },
);

test(
  "admin upload persists the completion response path",
  () => {
    assert.match(
      adminStorageSource,
      /completionPayload/,
    );

    assert.match(
      adminStorageSource,
      /validatedCleanUploadObjectPath\s*\(\s*completionPayload\s*,?\s*\)/,
    );

    const uploadFunction =
      adminStorageSource.match(
        /export async function uploadFile[\s\S]*?\n}/,
      )?.[0] ?? "";

    assert.doesNotMatch(
      uploadFunction,
      /return objectPath\s*;/,
    );
  },
);

test(
  "admin and mobile image renderers fall back after load failure",
  () => {
    assert.match(
      adminImageSource,
      /onError=\{\(event\) =>/,
    );

    assert.match(
      adminImageSource,
      /setFailed\(true\)/,
    );

    assert.match(
      mobileStorageSource,
      /onError:\s*\(\)\s*=>\s*setFailed\(true\)/,
    );

    assert.match(
      mobileStorageSource,
      /if\s*\(failed\s*\|\|\s*!source\)/,
    );
  },
);

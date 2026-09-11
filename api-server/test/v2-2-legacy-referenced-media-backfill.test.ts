import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_REFERENCED_MEDIA_BACKFILL_CONFIRMATION,
  classifyLegacyReferencedMediaCandidate,
  parseLegacyReferencedMediaBackfillOptions,
  safeLegacyReferencedMediaErrorCode,
  validateLegacyReferencedMediaMetadata,
} from "../src/lib/legacyReferencedMediaBackfill.ts";

test(
  "shared customer media is accepted",
  () => {
    const result =
      classifyLegacyReferencedMediaCandidate({
        ownerId: "customer-1",
        objectPath:
          "/objects/uploads/shared/customer-1/2026-01-01/job.mp4",
        expectedScopePolicy:
          "SHARED_ONLY",
        hasSecurityRecord: false,
        referenceCount: 2,
      });

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal(result.scope, "shared");
      assert.equal(result.originalName, "job.mp4");
      assert.equal(result.referenceCount, 2);
    }
  },
);

test(
  "private sensitive media is accepted",
  () => {
    const result =
      classifyLegacyReferencedMediaCandidate({
        ownerId: "provider-1",
        objectPath:
          "/objects/uploads/private/provider-1/2026-01-01/payment.jpg",
        expectedScopePolicy:
          "PRIVATE_ONLY",
        hasSecurityRecord: false,
        referenceCount: 1,
      });

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal(result.scope, "private");
    }
  },
);

test(
  "owner mismatch is rejected",
  () => {
    assert.deepEqual(
      classifyLegacyReferencedMediaCandidate({
        ownerId: "customer-1",
        objectPath:
          "/objects/uploads/shared/customer-2/2026-01-01/job.mp4",
        expectedScopePolicy:
          "SHARED_ONLY",
        hasSecurityRecord: false,
        referenceCount: 1,
      }),
      {
        ok: false,
        reason: "owner_path_mismatch",
      },
    );
  },
);

test(
  "scope mismatch is rejected",
  () => {
    assert.deepEqual(
      classifyLegacyReferencedMediaCandidate({
        ownerId: "provider-1",
        objectPath:
          "/objects/uploads/shared/provider-1/2026-01-01/payment.jpg",
        expectedScopePolicy:
          "PRIVATE_ONLY",
        hasSecurityRecord: false,
        referenceCount: 1,
      }),
      {
        ok: false,
        reason: "scope_policy_mismatch",
      },
    );
  },
);

test(
  "invalid upload paths are rejected",
  () => {
    assert.deepEqual(
      classifyLegacyReferencedMediaCandidate({
        ownerId: "user-1",
        objectPath:
          "/objects/public/file.jpg",
        expectedScopePolicy:
          "PRIVATE_OR_SHARED",
        hasSecurityRecord: false,
        referenceCount: 1,
      }),
      {
        ok: false,
        reason: "invalid_upload_path",
      },
    );
  },
);

test(
  "existing security records are rejected",
  () => {
    assert.deepEqual(
      classifyLegacyReferencedMediaCandidate({
        ownerId: "user-1",
        objectPath:
          "/objects/uploads/shared/user-1/2026-01-01/file.jpg",
        expectedScopePolicy:
          "SHARED_ONLY",
        hasSecurityRecord: true,
        referenceCount: 1,
      }),
      {
        ok: false,
        reason: "security_record_exists",
      },
    );
  },
);

test(
  "reference count must be positive",
  () => {
    assert.deepEqual(
      classifyLegacyReferencedMediaCandidate({
        ownerId: "user-1",
        objectPath:
          "/objects/uploads/shared/user-1/2026-01-01/file.jpg",
        expectedScopePolicy:
          "SHARED_ONLY",
        hasSecurityRecord: false,
        referenceCount: 0,
      }),
      {
        ok: false,
        reason: "invalid_reference_count",
      },
    );
  },
);

test(
  "unsupported extensions are rejected",
  () => {
    assert.deepEqual(
      classifyLegacyReferencedMediaCandidate({
        ownerId: "user-1",
        objectPath:
          "/objects/uploads/shared/user-1/2026-01-01/file.svg",
        expectedScopePolicy:
          "SHARED_ONLY",
        hasSecurityRecord: false,
        referenceCount: 1,
      }),
      {
        ok: false,
        reason:
          "unsupported_media_extension",
      },
    );
  },
);

test(
  "backfill defaults to bounded dry run",
  () => {
    assert.deepEqual(
      parseLegacyReferencedMediaBackfillOptions(
        [],
        {},
      ),
      {
        execute: false,
        dryRun: true,
        limit: 20,
      },
    );

    assert.deepEqual(
      parseLegacyReferencedMediaBackfillOptions(
        [
          "--dry-run",
          "--limit=50",
        ],
        {},
      ),
      {
        execute: false,
        dryRun: true,
        limit: 50,
      },
    );

    assert.throws(
      () =>
        parseLegacyReferencedMediaBackfillOptions(
          ["--limit=51"],
          {},
        ),
      /LEGACY_REFERENCED_MEDIA_INVALID_LIMIT/,
    );
  },
);

test(
  "execute requires exact confirmation and one item",
  () => {
    assert.throws(
      () =>
        parseLegacyReferencedMediaBackfillOptions(
          ["--execute", "--limit=1"],
          {},
        ),
      /LEGACY_REFERENCED_MEDIA_CONFIRMATION_REQUIRED/,
    );

    assert.throws(
      () =>
        parseLegacyReferencedMediaBackfillOptions(
          ["--execute", "--limit=2"],
          {
            LEGACY_REFERENCED_MEDIA_BACKFILL_CONFIRM:
              LEGACY_REFERENCED_MEDIA_BACKFILL_CONFIRMATION,
          },
        ),
      /LEGACY_REFERENCED_MEDIA_EXECUTE_LIMIT_MUST_BE_ONE/,
    );

    assert.deepEqual(
      parseLegacyReferencedMediaBackfillOptions(
        ["--execute", "--limit=1"],
        {
          LEGACY_REFERENCED_MEDIA_BACKFILL_CONFIRM:
            LEGACY_REFERENCED_MEDIA_BACKFILL_CONFIRMATION,
        },
      ),
      {
        execute: true,
        dryRun: false,
        limit: 1,
      },
    );
  },
);

test(
  "JPEG metadata follows current upload policy",
  () => {
    assert.deepEqual(
      validateLegacyReferencedMediaMetadata(
        "payment.jpg",
        31_884,
        "image/jpeg",
      ),
      {
        ok: true,
        size: 31_884,
        contentType: "image/jpeg",
      },
    );
  },
);

test(
  "MP4 metadata follows current upload policy",
  () => {
    assert.deepEqual(
      validateLegacyReferencedMediaMetadata(
        "job.mp4",
        5_000_000,
        "video/mp4",
      ),
      {
        ok: true,
        size: 5_000_000,
        contentType: "video/mp4",
      },
    );
  },
);

test(
  "MIME and extension mismatch is rejected",
  () => {
    const result =
      validateLegacyReferencedMediaMetadata(
        "job.jpg",
        5_000_000,
        "video/mp4",
      );

    assert.equal(result.ok, false);
  },
);

test(
  "errors are reduced to non-PII codes",
  () => {
    assert.equal(
      safeLegacyReferencedMediaErrorCode(
        new Error(
          "LEGACY_REFERENCED_MEDIA_SOURCE_CHANGED",
        ),
      ),
      "LEGACY_REFERENCED_MEDIA_SOURCE_CHANGED",
    );

    assert.equal(
      safeLegacyReferencedMediaErrorCode(
        new Error(
          "unsafe path /objects/uploads/private/secret",
        ),
      ),
      "Error",
    );
  },
);
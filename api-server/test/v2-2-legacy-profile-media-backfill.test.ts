import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_PROFILE_MEDIA_BACKFILL_CONFIRMATION,
  classifyLegacyProfileMediaCandidate,
  parseLegacyProfileMediaBackfillOptions,
  safeLegacyBackfillErrorCode,
  validateLegacyProfileMediaMetadata,
} from "../src/lib/legacyProfileMediaBackfill.ts";

test(
  "legacy profile candidate must be owner-bound",
  () => {
    const accepted =
      classifyLegacyProfileMediaCandidate({
        userId: "user-1",
        profileImage:
          "/objects/uploads/shared/user-1/2026-01-01/photo.jpg",
        hasSecurityRecord: false,
      });

    assert.equal(
      accepted.ok,
      true,
    );

    if (accepted.ok) {
      assert.equal(
        accepted.scope,
        "shared",
      );

      assert.equal(
        accepted.originalName,
        "photo.jpg",
      );
    }

    const rejected =
      classifyLegacyProfileMediaCandidate({
        userId: "user-1",
        profileImage:
          "/objects/uploads/shared/user-2/2026-01-01/photo.jpg",
        hasSecurityRecord: false,
      });

    assert.deepEqual(
      rejected,
      {
        ok: false,
        reason:
          "owner_path_mismatch",
      },
    );
  },
);

test(
  "private owner-bound profile paths are accepted",
  () => {
    const result =
      classifyLegacyProfileMediaCandidate({
        userId: "user-1",
        profileImage:
          "/objects/uploads/private/user-1/2026-01-01/photo.png",
        hasSecurityRecord: false,
      });

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal(
        result.scope,
        "private",
      );
    }
  },
);

test(
  "existing security records are never backfilled",
  () => {
    assert.deepEqual(
      classifyLegacyProfileMediaCandidate({
        userId: "user-1",
        profileImage:
          "/objects/uploads/shared/user-1/2026-01-01/photo.jpg",
        hasSecurityRecord: true,
      }),
      {
        ok: false,
        reason:
          "security_record_exists",
      },
    );
  },
);

test(
  "unsupported profile extensions are rejected",
  () => {
    assert.deepEqual(
      classifyLegacyProfileMediaCandidate({
        userId: "user-1",
        profileImage:
          "/objects/uploads/shared/user-1/2026-01-01/photo.svg",
        hasSecurityRecord: false,
      }),
      {
        ok: false,
        reason:
          "unsupported_profile_extension",
      },
    );
  },
);

test(
  "backfill defaults to dry run",
  () => {
    assert.deepEqual(
      parseLegacyProfileMediaBackfillOptions(
        [],
        {},
      ),
      {
        execute: false,
        dryRun: true,
        limit: 1,
      },
    );
  },
);

test(
  "dry-run limit remains bounded",
  () => {
    assert.deepEqual(
      parseLegacyProfileMediaBackfillOptions(
        [
          "--dry-run",
          "--limit=10",
        ],
        {},
      ),
      {
        execute: false,
        dryRun: true,
        limit: 10,
      },
    );

    assert.throws(
      () =>
        parseLegacyProfileMediaBackfillOptions(
          ["--limit=11"],
          {},
        ),
      /LEGACY_PROFILE_MEDIA_INVALID_LIMIT/,
    );
  },
);

test(
  "execute requires confirmation and one-item limit",
  () => {
    assert.throws(
      () =>
        parseLegacyProfileMediaBackfillOptions(
          ["--execute"],
          {},
        ),
      /LEGACY_PROFILE_MEDIA_CONFIRMATION_REQUIRED/,
    );

    assert.throws(
      () =>
        parseLegacyProfileMediaBackfillOptions(
          [
            "--execute",
            "--limit=2",
          ],
          {
            LEGACY_PROFILE_MEDIA_BACKFILL_CONFIRM:
              LEGACY_PROFILE_MEDIA_BACKFILL_CONFIRMATION,
          },
        ),
      /LEGACY_PROFILE_MEDIA_EXECUTE_LIMIT_MUST_BE_ONE/,
    );

    assert.deepEqual(
      parseLegacyProfileMediaBackfillOptions(
        [
          "--execute",
          "--limit=1",
        ],
        {
          LEGACY_PROFILE_MEDIA_BACKFILL_CONFIRM:
            LEGACY_PROFILE_MEDIA_BACKFILL_CONFIRMATION,
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
      validateLegacyProfileMediaMetadata(
        "profile.jpg",
        31_884,
        "image/jpeg",
      ),
      {
        ok: true,
        size: 31_884,
        contentType:
          "image/jpeg",
      },
    );
  },
);

test(
  "invalid metadata is rejected",
  () => {
    const result =
      validateLegacyProfileMediaMetadata(
        "profile.jpg",
        0,
        "image/jpeg",
      );

    assert.equal(result.ok, false);
  },
);

test(
  "errors are reduced to non-PII codes",
  () => {
    assert.equal(
      safeLegacyBackfillErrorCode(
        new Error(
          "LEGACY_PROFILE_MEDIA_SOURCE_CHANGED",
        ),
      ),
      "LEGACY_PROFILE_MEDIA_SOURCE_CHANGED",
    );

    assert.equal(
      safeLegacyBackfillErrorCode(
        new Error(
          "unsafe path /objects/private/user-secret",
        ),
      ),
      "Error",
    );
  },
);
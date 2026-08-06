import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const runnerUrl =
  new URL(
    "../scripts/backfill-legacy-referenced-media.ts",
    import.meta.url,
  );

const source =
  readFileSync(
    runnerUrl,
    "utf8",
  );

test(
  "runner covers every audited legacy media source",
  () => {
    for (
      const requiredSource of [
        "public.bookings",
        "public.broadcast_requests",
        "public.commission_payments",
        "public.provider_documents",
        "public.support_tickets",
      ]
    ) {
      assert.match(
        source,
        new RegExp(
          requiredSource.replace(
            ".",
            "\\.",
          ),
        ),
      );
    }
  },
);

test(
  "runner excludes already authorized objects",
  () => {
    assert.match(
      source,
      /upload_security_records/,
    );

    assert.match(
      source,
      /security\.object_path\s+IS NULL/,
    );

    assert.match(
      source,
      /ON CONFLICT \(object_path\)\s+DO NOTHING/,
    );
  },
);

test(
  "execute mode uses locked quarantine and rescans source",
  () => {
    assert.match(
      source,
      /userQuarantineKey/,
    );

    assert.match(
      source,
      /userScanQuarantineKey/,
    );

    assert.match(
      source,
      /provider\.copyObject/,
    );

    assert.match(
      source,
      /scanStoredUpload/,
    );

    assert.match(
      source,
      /sourceConsistencyVerified/,
    );

    assert.match(
      source,
      /LEGACY_REFERENCED_MEDIA_SOURCE_CHANGED/,
    );
  },
);

test(
  "database insertion is serialized and revalidated",
  () => {
    assert.match(
      source,
      /BEGIN ISOLATION LEVEL SERIALIZABLE/,
    );

    assert.match(
      source,
      /pg_advisory_xact_lock/,
    );

    assert.match(
      source,
      /revalidateCandidate/,
    );

    assert.match(
      source,
      /INSERT INTO\s+public\.upload_security_records/,
    );
  },
);

test(
  "runner deletes temporary objects only",
  () => {
    assert.match(
      source,
      /provider\.deleteObject\(\s*temporaryPath/,
    );

    assert.doesNotMatch(
      source,
      /provider\.deleteObject\(\s*candidate\.objectPath/,
    );

    assert.doesNotMatch(
      source,
      /DELETE FROM\s+public\.(bookings|broadcast_requests|commission_payments|provider_documents|support_tickets)/,
    );
  },
);

test(
  "execute mode skips missing objects and writes at most one record",
  () => {
    assert.match(
      source,
      /const candidateScanLimit\s*=\s*options\.execute\s*\?\s*50\s*:\s*options\.limit/,
    );

    assert.match(
      source,
      /await\s+loadCandidates\(\s*candidateScanLimit\s*,?\s*\)/,
    );

    assert.match(
      source,
      /isMissingStorageError\(error\)[\s\S]*result\.missingCandidates \+= 1;[\s\S]*continue;/,
    );

    assert.match(
      source,
      /await executeOneBackfill\([\s\S]*?\);[\s\S]*?break;/,
    );

    assert.match(
      source,
      /options\.execute\s*&&\s*result\.recordsInserted !== 1/,
    );
  },
);
test(
  "runner output remains aggregate and uncertified",
  () => {
    assert.match(
      source,
      /piiDisplayed:\s*false/,
    );

    assert.match(
      source,
      /idsDisplayed:\s*false/,
    );

    assert.match(
      source,
      /referenceValuesDisplayed:\s*false/,
    );

    assert.match(
      source,
      /objectPathsDisplayed:\s*false/,
    );

    assert.match(
      source,
      /productionCertified:\s*false/,
    );

    assert.match(
      source,
      /recordsInserted/,
    );

    assert.match(
      source,
      /referencesAuthorized/,
    );
  },
);
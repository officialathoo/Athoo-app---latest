import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

import {
  LEGACY_REFERENCED_MEDIA_SOURCE_ROW_LOCKS,
  lockLegacyReferencedMediaSourceRows,
  type LegacyReferencedMediaQueryClient,
} from "../src/lib/legacyReferencedMediaConcurrency.ts";

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

const concurrencyUrl =
  new URL(
    "../src/lib/legacyReferencedMediaConcurrency.ts",
    import.meta.url,
  );

const concurrencySource =
  readFileSync(
    concurrencyUrl,
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
  "database insertion is serialized, source-locked, and revalidated",
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
      /lockLegacyReferencedMediaSourceRows/,
    );

    assert.match(
      source,
      /revalidateCandidate/,
    );

    assert.match(
      source,
      /INSERT INTO\s+public\.upload_security_records/,
    );

    assert.match(
      concurrencySource,
      /FOR UPDATE OF/,
    );

    assert.match(
      concurrencySource,
      /ORDER BY[\s\S]*\.ctid/,
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
type RecordedQuery = {
  text: string;
  values?: unknown[];
};

function createSourceLockMockClient(
  failAt: number | null = null,
): {
  client:
    LegacyReferencedMediaQueryClient;

  calls:
    RecordedQuery[];
} {
  const calls: RecordedQuery[] = [];

  const client:
    LegacyReferencedMediaQueryClient =
  {
    async query<
      Row = Record<string, unknown>
    >(
      text: string,
      values?: unknown[],
    ) {
      const callIndex = calls.length;

      calls.push({
        text,
        values,
      });

      if (callIndex === failAt) {
        throw new Error(
          `SOURCE_ROW_LOCK_FAILURE_${callIndex}`,
        );
      }

      return {
        rows: [] as Row[],
        rowCount: 1,
      };
    },

    release() {
      // Ownership remains with the transaction caller.
    },
  };

  return {
    client,
    calls,
  };
}

test(
  "source rows are locked behaviorally in deterministic order",
  async () => {
    const objectPath =
      "/objects/uploads/shared/user-1/2026-01-01/job.mp4";

    const {
      client,
      calls,
    } =
      createSourceLockMockClient();

    assert.equal(
      typeof client.query,
      "function",
    );

    const lockedRowCount =
      await lockLegacyReferencedMediaSourceRows(
        client,
        objectPath,
      );

    assert.equal(
      lockedRowCount,
      5,
    );

    assert.deepEqual(
      LEGACY_REFERENCED_MEDIA_SOURCE_ROW_LOCKS
        .map((sourceLock) =>
          sourceLock.source,
        ),
      [
        "bookings.video_url",
        "broadcast_requests.video_url",
        "commission_payments.screenshot_url",
        "provider_documents.url",
        "support_tickets.media_urls",
      ],
    );

    assert.equal(
      calls.length,
      5,
    );

    for (const call of calls) {
      const compactSql =
        call.text
          .replace(/\s+/g, " ")
          .trim();

      assert.match(
        compactSql,
        /^SELECT /,
      );

      assert.match(
        compactSql,
        / ORDER BY .*\.ctid FOR UPDATE OF /,
      );

      assert.deepEqual(
        call.values,
        [objectPath],
      );

      assert.equal(
        call.text.includes(objectPath),
        false,
      );

      /*
       * FOR UPDATE is a legitimate row-locking clause.
       * Reject only statements whose primary command
       * is a database write operation.
       */
      assert.doesNotMatch(
        compactSql,
        /^(INSERT|UPDATE|DELETE)\b/i,
      );
    }

    assert.match(
      calls[4].text,
      /jsonb_path_query/,
    );

    assert.match(
      calls[4].text,
      /FOR UPDATE OF\s+ticket/,
    );
  },
);

test(
  "source-row lock failure stops before later lock queries",
  async () => {
    const {
      client,
      calls,
    } =
      createSourceLockMockClient(2);

    await assert.rejects(
      () =>
        lockLegacyReferencedMediaSourceRows(
          client,
          "/objects/uploads/private/user-1/2026-01-01/file.jpg",
        ),
      /SOURCE_ROW_LOCK_FAILURE_2/,
    );

    assert.equal(
      calls.length,
      3,
    );
  },
);

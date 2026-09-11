import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

type QueryResult<Row> = {
  rows: Row[];
  rowCount: number | null;
};

type QueryClient = {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
  release(): void;
};

type QueryPool = {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
  connect(): Promise<QueryClient>;
  end(): Promise<void>;
};

type PgModule = {
  Pool: new (
    options: {
      connectionString: string;
      max: number;
      allowExitOnIdle: boolean;
    },
  ) => QueryPool;
};

const requireFromDatabaseWorkspace =
  createRequire(
    new URL(
      "../../lib/db/package.json",
      import.meta.url,
    ),
  );

const pg =
  requireFromDatabaseWorkspace(
    "pg",
  ) as PgModule;

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set.",
  );
}

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,
  max: 2,
  allowExitOnIdle: true,
});

import {
  getConfiguredStorageProvider,
  objectPathFromKey,
  type StorageProvider,
} from "../src/lib/storageProvider.ts";

import {
  scanStoredUpload,
  type UploadScanResult,
} from "../src/lib/uploadScanner.ts";

import {
  userQuarantineKey,
  userScanQuarantineKey,
} from "../src/lib/storageSecurity.ts";

import {
  classifyLegacyReferencedMediaCandidate,
  parseLegacyReferencedMediaBackfillOptions,
  safeLegacyReferencedMediaErrorCode,
  validateLegacyReferencedMediaMetadata,
  type ClassifiedLegacyReferencedMedia,
  type LegacyReferencedMediaScopePolicy,
} from "../src/lib/legacyReferencedMediaBackfill.ts";

import {
  lockLegacyReferencedMediaSourceRows,
} from "../src/lib/legacyReferencedMediaConcurrency.ts";

type CandidateRow = {
  object_path: string;
  owner_id: string;
  expected_scope_policy:
    LegacyReferencedMediaScopePolicy;
  reference_count: number | string;
  expected_owner_count: number | string;
  valid_path_reference_count: number | string;
  matching_owner_reference_count:
    number | string;
  matching_scope_reference_count:
    number | string;
};

type CandidateCountRow = {
  object_count: number | string;
  reference_count: number | string;
};

type InsertedRow = {
  object_path: string;
};

type CleanCandidate =
  Extract<
    ClassifiedLegacyReferencedMedia,
    { ok: true }
  >;

type InspectedObject = {
  size: number;
  contentType: string;
  scan: UploadScanResult;
};

const options =
  parseLegacyReferencedMediaBackfillOptions(
    process.argv.slice(2),
  );

const provider =
  getConfiguredStorageProvider();

const candidateScanLimit =
  options.execute
    ? 50
    : options.limit;

const result = {
  mode: options.execute
    ? "EXECUTE"
    : "DRY_RUN",
  limit: options.limit,
  candidateScanLimit,
  piiDisplayed: false,
  idsDisplayed: false,
  referenceValuesDisplayed: false,
  objectPathsDisplayed: false,
  candidateObjectsFound: 0,
  candidateReferencesFound: 0,
  candidatesEvaluated: 0,
  candidatesTruncated: false,
  eligibleCandidates: 0,
  cleanCandidates: 0,
  missingCandidates: 0,
  rejectedCandidates: 0,
  erroredCandidates: 0,
  recordsInserted: 0,
  referencesAuthorized: 0,
  temporaryObjectsCreated: 0,
  temporaryObjectsDeleted: 0,
  temporaryCleanupFailures: 0,
  scannerCounts:
    {} as Record<string, number>,
  detectedContentTypes:
    {} as Record<string, number>,
  rejectionReasons:
    {} as Record<string, number>,
  errorCodes:
    {} as Record<string, number>,
  lockedSnapshotUsed:
    options.execute,
  sourceConsistencyVerified: false,
  databaseChanged: false,
  storageReadPerformed: false,
  storageChanged: false,
  persistentStorageChanged: false,
  productionCertified: false,
};

const LEGACY_REFERENCED_MEDIA_CTE = `
  WITH raw_references AS (
    SELECT
      'bookings.video_url'::text AS source,
      'SHARED_ONLY'::text
        AS expected_scope_policy,
      customer_id::text
        AS expected_owner_id,
      BTRIM(video_url)
        AS reference_value
    FROM public.bookings
    WHERE NULLIF(
      BTRIM(video_url),
      ''
    ) IS NOT NULL

    UNION ALL

    SELECT
      'broadcast_requests.video_url',
      'SHARED_ONLY',
      customer_id::text,
      BTRIM(video_url)
    FROM public.broadcast_requests
    WHERE NULLIF(
      BTRIM(video_url),
      ''
    ) IS NOT NULL

    UNION ALL

    SELECT
      'commission_payments.screenshot_url',
      'PRIVATE_ONLY',
      provider_id::text,
      BTRIM(screenshot_url)
    FROM public.commission_payments
    WHERE NULLIF(
      BTRIM(screenshot_url),
      ''
    ) IS NOT NULL

    UNION ALL

    SELECT
      'provider_documents.url',
      'PRIVATE_ONLY',
      provider_id::text,
      BTRIM(url)
    FROM public.provider_documents
    WHERE NULLIF(
      BTRIM(url),
      ''
    ) IS NOT NULL

    UNION ALL

    SELECT
      'support_tickets.media_urls',
      'PRIVATE_OR_SHARED',
      user_id::text,
      BTRIM(
        extracted.value #>> '{}'
      )
    FROM public.support_tickets
    CROSS JOIN LATERAL jsonb_path_query(
      COALESCE(
        media_urls,
        'null'::jsonb
      ),
      '$.** ? (@.type() == "string")'
    ) AS extracted(value)
    WHERE NULLIF(
      BTRIM(
        extracted.value #>> '{}'
      ),
      ''
    ) IS NOT NULL
  ),
  normalized AS (
    SELECT
      source,
      expected_scope_policy,
      expected_owner_id,
      CASE
        WHEN reference_value
          LIKE '/objects/%'
          THEN reference_value
        WHEN reference_value
          LIKE 'objects/%'
          THEN '/' || reference_value
        WHEN reference_value
          LIKE 'uploads/%'
          THEN '/objects/' ||
            reference_value
        ELSE NULL
      END AS object_path
    FROM raw_references
  ),
  missing_security AS (
    SELECT
      normalized.*
    FROM normalized
    LEFT JOIN
      public.upload_security_records
        AS security
      ON security.object_path =
        normalized.object_path
    WHERE
      normalized.object_path
        IS NOT NULL
      AND security.object_path
        IS NULL
  ),
  parsed AS (
    SELECT
      source,
      expected_scope_policy,
      expected_owner_id,
      object_path,
      regexp_match(
        object_path,
        '^/objects/uploads/(private|shared)/([^/]+)/'
      ) AS path_parts
    FROM missing_security
  ),
  object_candidates AS (
    SELECT
      object_path,

      MIN(expected_owner_id)
        AS owner_id,

      COUNT(*)::integer
        AS reference_count,

      COUNT(
        DISTINCT expected_owner_id
      )::integer
        AS expected_owner_count,

      COUNT(*) FILTER (
        WHERE path_parts IS NOT NULL
      )::integer
        AS valid_path_reference_count,

      COUNT(*) FILTER (
        WHERE path_parts IS NOT NULL
          AND path_parts[2] =
            expected_owner_id
      )::integer
        AS matching_owner_reference_count,

      COUNT(*) FILTER (
        WHERE path_parts IS NOT NULL
          AND (
            (
              expected_scope_policy =
                'PRIVATE_ONLY'
              AND path_parts[1] =
                'private'
            )
            OR (
              expected_scope_policy =
                'SHARED_ONLY'
              AND path_parts[1] =
                'shared'
            )
            OR (
              expected_scope_policy =
                'PRIVATE_OR_SHARED'
              AND path_parts[1] IN (
                'private',
                'shared'
              )
            )
          )
      )::integer
        AS matching_scope_reference_count,

      CASE
        WHEN MIN(
          CASE
            WHEN path_parts IS NULL
              THEN NULL
            ELSE path_parts[1]
          END
        ) = 'private'
          THEN 'PRIVATE_ONLY'
        ELSE 'SHARED_ONLY'
      END::text
        AS expected_scope_policy
    FROM parsed
    GROUP BY object_path
  )
`;

function increment(
  target: Record<string, number>,
  key: string,
): void {
  target[key] =
    Number(target[key] || 0) + 1;
}

function rejectCandidate(
  reason: string,
): void {
  result.rejectedCandidates += 1;

  increment(
    result.rejectionReasons,
    reason || "unknown_rejection",
  );
}

function recordError(
  error: unknown,
): void {
  result.erroredCandidates += 1;

  increment(
    result.errorCodes,
    safeLegacyReferencedMediaErrorCode(
      error,
    ),
  );
}

function isMissingStorageError(
  error: unknown,
): boolean {
  const candidate =
    error as {
      name?: unknown;
      $metadata?: {
        httpStatusCode?: unknown;
      };
    };

  const name =
    String(candidate?.name || "");

  const status =
    Number(
      candidate?.$metadata
        ?.httpStatusCode || 0,
    );

  return (
    status === 404 ||
    name === "NoSuchKey" ||
    name === "NotFound"
  );
}

function numeric(
  value: unknown,
): number {
  return Number(value || 0);
}

function candidateFromRow(
  row: CandidateRow,
):
  | {
      ok: true;
      candidate: CleanCandidate;
    }
  | {
      ok: false;
      reason: string;
    } {
  const referenceCount =
    numeric(row.reference_count);

  if (
    numeric(row.expected_owner_count) !==
      1
  ) {
    return {
      ok: false,
      reason:
        "conflicting_expected_owners",
    };
  }

  if (
    numeric(
      row.valid_path_reference_count,
    ) !== referenceCount
  ) {
    return {
      ok: false,
      reason: "invalid_upload_path",
    };
  }

  if (
    numeric(
      row.matching_owner_reference_count,
    ) !== referenceCount
  ) {
    return {
      ok: false,
      reason: "owner_path_mismatch",
    };
  }

  if (
    numeric(
      row.matching_scope_reference_count,
    ) !== referenceCount
  ) {
    return {
      ok: false,
      reason: "scope_policy_mismatch",
    };
  }

  const classified =
    classifyLegacyReferencedMediaCandidate({
      ownerId: row.owner_id,
      objectPath: row.object_path,
      expectedScopePolicy:
        row.expected_scope_policy,
      hasSecurityRecord: false,
      referenceCount,
    });

  if (!classified.ok) {
    return classified;
  }

  return {
    ok: true,
    candidate: classified,
  };
}

async function loadCandidateCounts():
Promise<{
  objects: number;
  references: number;
}> {
  const countResult =
    await pool.query<CandidateCountRow>(
      `
        ${LEGACY_REFERENCED_MEDIA_CTE}

        SELECT
          COUNT(*)::integer
            AS object_count,

          COALESCE(
            SUM(reference_count),
            0
          )::integer
            AS reference_count
        FROM object_candidates
      `,
    );

  return {
    objects:
      numeric(
        countResult.rows[0]
          ?.object_count,
      ),
    references:
      numeric(
        countResult.rows[0]
          ?.reference_count,
      ),
  };
}

async function loadCandidates(
  limit: number,
): Promise<CandidateRow[]> {
  const candidates =
    await pool.query<CandidateRow>(
      `
        ${LEGACY_REFERENCED_MEDIA_CTE}

        SELECT
          object_path,
          owner_id,
          expected_scope_policy,
          reference_count,
          expected_owner_count,
          valid_path_reference_count,
          matching_owner_reference_count,
          matching_scope_reference_count
        FROM object_candidates
        ORDER BY object_path
        LIMIT $1
      `,
      [limit],
    );

  return candidates.rows;
}

async function inspectStoredObject(
  storage: StorageProvider,
  objectPath: string,
  originalName: string,
): Promise<InspectedObject> {
  const metadata =
    await storage.statObject(
      objectPath,
    );

  result.storageReadPerformed = true;

  const validated =
    validateLegacyReferencedMediaMetadata(
      originalName,
      metadata.contentLength,
      metadata.contentType,
    );

  if (!validated.ok) {
    throw new Error(
      "LEGACY_REFERENCED_MEDIA_POLICY_REJECTED",
    );
  }

  const object =
    await storage.getObject(
      objectPath,
    );

  result.storageReadPerformed = true;

  const scan =
    await scanStoredUpload({
      object,
      declaredContentType:
        validated.contentType,
      expectedSize:
        validated.size,
      maxBytes:
        validated.size,
    });

  return {
    size: validated.size,
    contentType:
      validated.contentType,
    scan,
  };
}

function scansMatch(
  first: InspectedObject,
  second: InspectedObject,
): boolean {
  return (
    first.size === second.size &&
    first.contentType ===
      second.contentType &&
    first.scan.size ===
      second.scan.size &&
    first.scan.sha256 ===
      second.scan.sha256 &&
    first.scan.detectedContentType ===
      second.scan.detectedContentType
  );
}

async function revalidateCandidate(
  client: QueryClient,
  candidate: CleanCandidate,
): Promise<void> {
  await client.query(
    `
      SELECT
        pg_advisory_xact_lock(
          hashtextextended($1, 0)
        )
    `,
    [candidate.objectPath],
  );

  await lockLegacyReferencedMediaSourceRows(
    client,
    candidate.objectPath,
  );

  const current =
    await client.query<CandidateRow>(
      `
        ${LEGACY_REFERENCED_MEDIA_CTE}

        SELECT
          object_path,
          owner_id,
          expected_scope_policy,
          reference_count,
          expected_owner_count,
          valid_path_reference_count,
          matching_owner_reference_count,
          matching_scope_reference_count
        FROM object_candidates
        WHERE object_path = $1
      `,
      [candidate.objectPath],
    );

  if (current.rowCount !== 1) {
    throw new Error(
      "LEGACY_REFERENCED_MEDIA_SOURCE_CHANGED",
    );
  }

  const classified =
    candidateFromRow(
      current.rows[0],
    );

  if (
    !classified.ok ||
    classified.candidate.ownerId !==
      candidate.ownerId ||
    classified.candidate.objectPath !==
      candidate.objectPath ||
    classified.candidate.scope !==
      candidate.scope ||
    classified.candidate.referenceCount !==
      candidate.referenceCount
  ) {
    throw new Error(
      "LEGACY_REFERENCED_MEDIA_SOURCE_CHANGED",
    );
  }
}

async function executeOneBackfill(
  candidate: CleanCandidate,
  sourceBefore: InspectedObject,
): Promise<void> {
  const operationId =
    randomUUID();

  const operationDate =
    new Date();

  const quarantinePath =
    objectPathFromKey(
      userQuarantineKey(
        candidate.ownerId,
        candidate.originalName,
        operationId,
        operationDate,
      ),
    );

  const scanPath =
    objectPathFromKey(
      userScanQuarantineKey(
        candidate.ownerId,
        candidate.originalName,
        operationId,
        operationDate,
      ),
    );

  const temporaryPaths: string[] = [];

  try {
    await provider.copyObject(
      candidate.objectPath,
      {
        key: quarantinePath,
        contentType:
          sourceBefore.contentType,
        metadata: {
          "athoo-security-state":
            "legacy-referenced-media-incoming",
        },
      },
    );

    temporaryPaths.push(
      quarantinePath,
    );

    result.temporaryObjectsCreated += 1;
    result.storageChanged = true;

    const quarantineMetadata =
      await provider.statObject(
        quarantinePath,
      );

    result.storageReadPerformed = true;

    if (
      quarantineMetadata.contentLength !==
        sourceBefore.size ||
      String(
        quarantineMetadata.contentType ||
        "",
      )
        .trim()
        .toLowerCase() !==
        sourceBefore.contentType
    ) {
      throw new Error(
        "LEGACY_REFERENCED_MEDIA_QUARANTINE_MISMATCH",
      );
    }

    await provider.copyObject(
      quarantinePath,
      {
        key: scanPath,
        contentType:
          sourceBefore.contentType,
        metadata: {
          "athoo-security-state":
            "locked-quarantine",
        },
      },
    );

    temporaryPaths.push(
      scanPath,
    );

    result.temporaryObjectsCreated += 1;

    const lockedObject =
      await inspectStoredObject(
        provider,
        scanPath,
        candidate.originalName,
      );

    increment(
      result.scannerCounts,
      lockedObject.scan.scanner,
    );

    increment(
      result.detectedContentTypes,
      lockedObject.scan
        .detectedContentType ||
        "unknown",
    );

    if (!lockedObject.scan.clean) {
      throw new Error(
        `LEGACY_REFERENCED_MEDIA_SECURITY_REJECTED:${
          lockedObject.scan.reason ||
          "unknown"
        }`,
      );
    }

    const sourceAfter =
      await inspectStoredObject(
        provider,
        candidate.objectPath,
        candidate.originalName,
      );

    if (
      !sourceAfter.scan.clean ||
      !scansMatch(
        lockedObject,
        sourceAfter,
      ) ||
      !scansMatch(
        sourceBefore,
        sourceAfter,
      )
    ) {
      throw new Error(
        "LEGACY_REFERENCED_MEDIA_SOURCE_CHANGED",
      );
    }

    result.sourceConsistencyVerified =
      true;

    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN ISOLATION LEVEL SERIALIZABLE",
      );

      await revalidateCandidate(
        client,
        candidate,
      );

      const inserted =
        await client.query<InsertedRow>(
          `
            INSERT INTO
              public.upload_security_records (
                object_path,
                quarantine_path,
                scan_path,
                owner_id,
                scope,
                original_name,
                declared_content_type,
                detected_content_type,
                declared_size,
                actual_size,
                sha256,
                scan_status,
                scanner,
                rejection_reason,
                scan_started_at,
                scanned_at,
                expires_at
              )
            SELECT
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9,
              $10,
              $11,
              'clean',
              $12,
              NULL,
              NOW(),
              NOW(),
              NOW() + INTERVAL '1 hour'
            WHERE NOT EXISTS (
              SELECT 1
              FROM
                public.upload_security_records
                  AS record
              WHERE
                record.object_path = $1
            )
            ON CONFLICT (object_path)
            DO NOTHING
            RETURNING object_path
          `,
          [
            candidate.objectPath,
            quarantinePath,
            scanPath,
            candidate.ownerId,
            candidate.scope,
            candidate.originalName,
            sourceBefore.contentType,
            lockedObject.scan
              .detectedContentType,
            sourceBefore.size,
            lockedObject.scan.size,
            lockedObject.scan.sha256,
            lockedObject.scan.scanner,
          ],
        );

      if (inserted.rowCount !== 1) {
        throw new Error(
          "LEGACY_REFERENCED_MEDIA_INSERT_CONFLICT",
        );
      }

      await client.query("COMMIT");

      result.recordsInserted += 1;

      result.referencesAuthorized +=
        candidate.referenceCount;

      result.databaseChanged = true;
    }
    catch (error) {
      await client
        .query("ROLLBACK")
        .catch(() => undefined);

      throw error;
    }
    finally {
      client.release();
    }
  }
  finally {
    for (
      const temporaryPath of
        temporaryPaths.reverse()
    ) {
      try {
        await provider.deleteObject(
          temporaryPath,
        );

        result.temporaryObjectsDeleted += 1;
      }
      catch {
        result.temporaryCleanupFailures += 1;
      }
    }

    result.persistentStorageChanged =
      result.temporaryCleanupFailures > 0;
  }
}

try {
  const counts =
    await loadCandidateCounts();

  result.candidateObjectsFound =
    counts.objects;

  result.candidateReferencesFound =
    counts.references;

  result.candidatesTruncated =
    counts.objects > candidateScanLimit;

  const candidates =
    await loadCandidates(
      candidateScanLimit,
    );

  for (const row of candidates) {
    result.candidatesEvaluated += 1;

    const classified =
      candidateFromRow(row);

    if (!classified.ok) {
      rejectCandidate(
        classified.reason,
      );

      if (options.execute) {
        break;
      }

      continue;
    }

    result.eligibleCandidates += 1;

    try {
      const inspected =
        await inspectStoredObject(
          provider,
          classified.candidate.objectPath,
          classified.candidate.originalName,
        );

      increment(
        result.scannerCounts,
        inspected.scan.scanner,
      );

      increment(
        result.detectedContentTypes,
        inspected.scan
          .detectedContentType ||
          "unknown",
      );

      if (!inspected.scan.clean) {
        rejectCandidate(
          inspected.scan.reason ||
          "security_rejected",
        );

        if (options.execute) {
          break;
        }

        continue;
      }

      result.cleanCandidates += 1;

      if (options.execute) {
        await executeOneBackfill(
          classified.candidate,
          inspected,
        );

        break;
      }
    }
    catch (error) {
      if (
        isMissingStorageError(error)
      ) {
        result.missingCandidates += 1;

        increment(
          result.errorCodes,
          "NOT_FOUND",
        );

        continue;
      }

      recordError(error);

      if (options.execute) {
        break;
      }
    }
  }

  console.log(
    JSON.stringify(
      result,
      null,
      2,
    ),
  );

  if (
    result.rejectedCandidates > 0 ||
    result.erroredCandidates > 0 ||
    result.temporaryCleanupFailures > 0 ||
    (
      options.execute &&
      result.recordsInserted !== 1
    )
  ) {
    process.exitCode = 2;
  }
}
finally {
  await pool.end();
}
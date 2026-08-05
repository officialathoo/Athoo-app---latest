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
    "DATABASE_URL must be set. Did you forget to provision a database?",
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
  classifyLegacyProfileMediaCandidate,
  parseLegacyProfileMediaBackfillOptions,
  safeLegacyBackfillErrorCode,
  validateLegacyProfileMediaMetadata,
  type ClassifiedLegacyProfileMedia,
} from "../src/lib/legacyProfileMediaBackfill.ts";

type LegacyCandidateRow = {
  user_id: string;
  profile_image: string;
};

type CountRow = {
  candidate_count: number | string;
};

type InsertedRow = {
  object_path: string;
};

type CleanCandidate =
  Extract<
    ClassifiedLegacyProfileMedia,
    { ok: true }
  >;

type InspectedObject = {
  size: number;
  contentType: string;
  scan: UploadScanResult;
};

const options =
  parseLegacyProfileMediaBackfillOptions(
    process.argv.slice(2),
  );

const provider =
  getConfiguredStorageProvider();

const result = {
  mode: options.execute
    ? "EXECUTE"
    : "DRY_RUN",
  limit: options.limit,
  piiDisplayed: false,
  objectPathsDisplayed: false,
  candidatesFound: 0,
  candidatesEvaluated: 0,
  candidatesTruncated: false,
  eligibleCandidates: 0,
  cleanCandidates: 0,
  rejectedCandidates: 0,
  erroredCandidates: 0,
  recordsInserted: 0,
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
  sourceConsistencyVerified:
    false,
  databaseChanged: false,
  storageChanged: false,
  persistentStorageChanged: false,
  productionCertified: false,
};

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
    safeLegacyBackfillErrorCode(error),
  );
}

async function inspectStoredObject(
  storage: StorageProvider,
  objectPath: string,
  originalName: string,
): Promise<InspectedObject> {
  const metadata =
    await storage.statObject(objectPath);

  const validated =
    validateLegacyProfileMediaMetadata(
      originalName,
      metadata.contentLength,
      metadata.contentType,
    );

  if (!validated.ok) {
    throw new Error(
      "LEGACY_PROFILE_MEDIA_POLICY_REJECTED",
    );
  }

  const object =
    await storage.getObject(objectPath);

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
        candidate.userId,
        candidate.originalName,
        operationId,
        operationDate,
      ),
    );

  const scanPath =
    objectPathFromKey(
      userScanQuarantineKey(
        candidate.userId,
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
            "legacy-backfill-incoming",
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

    if (
      quarantineMetadata.contentLength !==
        sourceBefore.size ||
      String(
        quarantineMetadata.contentType || "",
      )
        .trim()
        .toLowerCase() !==
        sourceBefore.contentType
    ) {
      throw new Error(
        "LEGACY_PROFILE_MEDIA_QUARANTINE_MISMATCH",
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

    if (!lockedObject.scan.clean) {
      throw new Error(
        `LEGACY_PROFILE_MEDIA_SECURITY_REJECTED:${
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
        "LEGACY_PROFILE_MEDIA_SOURCE_CHANGED",
      );
    }

    result.sourceConsistencyVerified =
      true;

    const client =
      await pool.connect();

    try {
      await client.query("BEGIN");

      const userLock =
        await client.query(
          `
            SELECT users.id
            FROM public.users users
            WHERE
              users.id = $1
              AND BTRIM(
                users.profile_image
              ) = $2
            FOR UPDATE
          `,
          [
            candidate.userId,
            candidate.objectPath,
          ],
        );

      if (userLock.rowCount !== 1) {
        throw new Error(
          "LEGACY_PROFILE_MEDIA_SOURCE_CHANGED",
        );
      }

      const inserted =
        await client.query<InsertedRow>(
          `
            INSERT INTO public.upload_security_records (
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
              FROM public.upload_security_records record
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
            candidate.userId,
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
          "LEGACY_PROFILE_MEDIA_INSERT_CONFLICT",
        );
      }

      await client.query("COMMIT");

      result.recordsInserted += 1;
      result.databaseChanged = true;

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
  }
}

try {
  const countResult =
    await pool.query<CountRow>(`
      SELECT
        COUNT(*)::integer
          AS candidate_count
      FROM public.users users
      WHERE
        NULLIF(
          BTRIM(users.profile_image),
          ''
        ) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.upload_security_records record
          WHERE
            record.object_path =
              BTRIM(users.profile_image)
        )
    `);

  result.candidatesFound =
    Number(
      countResult.rows[0]
        ?.candidate_count || 0,
    );

  result.candidatesTruncated =
    result.candidatesFound >
    options.limit;

  const candidates =
    await pool.query<LegacyCandidateRow>(
      `
        SELECT
          users.id::text AS user_id,
          BTRIM(users.profile_image)
            AS profile_image
        FROM public.users users
        WHERE
          NULLIF(
            BTRIM(users.profile_image),
            ''
          ) IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.upload_security_records record
            WHERE
              record.object_path =
                BTRIM(users.profile_image)
          )
        ORDER BY users.id
        LIMIT $1
      `,
      [options.limit],
    );

  for (const row of candidates.rows) {
    result.candidatesEvaluated += 1;

    const classified =
      classifyLegacyProfileMediaCandidate({
        userId:
          row.user_id,
        profileImage:
          row.profile_image,
        hasSecurityRecord:
          false,
      });

    if (!classified.ok) {
      rejectCandidate(
        classified.reason,
      );

      continue;
    }

    result.eligibleCandidates += 1;

    try {
      const inspected =
        await inspectStoredObject(
          provider,
          classified.objectPath,
          classified.originalName,
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

        continue;
      }

      result.cleanCandidates += 1;

      if (options.execute) {
        await executeOneBackfill(
          classified,
          inspected,
        );
      }
    }
    catch (error) {
      recordError(error);
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
    result.temporaryCleanupFailures > 0
  ) {
    process.exitCode = 2;
  }
}
finally {
  await pool.end();
}
import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  databaseName,
  run,
  safeDatabaseName,
  verifyBackupSet,
  withDatabase,
} from "./db-common.mjs";

/**
 * Return the first configured, non-empty environment variable.
 *
 * @param {string[]} names
 * @returns {{ name: string, value: string } | null}
 */
function firstConfiguredEnvironmentVariable(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return {
        name,
        value,
      };
    }
  }

  return null;
}

/**
 * Validate a PostgreSQL connection URL.
 *
 * @param {string} value
 * @param {string} variableName
 * @returns {URL}
 */
function parsePostgresUrl(value, variableName) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} is not a valid database URL`);
  }

  if (
    parsed.protocol !== "postgres:" &&
    parsed.protocol !== "postgresql:"
  ) {
    throw new Error(
      `${variableName} must use the postgres:// or postgresql:// protocol`,
    );
  }

  if (!parsed.hostname) {
    throw new Error(
      `${variableName} does not contain a database hostname`,
    );
  }

  return parsed;
}

/**
 * Build a PostgreSQL CLI-safe database URL.
 *
 * PostgreSQL CLI tools on Windows may fail when sslmode=verify-full is used
 * without a local root.crt file. Neon supports encrypted TLS connections with
 * sslmode=require and SCRAM channel binding.
 *
 * This normalized URL is used only by PostgreSQL command-line tools.
 *
 * @param {string} value
 * @returns {string}
 */
function buildCliDatabaseUrl(value) {
  const parsed = new URL(value);

  parsed.searchParams.delete("sslrootcert");
  parsed.searchParams.delete("sslcert");
  parsed.searchParams.delete("sslkey");
  parsed.searchParams.delete("sslcrl");
  parsed.searchParams.delete("sslcrldir");

  parsed.searchParams.set("sslmode", "require");
  parsed.searchParams.set("channel_binding", "require");

  return parsed.toString();
}

/**
 * Print visible progress information.
 *
 * @param {string} message
 */
function progress(message) {
  console.log(`[db-rehearsal] ${message}`);
}

/**
 * Normalize a schema-only pg_dump so PostgreSQL 18's random restrict token
 * and informational comments do not create false fingerprint differences.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeSchemaDump(value) {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("\\restrict ") &&
        !line.startsWith("\\unrestrict ") &&
        !line.startsWith("--"),
    )
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/**
 * Split a normalized pg_dump into deterministic SQL statement blocks.
 * The blocks let a failed fingerprint comparison report the exact structural
 * differences without exposing table data or database credentials.
 *
 * @param {string} normalized
 * @returns {string[]}
 */
function schemaBlocks(normalized) {
  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/**
 * Build a deterministic schema snapshot.
 * Ownership, privileges, comments and security labels are excluded because
 * the rehearsal compares structural migration convergence, not deployment
 * role metadata.
 *
 * @param {string} cliUrl
 * @returns {Promise<{ fingerprint: string, blocks: string[] }>}
 */
async function schemaSnapshot(cliUrl) {
  const result = await run(
    "pg_dump",
    [
      cliUrl,
      "--schema-only",
      "--no-owner",
      "--no-privileges",
      "--no-comments",
      "--no-security-labels",
    ],
    {
      capture: true,
    },
  );

  const normalized = normalizeSchemaDump(
    result.stdout,
  );

  if (!normalized) {
    throw new Error(
      "Schema fingerprint dump was empty",
    );
  }

  return {
    fingerprint: createHash("sha256")
      .update(normalized)
      .digest("hex"),
    blocks: schemaBlocks(normalized),
    normalized,
  };
}

/**
 * Return a bounded multiset difference between two schema snapshots.
 * Repeated blocks are counted correctly and output is truncated so logs stay
 * readable while retaining enough SQL to identify the migration drift.
 *
 * @param {string[]} left
 * @param {string[]} right
 * @returns {string[]}
 */
function schemaBlockDifference(left, right) {
  const remaining = new Map();

  for (const block of right) {
    remaining.set(
      block,
      (remaining.get(block) || 0) + 1,
    );
  }

  const difference = [];

  for (const block of left) {
    const count = remaining.get(block) || 0;

    if (count > 0) {
      remaining.set(block, count - 1);
      continue;
    }

    difference.push(
      block.length > 3000
        ? `${block.slice(0, 3000)}\n... [truncated]`
        : block,
    );
  }

  return difference;
}

/**
 * Produce a secret-safe, bounded diagnostic summary.
 *
 * @param {{ fingerprint: string, blocks: string[] }} restored
 * @param {{ fingerprint: string, blocks: string[] }} fresh
 */
function schemaDifferenceSummary(restored, fresh) {
  const restoredOnly = schemaBlockDifference(
    restored.blocks,
    fresh.blocks,
  );

  const freshOnly = schemaBlockDifference(
    fresh.blocks,
    restored.blocks,
  );

  return {
    restoredFingerprint: restored.fingerprint,
    freshFingerprint: fresh.fingerprint,
    restoredBlockCount: restored.blocks.length,
    freshBlockCount: fresh.blocks.length,
    restoredOnlyCount: restoredOnly.length,
    freshOnlyCount: freshOnly.length,
    restoredOnly,
    freshOnly,
    outputTruncated: false,
  };
}

const sourceSelection =
  firstConfiguredEnvironmentVariable([
    "DATABASE_URL",
  ]);

if (!sourceSelection) {
  throw new Error("DATABASE_URL is required");
}

const adminSelection =
  firstConfiguredEnvironmentVariable([
    "DB_ADMIN_URL",
    "DATABASE_DIRECT_URL",
    "DIRECT_DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "UNPOOLED_DATABASE_URL",
    "POSTGRES_URL_NON_POOLING",
  ]);

if (!adminSelection) {
  throw new Error(
    [
      "A direct database administration URL is required.",
      "Configure DB_ADMIN_URL or DATABASE_DIRECT_URL using a direct",
      "non-pooler PostgreSQL connection that can create and drop databases.",
    ].join(" "),
  );
}

const sourceUrl = sourceSelection.value;
const adminUrl = adminSelection.value;

parsePostgresUrl(
  sourceUrl,
  sourceSelection.name,
);

const adminParsed = parsePostgresUrl(
  adminUrl,
  adminSelection.name,
);

if (/pooler/i.test(adminParsed.hostname)) {
  throw new Error(
    `${adminSelection.name} points to a pooled database host. ` +
    "Database restore rehearsals require a direct non-pooler URL.",
  );
}

if (
  process.env.NODE_ENV === "production" &&
  process.env.ALLOW_PRODUCTION_REHEARSAL !== "true"
) {
  throw new Error(
    "Refusing to run a temporary database rehearsal in " +
    "NODE_ENV=production without ALLOW_PRODUCTION_REHEARSAL=true",
  );
}

/*
 * Node-based database scripts keep the original database URLs.
 * PostgreSQL CLI commands receive normalized TLS-safe URLs.
 */
const sourceCliUrl = buildCliDatabaseUrl(sourceUrl);
const adminCliUrl = buildCliDatabaseUrl(adminUrl);

const temporaryDir = path.resolve(
  process.env.DB_REHEARSAL_DIR ||
  ".athoo-db-rehearsal",
);

await mkdir(temporaryDir, {
  recursive: true,
  mode: 0o700,
});

const rehearsalDb = safeDatabaseName(
  "athoo_restore_rehearsal",
);

const migrationDb = safeDatabaseName(
  "athoo_migration_rehearsal",
);

const rehearsalUrl = withDatabase(
  adminUrl,
  rehearsalDb,
);

const migrationUrl = withDatabase(
  adminUrl,
  migrationDb,
);

const rehearsalCliUrl = buildCliDatabaseUrl(
  rehearsalUrl,
);

const migrationCliUrl = buildCliDatabaseUrl(
  migrationUrl,
);

const pnpm =
  process.platform === "win32"
    ? "pnpm.cmd"
    : "pnpm";

let backupFile = process.argv[2]
  ? path.resolve(process.argv[2])
  : null;

let createdBackup = false;
let rehearsalDatabaseCreated = false;
let migrationDatabaseCreated = false;
let completedSuccessfully = false;

try {
  progress(
    `Source database: ${databaseName(sourceUrl)}`,
  );

  progress(
    `Administration URL: ${adminSelection.name}`,
  );

  progress(
    `Direct host: ${adminParsed.hostname}`,
  );

  progress(
    "PostgreSQL CLI security: " +
    "sslmode=require, channel_binding=require",
  );

  progress(
    "Production database will not be overwritten",
  );

  /*
   * Create a temporary backup when no backup file was supplied.
   */
  if (!backupFile) {
    progress(
      "No backup path supplied; creating a temporary verified backup",
    );

    const filesBeforeBackup = new Set(
      await readdir(temporaryDir),
    );

    await run(
      process.execPath,
      [
        path.resolve(
          "scripts/tools/db-backup.mjs",
        ),
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: sourceUrl,
          DB_BACKUP_DIR: temporaryDir,
          DB_BACKUP_RETENTION_DAYS: "0",
        },
      },
    );

    const filesAfterBackup =
      await readdir(temporaryDir);

    const createdDumpFiles =
      filesAfterBackup
        .filter(
          (name) =>
            name.endsWith(".dump") &&
            !filesBeforeBackup.has(name),
        )
        .sort();

    const createdDump =
      createdDumpFiles.at(-1);

    if (!createdDump) {
      throw new Error(
        "Backup rehearsal did not create a dump file",
      );
    }

    backupFile = path.join(
      temporaryDir,
      createdDump,
    );

    createdBackup = true;
  } else {
    progress(
      `Using supplied backup: ${backupFile}`,
    );
  }

  /*
   * Validate the dump, checksum and manifest before restoration.
   */
  progress(
    "Verifying backup checksum and manifest",
  );

  await verifyBackupSet(backupFile);

  /*
   * Restore rehearsal.
   */
  progress(
    `Creating restore rehearsal database: ${rehearsalDb}`,
  );

  await run(
    "createdb",
    [
      `--maintenance-db=${adminCliUrl}`,
      rehearsalDb,
    ],
  );

  rehearsalDatabaseCreated = true;

  progress(
    "Restoring backup into temporary restore rehearsal database",
  );

  await run(
    process.execPath,
    [
      path.resolve(
        "scripts/tools/db-restore.mjs",
      ),
      backupFile,
      `--confirm-database=${rehearsalDb}`,
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: sourceUrl,
        RESTORE_DATABASE_URL:
          rehearsalCliUrl,
      },
    },
  );


  progress(
    "Reading latest migration from production source database",
  );

  const sourceLatestResult = await run(
    "psql",
    [
      sourceCliUrl,
      "--tuples-only",
      "--no-align",
      "--set",
      "ON_ERROR_STOP=1",
      "--command",
      "SELECT migration_id " +
      "FROM public.athoo_schema_migrations " +
      "ORDER BY migration_id DESC " +
      "LIMIT 1",
    ],
    {
      capture: true,
    },
  );

  const sourceLatest =
    sourceLatestResult.stdout.trim();

  if (!sourceLatest) {
    throw new Error(
      "The production source database did not return a latest migration ID",
    );
  }

  progress(
    "Reading latest migration from restored rehearsal database",
  );

  const restoredLatestResult = await run(
    "psql",
    [
      rehearsalCliUrl,
      "--tuples-only",
      "--no-align",
      "--set",
      "ON_ERROR_STOP=1",
      "--command",
      "SELECT migration_id " +
      "FROM public.athoo_schema_migrations " +
      "ORDER BY migration_id DESC " +
      "LIMIT 1",
    ],
    {
      capture: true,
    },
  );

  const restoredLatest =
    restoredLatestResult.stdout.trim();

  if (
    sourceLatest !== restoredLatest
  ) {
    throw new Error(
      "Migration mismatch after restore: " +
      `source=${sourceLatest}, ` +
      `restored=${restoredLatest}`,
    );
  }

  progress(
    `Restore migration comparison passed: ${sourceLatest}`,
  );

  /*
   * Apply the repository's pending migrations to the restored production copy.
   * This proves the real upgrade path before production is changed.
   */
  progress(
    "Applying pending migrations to restored rehearsal database",
  );

  await run(
    pnpm,
    [
      "--filter",
      "@workspace/scripts",
      "db:migrate",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: rehearsalUrl,
      },
    },
  );

  progress(
    "Verifying migrated restored database",
  );

  await run(
    pnpm,
    [
      "--filter",
      "@workspace/scripts",
      "db:verify",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: rehearsalUrl,
      },
    },
  );

  progress(
    "Running migrated restored database integrity checks",
  );

  await run(
    pnpm,
    [
      "--filter",
      "@workspace/scripts",
      "db:integrity",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: rehearsalUrl,
      },
    },
  );

  progress(
    "Reading latest migration from upgraded restored database",
  );

  const restoredMigratedLatestResult = await run(
    "psql",
    [
      rehearsalCliUrl,
      "--tuples-only",
      "--no-align",
      "--set",
      "ON_ERROR_STOP=1",
      "--command",
      "SELECT migration_id " +
      "FROM public.athoo_schema_migrations " +
      "ORDER BY migration_id DESC " +
      "LIMIT 1",
    ],
    {
      capture: true,
    },
  );

  const restoredMigratedLatest =
    restoredMigratedLatestResult.stdout.trim();

  if (!restoredMigratedLatest) {
    throw new Error(
      "The upgraded restored database did not return a latest migration ID",
    );
  }

  progress(
    `Restored production upgrade passed: ${sourceLatest} -> ${restoredMigratedLatest}`,
  );

  /*
   * Fresh migration rehearsal.
   */
  progress(
    `Creating fresh migration database: ${migrationDb}`,
  );

  await run(
    "createdb",
    [
      `--maintenance-db=${adminCliUrl}`,
      migrationDb,
    ],
  );

  migrationDatabaseCreated = true;

  progress(
    "Applying all migrations to fresh temporary database",
  );

  await run(
    pnpm,
    [
      "--filter",
      "@workspace/scripts",
      "db:migrate",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: migrationUrl,
      },
    },
  );

  progress(
    "Verifying fresh migration database",
  );

  await run(
    pnpm,
    [
      "--filter",
      "@workspace/scripts",
      "db:verify",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: migrationUrl,
      },
    },
  );

  progress(
    "Running fresh migration database integrity checks",
  );

  await run(
    pnpm,
    [
      "--filter",
      "@workspace/scripts",
      "db:integrity",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: migrationUrl,
      },
    },
  );

  progress(
    "Comparing normalized restored and fresh schema fingerprints",
  );

  const [
    restoredSchemaSnapshot,
    freshSchemaSnapshot,
  ] = await Promise.all([
    schemaSnapshot(rehearsalCliUrl),
    schemaSnapshot(migrationCliUrl),
  ]);

  const restoredSchemaFingerprint =
    restoredSchemaSnapshot.fingerprint;

  const freshSchemaFingerprint =
    freshSchemaSnapshot.fingerprint;

  if (
    restoredSchemaFingerprint !==
    freshSchemaFingerprint
  ) {
    console.error(
      "[db-rehearsal] SCHEMA DIFFERENCE SUMMARY",
    );
    const schemaDifference = schemaDifferenceSummary(
      restoredSchemaSnapshot,
      freshSchemaSnapshot,
    );

    console.error(
      JSON.stringify(
        schemaDifference,
        null,
        2,
      ),
    );

    const schemaArtifactDirectory = path.join(
      temporaryDir,
      "schema-artifacts",
    );

    await rm(
      schemaArtifactDirectory,
      {
        recursive: true,
        force: true,
      },
    );

    await mkdir(
      schemaArtifactDirectory,
      {
        recursive: true,
        mode: 0o700,
      },
    );

    const restoredSchemaArtifact = path.join(
      schemaArtifactDirectory,
      "restored-upgrade-schema.sql",
    );

    const freshSchemaArtifact = path.join(
      schemaArtifactDirectory,
      "fresh-migration-schema.sql",
    );

    const schemaSummaryArtifact = path.join(
      schemaArtifactDirectory,
      "schema-artifact-summary.json",
    );

    await Promise.all([
      writeFile(
        restoredSchemaArtifact,
        `${restoredSchemaSnapshot.normalized}\n`,
        {
          encoding: "utf8",
          mode: 0o600,
        },
      ),
      writeFile(
        freshSchemaArtifact,
        `${freshSchemaSnapshot.normalized}\n`,
        {
          encoding: "utf8",
          mode: 0o600,
        },
      ),
      writeFile(
        schemaSummaryArtifact,
        `${JSON.stringify(
          {
            ...schemaDifference,
            restoredSchemaArtifact,
            freshSchemaArtifact,
          },
          null,
          2,
        )}\n`,
        {
          encoding: "utf8",
          mode: 0o600,
        },
      ),
    ]);

    progress(
      `Full restored schema artifact: ${restoredSchemaArtifact}`,
    );

    progress(
      `Full fresh schema artifact: ${freshSchemaArtifact}`,
    );

    progress(
      `Schema artifact summary: ${schemaSummaryArtifact}`,
    );

    throw new Error(
      "Schema fingerprint convergence mismatch: " +
      `restored_upgrade=${restoredSchemaFingerprint}, ` +
      `fresh=${freshSchemaFingerprint}`,
    );
  }

  progress(
    `Schema fingerprint convergence passed: ${restoredSchemaFingerprint}`,
  );

  progress(
    "Reading latest migration from fresh migration database",
  );

  const migratedLatestResult = await run(
    "psql",
    [
      migrationCliUrl,
      "--tuples-only",
      "--no-align",
      "--set",
      "ON_ERROR_STOP=1",
      "--command",
      "SELECT migration_id " +
      "FROM public.athoo_schema_migrations " +
      "ORDER BY migration_id DESC " +
      "LIMIT 1",
    ],
    {
      capture: true,
    },
  );

  const migratedLatest =
    migratedLatestResult.stdout.trim();

  if (
    migratedLatest !== restoredMigratedLatest
  ) {
    throw new Error(
      "Migration convergence mismatch: " +
      `restored_upgrade=${restoredMigratedLatest}, ` +
      `fresh=${migratedLatest}`,
    );
  }

  progress(
    `Restored-upgrade and fresh-migration convergence passed: ${migratedLatest}`,
  );

  completedSuccessfully = true;

  console.log(
    JSON.stringify(
      {
        ok: true,

        sourceDatabase:
          databaseName(sourceUrl),

        administrationVariable:
          adminSelection.name,

        administrationHost:
          adminParsed.hostname,

        restoreRehearsalDatabase:
          rehearsalDb,

        migrationRehearsalDatabase:
          migrationDb,

        backup:
          backupFile,

        sourceLatestMigration:
          sourceLatest,

        targetLatestMigration:
          restoredMigratedLatest,

        schemaFingerprint:
          restoredSchemaFingerprint,

        cliSecurity: {
          sslmode: "require",
          channelBinding: "require",
        },

        checks: [
          "backup_checksum",
          "backup_manifest",
          "temporary_restore_database_creation",
          "restore",
          "restored_source_migration_comparison",
          "restored_pending_migrate",
          "restored_migrated_db_verify",
          "restored_migrated_db_integrity",
          "temporary_fresh_database_creation",
          "fresh_migrate",
          "fresh_db_verify",
          "fresh_db_integrity",
          "restored_fresh_schema_fingerprint_convergence",
          "restored_fresh_migration_convergence",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  /*
   * Delete only databases that this run successfully created.
   */
  if (rehearsalDatabaseCreated) {
    try {
      progress(
        `Removing restore rehearsal database: ${rehearsalDb}`,
      );

      await run(
        "dropdb",
        [
          "--if-exists",
          "--force",
          `--maintenance-db=${adminCliUrl}`,
          rehearsalDb,
        ],
      );

      rehearsalDatabaseCreated = false;
    } catch (error) {
      console.error(
        "WARNING: failed to drop rehearsal database " +
        `${rehearsalDb}: ${error.message}`,
      );
    }
  }

  if (migrationDatabaseCreated) {
    try {
      progress(
        `Removing fresh migration database: ${migrationDb}`,
      );

      await run(
        "dropdb",
        [
          "--if-exists",
          "--force",
          `--maintenance-db=${adminCliUrl}`,
          migrationDb,
        ],
      );

      migrationDatabaseCreated = false;
    } catch (error) {
      console.error(
        "WARNING: failed to drop migration database " +
        `${migrationDb}: ${error.message}`,
      );
    }
  }

  /*
   * Remove only backups that this rehearsal created itself.
   * A backup supplied by the user is never deleted.
   */
  if (
    createdBackup &&
    process.env.KEEP_REHEARSAL_BACKUP !==
    "true" &&
    backupFile
  ) {
    progress(
      "Removing temporary rehearsal backup files",
    );

    await rm(
      backupFile,
      {
        force: true,
      },
    );

    await rm(
      `${backupFile}.manifest.json`,
      {
        force: true,
      },
    );

    await rm(
      `${backupFile}.sha256`,
      {
        force: true,
      },
    );
  }

  if (completedSuccessfully) {
    progress(
      "DATABASE RESTORE AND MIGRATION REHEARSAL PASSED",
    );
  }
}

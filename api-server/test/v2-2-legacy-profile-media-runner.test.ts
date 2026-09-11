import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(
  fileURLToPath(import.meta.url),
);

const root = path.resolve(
  here,
  "../..",
);

const runner = fs.readFileSync(
  path.join(
    root,
    "api-server/scripts/backfill-legacy-profile-media.ts",
  ),
  "utf8",
);

test(
  "runner uses dry-run-first argument parser",
  () => {
    assert.match(
      runner,
      /parseLegacyProfileMediaBackfillOptions/,
    );

    assert.match(
      runner,
      /process\.argv\.slice\(2\)/,
    );
  },
);

test(
  "execute mode uses server-side locked snapshots",
  () => {
    assert.match(
      runner,
      /userQuarantineKey/,
    );

    assert.match(
      runner,
      /userScanQuarantineKey/,
    );

    assert.match(
      runner,
      /locked-quarantine/,
    );

    assert.match(
      runner,
      /scanStoredUpload/,
    );
  },
);

test(
  "source bytes are rechecked before database authorization",
  () => {
    assert.match(
      runner,
      /sourceConsistencyVerified/,
    );

    assert.match(
      runner,
      /scansMatch\(\s*lockedObject,\s*sourceAfter/s,
    );

    assert.match(
      runner,
      /LEGACY_PROFILE_MEDIA_SOURCE_CHANGED/,
    );
  },
);

test(
  "database write is transaction and row-lock protected",
  () => {
    assert.match(
      runner,
      /client\.query\("BEGIN"\)/,
    );

    assert.match(
      runner,
      /FOR UPDATE/,
    );

    assert.match(
      runner,
      /INSERT INTO public\.upload_security_records/,
    );

    assert.match(
      runner,
      /ON CONFLICT \(object_path\)/,
    );

    assert.match(
      runner,
      /DO NOTHING/,
    );

    assert.match(
      runner,
      /client\.query\("COMMIT"\)/,
    );

    assert.match(
      runner,
      /client[\s\S]*\.query\("ROLLBACK"\)/,
    );
  },
);

test(
  "runner never rewrites user profile references",
  () => {
    assert.doesNotMatch(
      runner,
      /UPDATE\s+public\.users/i,
    );

    assert.doesNotMatch(
      runner,
      /DELETE\s+FROM\s+public\.users/i,
    );
  },
);

test(
  "runner never deletes or overwrites the final profile object",
  () => {
    assert.doesNotMatch(
      runner,
      /deleteObject\(\s*candidate\.objectPath/s,
    );

    assert.doesNotMatch(
      runner,
      /key:\s*candidate\.objectPath/,
    );
  },
);

test(
  "runner output is aggregate and certification remains blocked",
  () => {
    assert.match(
      runner,
      /piiDisplayed:\s*false/,
    );

    assert.match(
      runner,
      /objectPathsDisplayed:\s*false/,
    );

    assert.match(
      runner,
      /persistentStorageChanged:\s*false/,
    );

    assert.match(
      runner,
      /productionCertified:\s*false/,
    );
  },
);

test(
  "runner resolves pg from the database workspace",
  () => {
    assert.match(
      runner,
      /createRequire/,
    );

    assert.match(
      runner,
      /lib\/db\/package\.json/,
    );

    assert.match(
      runner,
      /requireFromDatabaseWorkspace/,
    );

    assert.doesNotMatch(
      runner,
      /from\s+["']@workspace\/db["']/,
    );
  },
);
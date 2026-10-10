import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..", "..");
const rehearsalPath = path.join(root, "scripts", "tools", "db-rehearse.mjs");

test("schema mismatch exports complete secret-safe schema-only artifacts", async () => {
  const source = await readFile(rehearsalPath, "utf8");

  assert.match(
    source,
    /mkdir, readdir, rm, writeFile/,
  );
  assert.match(
    source,
    /blocks: schemaBlocks\(normalized\),\s*normalized,/,
  );
  assert.match(
    source,
    /restored-upgrade-schema\.sql/,
  );
  assert.match(
    source,
    /fresh-migration-schema\.sql/,
  );
  assert.match(
    source,
    /schema-artifact-summary\.json/,
  );
  assert.match(
    source,
    /restoredSchemaSnapshot\.normalized/,
  );
  assert.match(
    source,
    /freshSchemaSnapshot\.normalized/,
  );
  assert.match(
    source,
    /--schema-only/,
  );
});
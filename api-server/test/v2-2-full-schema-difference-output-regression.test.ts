import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..", "..");
const rehearsalPath = path.join(root, "scripts", "tools", "db-rehearse.mjs");

test("schema difference diagnostics preserve every differing schema block", async () => {
  const source = await readFile(rehearsalPath, "utf8");

  assert.match(source, /\brestoredOnly,\s*\n/);
  assert.match(source, /\bfreshOnly,\s*\n/);
  assert.match(source, /outputTruncated:\s*false/);

  assert.doesNotMatch(
    source,
    /restoredOnly\s*:\s*restoredOnly\.slice\(/,
  );
  assert.doesNotMatch(
    source,
    /freshOnly\s*:\s*freshOnly\.slice\(/,
  );
});

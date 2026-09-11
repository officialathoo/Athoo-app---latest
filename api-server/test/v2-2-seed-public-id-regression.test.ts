import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..", "..");
const seedPath = path.join(root, "scripts", "src", "seed.ts");

test("all deterministic Athoo seed users include unique public ids", async () => {
  const seed = await readFile(seedPath, "utf8");

  const expectedPairs = [
    ["user-admin-001", "USR-ADMIN-001"],
    ["user-customer-001", "USR-CUSTOMER-001"],
    ["user-provider-001", "USR-PROVIDER-001"],
    ["user-customer-002", "USR-CUSTOMER-002"],
    ["user-provider-002", "USR-PROVIDER-002"],
  ] as const;

  for (const [id, publicId] of expectedPairs) {
    const pattern = new RegExp(
      `id:\\s*"${id}",\\s*publicId:\\s*"${publicId}"`,
    );

    assert.match(seed, pattern);
  }

  const publicIds = expectedPairs.map(([, publicId]) => publicId);
  assert.equal(new Set(publicIds).size, publicIds.length);
});

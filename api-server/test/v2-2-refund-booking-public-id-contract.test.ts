import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) =>
  fs.readFileSync(path.join(root, file), "utf8");

test("refund booking public ID exists across schema migration and creation", () => {
  const schema = read("lib/db/src/schema/index.ts");
  const migration = read(
    "deploy/migrations/20260805_refund_booking_public_id_contract.sql",
  );
  const route = read("api-server/src/routes/refunds.ts");
  const migrations = read("lib/db/src/migrations.ts");

  assert.match(
    schema,
    /bookingPublicId:\s*text\("booking_public_id"\)/,
  );

  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS booking_public_id text/,
  );

  assert.match(
    migration,
    /SET booking_public_id = booking\.public_id/,
  );

  assert.match(
    migration,
    /refund\.booking_id = booking\.id/,
  );

  assert.match(
    route,
    /bookingPublicId:\s*booking\.publicId\s*\|\|\s*null/,
  );

  assert.match(
    migrations,
    /20260805_refund_booking_public_id_contract\.sql/,
  );
});

test("refund booking public ID migration remains additive and retry-safe", () => {
  const migration = read(
    "deploy/migrations/20260805_refund_booking_public_id_contract.sql",
  );

  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS/);
  assert.match(migration, /booking_public_id IS NULL/);
  assert.match(migration, /booking\.public_id IS NOT NULL/);
  assert.match(migration, /COMMIT;/);
  assert.doesNotMatch(migration, /DROP COLUMN/i);
  assert.doesNotMatch(migration, /DELETE FROM/i);
});
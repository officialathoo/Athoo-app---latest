import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..", "..");
const migrationPath = path.join(
  root,
  "deploy",
  "migrations",
  "20260802_00_schema_lineage_convergence.sql",
);
const schemaPath = path.join(root, "lib", "db", "src", "schema", "index.ts");
const authPath = path.join(root, "api-server", "src", "routes", "auth.ts");
const adminPath = path.join(root, "api-server", "src", "routes", "admin.ts");
const chatPath = path.join(root, "api-server", "src", "routes", "chat.ts");

test("historical database lineages converge before V2 location columns", async () => {
  const [migration, schema, auth, admin, chat] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(schemaPath, "utf8"),
    readFile(authPath, "utf8"),
    readFile(adminPath, "utf8"),
    readFile(chatPath, "utf8"),
  ]);

  assert.ok(
    path.basename(migrationPath).localeCompare(
      "20260802_athoo_v2_location_pagination_integrity.sql",
    ) < 0,
  );

  for (const requiredSql of [
    "CREATE TABLE IF NOT EXISTS public.admin_work_item_views",
    "CREATE TABLE IF NOT EXISTS public.provider_document_update_requests",
    "ADD COLUMN IF NOT EXISTS pair_key text",
    "ADD COLUMN IF NOT EXISTS booking_public_id text",
    "ADD COLUMN IF NOT EXISTS qr_code_url text",
    "ADD COLUMN IF NOT EXISTS document_compliance_status text",
    "ALTER COLUMN public_id SET NOT NULL",
    "DROP INDEX IF EXISTS public.audit_log_entity_created_idx",
    "CREATE INDEX IF NOT EXISTS audit_log_target_created_idx",
    "DROP CONSTRAINT IF EXISTS subscription_plans_price_check",
  ]) {
    assert.match(migration, new RegExp(requiredSql.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(schema, /publicId: text\("public_id"\)\.notNull\(\)/);
  assert.match(schema, /pairKey: text\("pair_key"\)\.notNull\(\)/);
  assert.match(schema, /export const adminWorkItemViewsTable/);
  assert.match(schema, /export const providerDocumentUpdateRequestsTable/);
  assert.match(schema, /qrCodeUrl: text\("qr_code_url"\)/);
  assert.match(schema, /bookingPublicId: text\("booking_public_id"\)/);

  assert.match(auth, /publicId: shortPublicId\("USR", newUserId\)/);
  assert.match(admin, /publicId: shortPublicId\("USR", newAdminId\)/);
  assert.match(chat, /pairKey: buildChatPairKey\(userId, otherUserId, bookingId\)/);
});

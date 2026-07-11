import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("runtime migration health matches the latest ordered migration", () => {
  const files = fs.readdirSync(path.join(root, "deploy/migrations")).filter((name) => name.endsWith(".sql")).sort();
  const latest = files.at(-1);
  const health = read("api-server/src/lib/databaseMigrations.ts");
  assert.ok(latest);
  assert.match(health, new RegExp(latest!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("refund creation is client-idempotent in API, schema, migration and mobile", () => {
  const schema = read("lib/db/src/schema/index.ts");
  const route = read("api-server/src/routes/refunds.ts");
  const migration = read("deploy/migrations/20260712_release_api_database_integrity.sql");
  const mobile = read("athoo-app/app/(customer)/refund-requests.tsx");
  assert.match(schema, /refund_requests_customer_request_uidx/);
  assert.match(route, /clientRequestId is required/);
  assert.match(route, /duplicate: true/);
  assert.match(route, /onConflictDoNothing\(\)/);
  assert.match(migration, /refund_requests_customer_request_uidx/);
  assert.match(mobile, /refundRequestId/);
});

test("durable queue reclaims stale workers and protects job ownership", () => {
  const queue = read("api-server/src/lib/queue.ts");
  assert.match(queue, /QUEUE_STALE_LOCK_MINUTES/);
  assert.match(queue, /Recovered after stale worker lock/);
  assert.match(queue, /status = 'processing' AND locked_by = \$2/);
  assert.match(queue, /QUEUE_COMPLETED_RETENTION_DAYS/);
  assert.match(queue, /completed_at < now\(\) -/);
});

test("core realtime tables have database foreign keys and sanity constraints", () => {
  const schema = read("lib/db/src/schema/index.ts");
  const migration = read("deploy/migrations/20260712_release_api_database_integrity.sql");
  assert.match(schema, /messagesTable[\s\S]*chatId: text\("chat_id"\).*references/);
  assert.match(schema, /callsTable[\s\S]*callerId: text\("caller_id"\).*references/);
  assert.match(schema, /negotiationsTable[\s\S]*customerId: text\("customer_id"\).*references/);
  assert.match(migration, /chats_distinct_participants_check/);
  assert.match(migration, /negotiations_amount_check/);
  assert.match(migration, /messages_chat_id_fkey/);
  assert.equal((schema.match(/lastMessageAt: timestamp\("last_message_at"\)/g) || []).length, 1);
});

test("local database integrity command checks migrations, orphans, duplicates and stale jobs", () => {
  const script = read("scripts/src/db-integrity.ts");
  const rootPackage = read("package.json");
  assert.match(script, /latest_migration/);
  assert.match(script, /orphan_negotiation_users/);
  assert.match(script, /duplicate_refund_request_ids/);
  assert.match(script, /stale_processing_jobs/);
  assert.match(rootPackage, /db:integrity/);
});

test("subscription ledger type and backfill are database-valid", () => {
  const migration = read("deploy/migrations/20260712_release_api_database_integrity.sql");
  assert.match(migration, /subscription_received/);
  assert.match(migration, /FROM user_subscriptions us/);
  assert.match(migration, /ON CONFLICT \(reference_type, reference_id\) DO NOTHING/);
});

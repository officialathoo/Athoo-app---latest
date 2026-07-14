import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("booking summaries aggregate in PostgreSQL and invoice numbers use a sequence", () => {
  const bookings = read("api-server/src/routes/bookings.ts");
  assert.match(bookings, /count\(\*\)::int/);
  assert.match(bookings, /providerValue/);
  assert.doesNotMatch(bookings, /bookings\.filter\(\(b\) => b\.status/);
  assert.match(bookings, /nextval\('athoo_invoice_number_seq'\)/);
  assert.doesNotMatch(bookings, /countResult.*from\(invoicesTable\)/s);
});

test("high-volume chat and notification lists are cursor paginated", () => {
  const chat = read("api-server/src/routes/chat.ts");
  const me = read("api-server/src/routes/me.ts");
  assert.match(chat, /Invalid chat cursor/);
  assert.match(chat, /hasMore, nextCursor/);
  assert.match(me, /Invalid notification cursor/);
  assert.match(me, /count\(\*\)::int/);
  assert.match(me, /hasMore, nextCursor/);
});

test("micro-cache uses compact token identities and invalidates after writes", () => {
  const app = read("api-server/src/app.ts");
  assert.match(app, /createHash\("sha256"\).*slice\(0, 24\)/s);
  assert.match(app, /microCache\.clear\(\)/);
  assert.match(app, /\["POST", "PUT", "PATCH", "DELETE"\]/);
});

test("performance migration adds sequence and covering indexes", () => {
  const migration = read("deploy/migrations/20260712_release_performance_scalability.sql");
  assert.match(migration, /CREATE SEQUENCE IF NOT EXISTS athoo_invoice_number_seq/);
  assert.match(migration, /bookings_customer_status_price_idx/);
  assert.match(migration, /notifications_user_unread_created_idx/);
  assert.match(migration, /chats_participant1_last_message_idx/);
});

test("repeatable performance smoke has concurrency, p95 and error-rate gates", () => {
  const script = read("scripts/tools/performance-smoke.mjs");
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["performance:smoke"], "node ./scripts/tools/performance-smoke.mjs");
  assert.match(script, /PERF_CONCURRENCY/);
  assert.match(script, /PERF_P95_LIMIT_MS/);
  assert.match(script, /PERF_ERROR_RATE_LIMIT/);
  assert.match(script, /Remote performance targets must use HTTPS/);
});

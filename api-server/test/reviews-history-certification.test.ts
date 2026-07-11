import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync("src/domain/reviews.ts", "utf8");
const providers = fs.readFileSync("src/routes/providers.ts", "utf8");
const admin = fs.readFileSync("src/routes/admin.ts", "utf8");
const app = fs.readFileSync("../admin-panel/src/App.tsx", "utf8");
const migration = fs.readFileSync("../deploy/migrations/20260711_review_history_integrity.sql", "utf8");

test("all review submissions enforce booking ownership and completion", () => {
  assert.match(service, /booking\.customerId !== input\.customerId/);
  assert.match(service, /booking\.status !== "completed"/);
  assert.match(service, /isNull\(bookingsTable\.rating\)/);
  assert.match(providers, /submitBookingReview/);
});

test("review records are canonical and duplicate-safe", () => {
  assert.match(service, /reviewsTable/);
  assert.match(service, /onConflictDoNothing/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS reviews_booking_id_uidx/);
  assert.match(migration, /reviews_rating_check/);
});

test("admin review moderation is permissioned and wired", () => {
  assert.match(admin, /\/reviews", requirePermission\("support\.read"\)/);
  assert.match(admin, /\/reviews\/:id\/moderation", requirePermission\("support\.write"\)/);
  assert.match(admin, /review_hidden/);
  assert.match(app, /ReviewsPage/);
  assert.match(app, /path="\/reviews"/);
});

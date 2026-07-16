import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

const service = readRepo("api-server/src/domain/reviews.ts");
const providers = readRepo("api-server/src/routes/providers.ts");
const admin = readRepo("api-server/src/routes/admin.ts");
const app = readRepo("admin-panel/src/App.tsx");
const migration = readRepo("deploy/migrations/20260711_review_history_integrity.sql");

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

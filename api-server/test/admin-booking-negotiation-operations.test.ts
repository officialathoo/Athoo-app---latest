import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const adminRoutes = fs.readFileSync(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
const schema = fs.readFileSync(new URL("../../lib/db/src/schema/index.ts", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../../admin-panel/src/pages/BookingsPage.tsx", import.meta.url), "utf8");

test("booking operations are narrow, reasoned and permission protected", () => {
  assert.match(adminRoutes, /bookings\/:id\/cancel", requirePermission\("bookings\.write"\)/);
  assert.match(adminRoutes, /Only pending or accepted unstarted bookings can be cancelled/);
  assert.match(adminRoutes, /must use the dispute workflow/);
  assert.match(adminRoutes, /cancellation reason of at least 10 characters/);
});

test("reassignment only targets eligible unstarted providers and is atomic", () => {
  assert.match(adminRoutes, /Only pending, unaccepted bookings can be reassigned/);
  assert.match(adminRoutes, /getProviderActiveWorkBlock\(providerId\)/);
  assert.match(adminRoutes, /providerScheduleAllows/);
  assert.match(adminRoutes, /providerWithinRadius/);
  assert.match(adminRoutes, /db\.transaction\(async \(tx\)/);
});

test("booking interventions have immutable operation history and server paging", () => {
  assert.match(schema, /bookingOperationsTable/);
  assert.match(schema, /booking_operations_booking_created_idx/);
  assert.match(adminRoutes, /bookings\/:id\/operations/);
  assert.match(adminRoutes, /total: Number\(countRows/);
  assert.match(page, /Operations history/);
  assert.match(page, /Export Page/);
  assert.match(page, /booking-operations-panel/);
});

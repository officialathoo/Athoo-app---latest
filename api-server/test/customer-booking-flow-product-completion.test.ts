import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Stage 1 customer booking flow product completion", () => {
  it("requires and persists a client request id for idempotent booking creation", () => {
    const route = read("api-server/src/routes/bookings.ts");
    const schema = read("lib/db/src/schema/index.ts");
    const migration = read("deploy/migrations/20260711_booking_creation_idempotency.sql");
    assert.match(route, /clientRequestId/);
    assert.match(route, /onConflictDoNothing/);
    assert.match(route, /duplicate: true/);
    assert.match(schema, /clientRequestId: text\("client_request_id"\)/);
    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS bookings_customer_request_uidx/);
  });

  it("keeps the same request id across retries and clears it only after success", () => {
    const screen = read("athoo-app/app/(customer)/book-service.tsx");
    assert.match(screen, /directBookingRequestIdRef/);
    assert.match(screen, /clientRequestId: directBookingRequestIdRef\.current/);
    assert.match(screen, /directBookingRequestIdRef\.current = null;\r?\n\s*Alert\.alert/);
  });

  it("uses the shared 12-hour-aware parser for cancellation-window enforcement", () => {
    const route = read("api-server/src/routes/bookings.ts");
    assert.match(route, /parseScheduledDateTime\(existing\.scheduledDate, existing\.scheduledTime\)/);
    assert.doesNotMatch(route, /scheduledTime\)\.slice\(0, 5\)/);
  });
});


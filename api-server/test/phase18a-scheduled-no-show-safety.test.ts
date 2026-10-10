import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getNoShowEligibleAt,
  parseScheduledDateTime,
} from "../src/domain/booking-schedule.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

test("scheduled times are converted from the configured Pakistan wall clock", () => {
  assert.equal(
    parseScheduledDateTime("2026-08-01", "10:00 AM", "Asia/Karachi")?.toISOString(),
    "2026-08-01T05:00:00.000Z",
  );
  assert.equal(
    parseScheduledDateTime("2026-08-01", "12:00 AM", "Asia/Karachi")?.toISOString(),
    "2026-07-31T19:00:00.000Z",
  );
  assert.equal(
    parseScheduledDateTime("2026-08-01", "12:00 PM", "Asia/Karachi")?.toISOString(),
    "2026-08-01T07:00:00.000Z",
  );
});

test("invalid calendar dates and invalid times fail closed", () => {
  assert.equal(parseScheduledDateTime("2026-02-30", "10:00 AM", "Asia/Karachi"), null);
  assert.equal(parseScheduledDateTime("2026-08-01", "25:00", "Asia/Karachi"), null);
  assert.equal(parseScheduledDateTime("01-08-2026", "10:00 AM", "Asia/Karachi"), null);
});

test("no-show eligibility cannot begin before scheduled start plus grace", () => {
  const eligibleAt = getNoShowEligibleAt({
    scheduledDate: "2026-08-01",
    scheduledTime: "10:00 AM",
    acceptedOrLastActivityAt: "2026-08-01T04:00:00.000Z",
    graceMs: 30 * 60 * 1000,
    timeZone: "Asia/Karachi",
  });
  assert.equal(eligibleAt?.toISOString(), "2026-08-01T05:30:00.000Z");
});

test("a late acceptance receives the full grace period", () => {
  const eligibleAt = getNoShowEligibleAt({
    scheduledDate: "2026-08-01",
    scheduledTime: "10:00 AM",
    acceptedOrLastActivityAt: "2026-08-01T05:20:00.000Z",
    graceMs: 30 * 60 * 1000,
    timeZone: "Asia/Karachi",
  });
  assert.equal(eligibleAt?.toISOString(), "2026-08-01T05:50:00.000Z");
});

test("production policy disables automatic no-arrival cancellation by default", () => {
  const example = read(".env.production.example");
  const render = read("render.yaml");
  assert.match(example, /^BOOKING_NO_SHOW_AUTO_CANCEL_ENABLED=false$/m);
  assert.match(render, /- key: BOOKING_NO_SHOW_AUTO_CANCEL_ENABLED\s+value: "false"/);
});

test("opt-in worker is bounded and arrival/status race protected", () => {
  const sweeper = read("api-server/src/lib/bookingSweeper.ts");
  assert.match(sweeper, /\.limit\(NO_SHOW_SWEEP_BATCH_SIZE\)/);
  assert.match(sweeper, /eq\(bookingsTable\.status, "accepted"\)/);
  assert.match(sweeper, /isNull\(bookingsTable\.providerArrivedAt\)/);
  assert.match(sweeper, /\.returning\(\)/);
  assert.match(sweeper, /getNoShowEligibleAt\(/);
});

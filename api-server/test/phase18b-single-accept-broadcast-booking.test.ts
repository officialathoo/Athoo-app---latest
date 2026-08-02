import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("exact-price provider acceptance creates an accepted booking in one transaction", () => {
  const route = read("api-server/src/routes/broadcast.ts");

  assert.match(route, /responseType === "accept"[\s\S]*finalizeAcceptedBroadcast\(tx, freshRequest, response, "provider"\)/);
  assert.match(route, /pg_advisory_xact_lock\(hashtextextended\(\$\{`broadcast:\$\{request\.id\}`\}/);
  assert.match(route, /lockActiveWorkSubjects\(tx, request\.customerId, response\.providerId\)/);
  assert.match(route, /clientRequestId: `broadcast:\$\{request\.id\}`/);
  assert.match(route, /status: "accepted"/);
  assert.doesNotMatch(route.slice(route.indexOf("async function finalizeAcceptedBroadcast"), route.indexOf("async function deliverAcceptedBroadcast")), /status: "pending"/);
});

test("only one provider wins and every other offer is closed or refreshed", () => {
  const route = read("api-server/src/routes/broadcast.ts");

  assert.match(route, /eq\(broadcastRequestsTable\.status, "open"\)/);
  assert.match(route, /"BROADCAST_FILLED"/);
  assert.match(route, /status: "not_selected"/);
  assert.match(route, /ne\(broadcastResponsesTable\.id, response\.id\)/);
  assert.match(route, /emitToRole\("provider", "broadcast:accepted" as EventName, \{ requestId: request\.id \}\)/);
  assert.match(route, /forEachWithConcurrency\(outcome\.losingProviderIds/);
});

test("customer rejection keeps the request open and enables bounded revised counters", () => {
  const route = read("api-server/src/routes/broadcast.ts");

  assert.match(route, /router\.post\("\/:id\/responses\/:responseId\/reject"/);
  assert.match(route, /status: "rejected_by_customer"/);
  assert.match(route, /eventType: "response_rejected"/);
  assert.match(route, /"broadcast:response-rejected"/);
  assert.match(route, /existing\.revision >= maxRevisions/);
  assert.match(route, /COUNTER_MUST_CHANGE/);
  assert.match(route, /revision: existing\.revision \+ 1/);
});

test("database migration is retry-safe and enforces broadcast conversion integrity", () => {
  const migration = read("deploy/migrations/20260801_single_accept_broadcast_booking.sql");
  const schema = read("lib/db/src/schema/index.ts");
  const latest = read("lib/db/src/migrations.ts");
  const integrity = read("scripts/src/db-integrity.ts");

  assert.match(migration, /broadcast_responses_request_provider_uidx/);
  assert.match(migration, /broadcast_responses_provider_request_id_uidx/);
  assert.match(migration, /broadcast_requests_booking_uidx/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS broadcast_offer_events/);
  assert.match(migration, /booking\.status = 'pending'/);
  assert.match(migration, /SET status = 'accepted'/);
  assert.match(schema, /broadcastOfferEventsTable/);
  assert.match(schema, /providerTravellingCharge: integer\("provider_travelling_charge"\)/);
  assert.match(latest, /20260802_athoo_v2_location_pagination_integrity\.sql/);
  assert.match(integrity, /duplicate_broadcast_provider_responses/);
  assert.match(integrity, /inconsistent_accepted_broadcasts/);
});

test("mobile exposes explicit accept counter reject and no-second-accept behavior", () => {
  const provider = read("athoo-app/app/(provider)/broadcast-jobs.tsx");
  const customer = read("athoo-app/app/(customer)/broadcast-status.tsx");
  const api = read("athoo-app/services/api.ts");
  const context = read("athoo-app/context/BroadcastContext.tsx");

  assert.match(provider, /action: "accept"/);
  assert.match(provider, /action: "counter"/);
  assert.match(provider, /Accepting confirms the booking now/);
  assert.match(provider, /no second acceptance is required/);
  assert.match(provider, /Revise Counter/);
  assert.match(customer, /api\.rejectBroadcastResponse\(requestId, responseId\)/);
  assert.match(customer, /Accept Counter/);
  assert.match(customer, /no second acceptance is needed/);
  assert.match(api, /rejectBroadcastResponse/);
  assert.match(context, /broadcast:response-rejected/);
});

test("broadcast writes have a bounded per-account action limit", () => {
  const app = read("api-server/src/app.ts");
  const env = read("scripts/tools/validate-environment.mjs");
  const example = read(".env.production.example");

  assert.match(app, /"\/api\/broadcast"[\s\S]*BROADCAST_ACTION_RATE_LIMIT_MAX/);
  assert.match(app, /sensitiveAccountKey\("broadcast-action", req\)/);
  assert.match(app, /code: "RATE_LIMITED"/);
  assert.match(env, /validateBoundedInteger\("BROADCAST_ACTION_RATE_LIMIT_MAX", 40, 1, 500\)/);
  assert.match(example, /BROADCAST_ACTION_RATE_LIMIT_MAX=40/);
});

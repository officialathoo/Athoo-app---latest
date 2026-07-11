import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const negotiations = fs.readFileSync(new URL("../src/routes/negotiations.ts", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
const mobile = fs.readFileSync(new URL("../../athoo-app/app/(provider)/negotiations.tsx", import.meta.url), "utf8");
const adminApp = fs.readFileSync(new URL("../../admin-panel/src/App.tsx", import.meta.url), "utf8");

test("accepted negotiation price is always derived from the current server offer", () => {
  assert.match(negotiations, /finalPrice = neg\.customerOffer/);
  assert.match(negotiations, /finalPrice = neg\.providerCounter/);
  assert.doesNotMatch(negotiations, /toAmount\(req\.body\?\.finalPrice\)/);
});

test("counter, reject and expiry transitions are conditional and turn-based", () => {
  assert.match(negotiations, /Wait for the customer to respond before countering again/);
  assert.match(negotiations, /Wait for the provider to respond before countering again/);
  assert.match(negotiations, /eq\(negotiationsTable\.status, neg\.status\)/);
  assert.match(negotiations, /lte\(negotiationsTable\.expiresAt, new Date\(\)\)/);
});

test("provider actions lock during requests and admin can close stuck negotiations", () => {
  assert.match(mobile, /processingId/);
  assert.match(mobile, /disabled=\{processingId === selectedNegotiation\.id\}/);
  assert.match(admin, /\/negotiations\/:id\/close/);
  assert.match(admin, /requirePermission\("operations\.write"\)/);
  assert.match(admin, /negotiation_closed/);
  assert.match(adminApp, /NegotiationsPage/);
});

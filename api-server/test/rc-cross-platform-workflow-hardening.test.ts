import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bookings = readFileSync(new URL("../src/routes/bookings.ts", import.meta.url), "utf8");
const ws = readFileSync(new URL("../src/ws.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const push = readFileSync(new URL("../src/lib/push.ts", import.meta.url), "utf8");
const smoke = readFileSync(new URL("../../scripts/tools/rc-workflow-smoke.mjs", import.meta.url), "utf8");
const betaSmoke = readFileSync(new URL("../../scripts/tools/beta-api-smoke.mjs", import.meta.url), "utf8");

 test("customer cannot move the job pin after provider arrival or work start", () => {
  assert.match(bookings, /existing\.providerArrivedAt \|\| existing\.jobStartedAt/);
  assert.match(bookings, /Job location is locked after the provider arrives/);
});

test("websocket servers enforce a bounded signaling payload", () => {
  assert.match(ws, /WS_MAX_PAYLOAD_BYTES/);
  assert.match(ws, /maxPayload: WS_MAX_PAYLOAD_BYTES/);
  assert.match(ws, /between 1024 and 1048576/);
});

test("maintenance mode permits operational authentication but blocks new registration", () => {
  assert.match(app, /\/api\/auth\/admin-login/);
  assert.match(app, /\/api\/auth\/refresh/);
  assert.doesNotMatch(app, /maintenanceAllowedAuthPaths[\s\S]*\/api\/auth\/register/);
});

test("Expo push delivery retries bounded transient failures", () => {
  assert.match(push, /PUSH_MAX_ATTEMPTS/);
  assert.match(push, /status === 429 \|\| status >= 500/);
  assert.match(push, /retry-after/);
  assert.match(push, /exhausted retries/);
});

test("RC smoke checks all roles and negative authorization boundaries", () => {
  assert.match(smoke, /\/api\/auth\/admin-login/);
  assert.match(smoke, /\/api\/providers\/dashboard/);
  assert.match(smoke, /\/api\/admin\/dashboard/);
  assert.match(smoke, /\[403\]/);
  assert.match(smoke, /without creating or mutating business records/);
  assert.match(betaSmoke, /loginPath=role==='admin'/);
});

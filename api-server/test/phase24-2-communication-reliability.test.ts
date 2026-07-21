import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

test("replaced mobile sessions react to auth:error before websocket close", () => {
  const api = readRepo("athoo-app/services/api.ts");
  assert.match(api, /parsed\.type === "auth:error"[\s\S]*?_unauthorizedHandler\?\.\(\)/);
  assert.match(api, /reason\.includes\("session"\)/);
});

test("broadcast delivery is bounded instead of unbounded Promise.all fanout", () => {
  const broadcast = readRepo("api-server/src/routes/broadcast.ts");
  assert.match(broadcast, /forEachWithConcurrency\([\s\S]*?matchedProviders,[\s\S]*?broadcastDeliveryConcurrency\(\)/);
  assert.doesNotMatch(broadcast, /Promise\.all\(\s*matchedProviders\.map/);
});

test("calls avoid unreliable STUN-only WebRTC and reserve fallback for missing TURN", () => {
  const calls = readRepo("athoo-app/context/CallContext.tsx");
  assert.match(calls, /rtcProductionReadyRef\.current = Boolean\(configuration\.productionReady && iceServers\.length > 0\)/);
  assert.match(calls, /if \(canUseWebRtc\(\) && pcRef\.current\)/);
  assert.match(calls, /else if \(!rtcProductionReadyRef\.current\)/);
  assert.match(calls, /if \(!canUseWebRtc\(\)\) return null/);
  assert.match(calls, /TURN is not production-ready; using authenticated audio fallback/);
});

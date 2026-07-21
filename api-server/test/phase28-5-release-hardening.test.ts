import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

test("Phase 28.5 serializes call creation and keeps live call transitions idempotent", () => {
  const calls = readRepo("api-server/src/routes/calls.ts");

  assert.match(calls, /pg_advisory_xact_lock\(hashtext/);
  assert.match(calls, /Caller account is not eligible to place calls/);
  assert.match(calls, /Calls are available only between customers and service providers/);
  assert.match(calls, /samePendingCall/);
  assert.match(calls, /signalingRefreshed/);
  assert.match(calls, /eq\(callsTable\.status, "ringing"\)/);
  assert.match(calls, /inArray\(callsTable\.status, \[\.\.\.LIVE_CALL_STATUSES\]\)/);
  assert.match(calls, /reused: true/);
});

test("Phase 28.5 appends ICE candidates atomically and propagates them in realtime", () => {
  const calls = readRepo("api-server/src/routes/calls.ts");
  const events = readRepo("api-server/src/lib/eventBus.ts");
  const mobileApi = readRepo("athoo-app/services/api.ts");

  assert.match(calls, /jsonb_array_length/);
  assert.match(calls, /jsonb_build_array/);
  assert.match(calls, /MAX_ICE_CANDIDATES_PER_SIDE/);
  assert.match(calls, /emitToUser\(remoteUserId, "call:ice-candidate"/);
  assert.match(events, /\| "call:ice-candidate"/);
  assert.match(mobileApi, /\| "call:ice-candidate"/);
});

test("Phase 28.5 uses serialized trickle ICE and verifies the selected relay candidate", () => {
  const context = readRepo("athoo-app/context/CallContext.tsx");
  const screen = readRepo("athoo-app/app/call.tsx");

  assert.match(context, /localCandidateUploadChainRef/);
  assert.match(context, /outgoingStatusPollInFlightRef/);
  assert.match(context, /candidatePollInFlightRef/);
  assert.match(context, /activeCallWatcherInFlightRef/);
  assert.match(context, /queueLocalCandidateUpload/);
  assert.match(context, /message\.type === "call:ice-candidate"/);
  assert.match(context, /pendingRemoteCandidatesRef/);
  assert.match(context, /pc\.onaddstream/);
  assert.match(context, /selectedCandidatePairId/);
  assert.match(context, /peerConnectionState/);
  assert.match(context, /selectedCandidateType/);
  assert.match(context, /candidateType === "relay"/);
  assert.match(context, /Cloudflare TURN relay verified/);
  assert.match(screen, /transportDetails/);
  assert.match(screen, /ms RTT/);
});

test("Phase 28.5 bounds and cancels admin data requests", () => {
  const api = readRepo("admin-panel/src/lib/api.ts");
  const inbox = readRepo("admin-panel/src/pages/OperationsInboxPage.tsx");
  const sidebar = readRepo("admin-panel/src/components/layout/Sidebar.tsx");

  assert.match(api, /requestTimeoutMs/);
  assert.match(api, /dedupeEligible = method === "GET"/);
  assert.match(api, /cacheGeneration/);
  assert.match(api, /requestGeneration === cacheGeneration/);
  assert.match(api, /invalidateClientCache\(\)/);
  assert.match(api, /externalSignal\?\.addEventListener\("abort"/);
  assert.match(inbox, /requestController\.current\?\.abort\(\)/);
  assert.match(inbox, /timeoutMs: 15_000/);
  assert.match(inbox, /controller\.signal\.aborted/);
  assert.match(sidebar, /const sidebarContent = \(/);
  assert.doesNotMatch(sidebar, /const SidebarContent = \(\) =>/);
});

test("Phase 28.5 connected verification rejects blank tiles and broken operations queues", () => {
  const verifier = readRepo("scripts/tools/connected-runtime-verify.mjs");

  assert.match(verifier, /CONNECTED_MIN_MAP_TILE_BYTES/);
  assert.match(verifier, /x-map-tile-suspect/);
  assert.match(verifier, /Public map tile template is not cache-versioned/);
  assert.match(verifier, /admin operations inbox/);
  assert.match(verifier, /CONNECTED_MAX_OPERATIONS_INBOX_LATENCY_MS/);
  assert.match(verifier, /provider === "cloudflare-turn"/);
  assert.match(verifier, /iceTransportPolicy === "relay"/);
  assert.match(verifier, /schemaVersion: 4/);

  const geo = readRepo("api-server/src/routes/geo.ts");
  const envExample = readRepo(".env.production.example");
  const renderBlueprint = readRepo("render.yaml");
  assert.match(geo, /MAP_TILE_NO_USABLE_IMAGE/);
  assert.match(geo, /process\.env\.MAP_TILE_SUSPICIOUS_BYTES \|\| 1_500/);
  assert.match(envExample, /MAP_TILE_SUSPICIOUS_BYTES=1500/);
  assert.match(renderBlueprint, /key: MAP_TILE_SUSPICIOUS_BYTES\s+value: "1500"/);
  assert.doesNotMatch(geo, /lastResort/);
});


test("Phase 28.5 prevents unsafe production-like seed data", () => {
  const seed = readRepo("scripts/src/seed.ts");
  const sqlSeed = readRepo("sql/seed.sql");
  const chatbot = readRepo("api-server/src/routes/chatbot.ts");
  const releaseCheck = readRepo("scripts/tools/release-check.mjs");

  assert.match(seed, /ALLOW_DEVELOPMENT_SEED !== "1"/);
  assert.match(seed, /SEED_DEMO_USERS/);
  assert.match(seed, /Payment accounts skipped/);
  assert.doesNotMatch(seed, /Demo@123|PK36HABB|03001234567/);
  assert.doesNotMatch(seed, /broadcastExpandIntervalMinutes/);
  assert.match(seed, /broadcastTTLMinutes: 30/);
  assert.match(seed, /broadcastExpandAfterMinutes: 5/);
  assert.doesNotMatch(sqlSeed, /Admin@123|Demo@123|03XX-XXXXXXX|01234567890123|PK36HABB/);
  assert.doesNotMatch(sqlSeed, /broadcastExpandIntervalMinutes/);
  assert.match(sqlSeed, /"broadcastExpandAfterMinutes": 5/);
  assert.doesNotMatch(chatbot, /verify your account with a small test deposit/i);
  assert.match(chatbot, /Approved withdrawals are processed manually/);
  assert.match(releaseCheck, /SQL seed contains credential or payment placeholders/);
});

test("Phase 28.5 release status stays honest about physical-device evidence", () => {
  const status = JSON.parse(readRepo("docs/qa/current-release-status.json"));
  const runbook = readRepo("docs/runbooks/DEVICE_ACCEPTANCE_RUNBOOK.md");

  assert.match(status.candidate, /^ATHOO_PHASE28_5_/);
  assert.equal(status.externalVerification.twoWayVoiceCall, "pending");
  assert.equal(status.externalVerification.mapTilesOnAndroidAndIos, "pending");
  assert.match(status.launchDecision, /^NO-GO-/);
  assert.match(runbook, /Cloudflare TURN relay verified/);
  assert.match(runbook, /EAS Update group/);
});

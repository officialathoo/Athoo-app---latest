import test from "node:test";
import assert from "node:assert/strict";
import { readRepo as read } from "./helpers/repo.ts";


test("caller buffers ICE candidates until the real call id exists", () => {
  const calls = read("athoo-app/context/CallContext.tsx");
  assert.match(calls, /pendingLocalCandidatesRef/);
  assert.match(calls, /flushPendingLocalCandidates\(call\.id, "caller"\)/);
  assert.doesNotMatch(calls, /createPeerConnection\("pending"/);
});

test("WebRTC and fallback audio do not record simultaneously", () => {
  const calls = read("athoo-app/context/CallContext.tsx");
  assert.match(calls, /if \(!canUseWebRtc\(\) \|\| !pcRef\.current\)/);
  assert.match(calls, /WebRTC connection timed out; activating audio fallback/);
  assert.match(calls, /if \(isStreamingRef\.current\) stopVoiceStreaming\(\)/);
});

test("native microphone mute and remote track handling are wired", () => {
  const calls = read("athoo-app/context/CallContext.tsx");
  assert.match(calls, /getAudioTracks\?\.\(\)/);
  assert.match(calls, /pc\.ontrack/);
  assert.match(calls, /setCallSpeakerMode/);
});

test("call API exposes TURN readiness and protects signaling", () => {
  const calls = read("api-server/src/routes/calls.ts");
  const configuration = read("api-server/src/lib/callConfiguration.ts");
  assert.match(configuration, /productionReady/);
  assert.match(configuration, /Production voice calling requires Cloudflare TURN credentials or valid TURN_URLS/);
  assert.match(calls, /getRuntimeCallConfiguration/);
  assert.match(calls, /Too many ICE candidates/);
  assert.match(calls, /Call is not active/);
});

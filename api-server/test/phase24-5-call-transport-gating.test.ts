import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

test("native WebRTC is attempted only when authenticated TURN is production-ready", () => {
  const calls = readRepo("athoo-app/context/CallContext.tsx");
  assert.match(calls, /const rtcProductionReadyRef = useRef\(false\)/);
  assert.match(calls, /function canUseWebRtc\(\): boolean/);
  assert.match(calls, /rtcProductionReadyRef\.current &&/);
  assert.match(calls, /iceConfigurationRef\.current\.iceServers\.length > 0/);
  assert.match(calls, /if \(!canUseWebRtc\(\)\) return null/);
  assert.doesNotMatch(calls, /if \(WebRTCAvailable && current\.offer\)/);
});

test("microphone or SDP setup failure closes RTC instead of starting a broken production call", () => {
  const calls = readRepo("athoo-app/context/CallContext.tsx");
  assert.match(calls, /secure WebRTC setup failed before dialing/);
  assert.match(calls, /secure WebRTC setup failed while answering/);
  assert.match(calls, /if \(!stream\) throw new Error\("Microphone stream was not created"\)/);
  assert.match(calls, /Call Could Not Start/);
  assert.match(calls, /Call Could Not Connect/);
  assert.match(calls, /closePeerConnection\(\);[\s\S]*?setMediaState\("failed"\)/);
  assert.match(calls, /try \{ await api\.rejectCall\(current\.callId\); \} catch \{\}/);
  assert.doesNotMatch(calls, /WebRTC setup failed before dialing; using authenticated audio fallback/);
});

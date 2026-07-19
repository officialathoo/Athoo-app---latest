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

test("microphone or SDP setup failure closes RTC and falls back cleanly", () => {
  const calls = readRepo("athoo-app/context/CallContext.tsx");
  assert.match(calls, /WebRTC setup failed before dialing; using authenticated audio fallback/);
  assert.match(calls, /WebRTC setup failed while answering; using authenticated audio fallback/);
  assert.match(calls, /if \(!stream\) throw new Error\("Microphone stream was not created"\)/);
  assert.match(calls, /closePeerConnection\(\);[\s\S]*?offerSdp = undefined/);
  assert.match(calls, /closePeerConnection\(\);[\s\S]*?answerSdp = undefined/);
});

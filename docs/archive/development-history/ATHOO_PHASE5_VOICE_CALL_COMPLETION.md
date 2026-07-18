# Athoo Phase 5 — Production Voice Call Reliability

## Baseline
ATHOO_PHASE4_CHAT_NEGOTIATION_FIXED.zip

## Root causes confirmed
1. Caller ICE candidates were generated before the API returned a real call ID. The peer connection captured `pending`, so candidates were posted to a non-existent call and lost.
2. WebRTC and the HTTP audio fallback started together after acceptance, competing for microphone/audio-session ownership.
3. Call audio mode could remain in ringtone/alert mode when WebRTC started.
4. Mute changed UI state but did not disable the native WebRTC microphone track.
5. Transient WebRTC `disconnected` state ended the local UI too aggressively.
6. Accept-call API errors were swallowed while the UI still marked the call active.
7. ICE candidate arrays were unbounded and accepted after calls ended.
8. Audio fallback upload/fetch was allowed outside active calls.
9. Runtime config did not clearly report whether TURN was production-ready.

## Fixes
- Buffer local ICE candidates until the real call ID exists, then flush them.
- Added explicit remote audio-track handling.
- WebRTC owns audio first; authenticated HTTP fallback starts only when RTC is unavailable or fails to connect within eight seconds.
- Added automatic fallback when WebRTC reaches `failed`.
- Native microphone tracks now follow the mute toggle.
- Speaker/earpiece mode uses the shared call-audio service.
- Call audio mode is activated before native media capture.
- `disconnected` is treated as potentially temporary; server status remains authoritative.
- Accept/start failures now clean media state and display the actual safe error.
- Call config now reports `hasTurn`, `productionReady`, and a warning when TURN is absent.
- Accept only transitions ringing calls.
- ICE role/state validation and a 128-candidate cap were added.
- Fallback audio endpoints now require an active call.
- Added Phase 5 regression tests.

## Validation performed
- TypeScript transpile/syntax validation: passed for all changed TS/TSX files.
- Phase 5 targeted regression tests: 4/4 passed.
- Mobile release validation: passed (EAS_PROJECT_ID warning in this environment).
- Security scan: passed.

## Connected validation still required
- Configure TURN_URLS, TURN_USERNAME, and TURN_CREDENTIAL on Render.
- Redeploy the API and confirm `/health` reports TURN configured.
- Produce a new native Android/iOS build containing react-native-webrtc.
- Test Android ↔ iPhone on Wi-Fi/Wi-Fi, mobile/mobile, and Wi-Fi/mobile.
- Verify remote voice both directions, mute, speaker/earpiece, Bluetooth, backgrounding, decline, timeout, and remote hang-up.

A call feature is not production-certified until these real-device checks pass.

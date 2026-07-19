# Athoo Phase 24.5 — Call Transport Gating and Safe Fallback

## Baseline

- Input: `ATHOO_PHASE24_4_FINAL_SOURCE_AUDITED_DEVICE_VALIDATION_READY.zip`
- Output: `ATHOO_PHASE24_5_CALL_TRANSPORT_GATED_DEVICE_VALIDATION_READY.zip`
- Database migrations added: none
- Launch status: **NO-GO until dependency-backed, connected and real-device evidence passes**

## Defect found during source audit

Phase 24.2 cleared the ICE server list when authenticated TURN was unavailable, but call creation still checked only whether the native WebRTC module existed. A native build could therefore create a peer connection with no production-ready relay, capture the microphone, create an SDP offer and wait for the timeout before starting the authenticated audio fallback. This contradicted the intended immediate fallback behavior and could reproduce silent or delayed calls.

## Production fix

- Added a dedicated runtime `rtcProductionReadyRef` controlled by the authenticated server call configuration.
- WebRTC now starts only when the native module is valid, the server reports production readiness, and at least one authenticated ICE server is present.
- Caller and callee paths share the same gate.
- Microphone-stream or SDP setup failure now closes the partial peer connection and continues with the authenticated audio fallback instead of leaving a silent RTC attempt alive.
- Existing TURN WebRTC, ICE buffering, mute, speaker, remote-track and fallback behavior remains intact.

## Source verification

- Focused communication/call regressions: 9 passed.
- Complete API source suite: 509 passed, 0 failed.
- No database migration was required.

## Verification not claimed

The packaging environment did not contain workspace dependencies, production TURN credentials, Render/EAS deployment access or two connected physical devices. Semantic TypeScript typecheck/build, Metro export and real Android/iPhone two-way audio remain mandatory before launch.

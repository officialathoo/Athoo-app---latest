# Athoo Phase 28.3 — Call Audio, Timer, and Authentication UI Repair

## Reported real-device problems

- The receiver entered the active call immediately, while the caller remained in the calling state for several seconds.
- Call duration started from separate device clocks and could drift.
- After a short watchdog delay, production WebRTC calls could be replaced by chunked HTTP audio when no inbound RTP bytes had yet been observed.
- The chunked path produced delayed, chopped, low-volume audio and speaker-to-microphone self-echo.
- Users could not see whether the configured Cloudflare TURN transport had loaded or connected.
- The welcome logo image appeared as a square white layer inside a differently rounded container.
- Sign-in and registration role choices were oversized and visually inconsistent on phones.

## Permanent repair

### Call signaling and synchronized duration

- Mobile realtime handling now processes `call:accepted`, `call:rejected`, and `call:ended` events in addition to incoming calls.
- Only the caller applies the receiver SDP answer.
- The caller recovery status poll runs every 500 ms until the remote answer is applied.
- Both devices derive duration from the backend `startedAt` timestamp, replacing local independent timers.

### Production media transport

- Cloudflare TURN remains server-selected with short-lived credentials and relay-only ICE policy.
- The call UI reports transport readiness and confirms `Cloudflare TURN connected` after a connected peer and remote audio track are present.
- Native WebRTC now requests acoustic echo cancellation, noise suppression, automatic gain control, mono audio, and a 48 kHz sample rate.
- User silence is no longer interpreted as media failure. A connected peer with a remote audio track remains on WebRTC even when early RTP counters are zero.
- A configured production TURN call is never automatically downgraded to chunked HTTP audio.
- Secure setup failures now stop or reject the call with a clear error instead of creating a broken active call.
- Emergency fallback remains available only when production TURN is genuinely unavailable and is half-duplex during playback to prevent self-echo.
- Call audio uses non-mixing interruption mode so ringtone/media playback does not compete with the microphone session.

### UI repair

- The welcome and loader logo images now fill and inherit the same curved clipping surface as their containers.
- Welcome actions use compact 62-pixel standard controls in one professional panel.
- Role selection uses compact 94-pixel neutral cards, consistent icon sizing, accent rails, one-line role titles, and a balanced responsive layout.
- Closed-beta Maestro login flows and validation markers now follow the explicit Sign in → role selection path.

## Configuration

- `CALL_FALLBACK_ACTIVATION_MS` default: `8000`
- Backend accepted range: `7000`–`20000`
- `CALL_ICE_TRANSPORT_POLICY=relay` remains unchanged.

## Validation completed in the packaging environment

- Full source regression suite: 550 tests passed, 0 failed.
- Changed TypeScript/TSX files passed TypeScript syntax transpilation.
- Project validation passed.
- Release check passed.
- Operations readiness passed.
- Release blueprint validation passed.
- Security scan passed.
- Expo workspace configuration validation passed.
- React Native style-key validation passed.
- Mobile release validation passed.
- Closed-beta QA asset validation passed.
- Device acceptance preparation validation passed.

## Connected verification still required

The packaging environment does not contain the workspace `node_modules`, so full monorepo typecheck, Metro export, API/admin production builds, and a physical two-device audio call must be run after extraction. A real Android/iPhone call is required to certify microphone routing, Cloudflare relay establishment, echo cancellation, volume, and cellular/Wi-Fi behavior.

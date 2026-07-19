# Athoo Phase 24.6 — Location and Notification Self-Healing

## Scope

This cumulative phase uses the Phase 24.5 call-transport-gated candidate as its baseline and addresses two remaining real-device reliability risks.

## Provider location freshness

- Forced provider synchronization now actively requests a fresh GPS fix when the provider session starts, availability is enabled, or the app returns to the foreground.
- A usable fresh coordinate can no longer be replaced by an older cached coordinate merely because the cached reading reported a slightly smaller accuracy radius.
- Unknown-accuracy cached readings no longer bypass the bounded fresh-location request.
- Cached coordinates remain available as a safe fallback when the device cannot obtain a current fix within the timeout.

## Notification self-healing

- Notification permission is re-read from the operating system before generating an Expo push token, so enabling notifications later in device settings takes effect without reinstalling the app.
- Temporary notification-module or Android-channel setup failures reset initialization state and can be retried.
- Push tokens are force-synchronized whenever the app returns to the foreground.
- Authenticated active sessions periodically re-register their Expo push token on a configurable bounded interval.
- Overlapping foreground, startup, and periodic token synchronizations are serialized per authenticated session so they do not race or suppress registration for a newly replaced session.
- `EXPO_PUBLIC_PUSH_TOKEN_SYNC_INTERVAL_MS` defaults to 900000 milliseconds and is bounded between five minutes and six hours.

## Verification boundary

Focused source regression tests cover the new location and notification behavior. Dependency-backed typecheck, native build, Render deployment, Expo credentials, physical Android/iPhone push delivery, map tiles, radius matching, session replacement, biometrics and two-way voice remain connected/device verification work and must not be represented as passed until executed.

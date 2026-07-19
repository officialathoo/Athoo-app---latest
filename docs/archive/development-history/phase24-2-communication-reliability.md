# Phase 24.2 Communication Reliability

## Fixed in source

- Mobile realtime authentication now handles the server `auth:error` event before WebSocket closure. This makes a replaced device clear its local session immediately even where React Native does not preserve custom close code 4401.
- Initial provider broadcast notification fan-out now uses configurable bounded concurrency through `BROADCAST_DELIVERY_CONCURRENCY` instead of unbounded `Promise.all` delivery.
- Calling no longer attempts unreliable STUN-only WebRTC in production. When authenticated TURN is not fully configured, the client uses the existing authenticated HTTP audio fallback immediately instead of waiting through a silent/failed peer connection.

## Required deployment configuration for production WebRTC

Set all of the following on the API deployment:

- `TURN_URLS` (or legacy `TURN_URL`) with valid `turn:`/`turns:` addresses
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

After setting these variables, redeploy the API and rebuild the native mobile app. Verify `/api/health` reports calls as production-ready.

## Verification performed

`node --experimental-strip-types --test api-server/test/phase24-2-communication-reliability.test.ts`

Result: 3 passed, 0 failed.

A complete monorepo typecheck/build still needs to be run on the user's local machine because dependencies are not installed in this isolated packaging environment.

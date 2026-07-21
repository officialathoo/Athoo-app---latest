# Athoo Phase 28.5 — Release Hardening

Phase 28.5 preserves the Phase 28.4 map and admin-operability repairs and closes additional source-level reliability gaps before final device acceptance.

## Call signaling and media truth

- Call creation is serialized with transaction-scoped participant advisory locks.
- Customer/provider role pairing, account eligibility, stale ringing cleanup, busy-state protection and idempotent retries are enforced server-side.
- Accept, reject and end transitions are conditional and idempotent.
- ICE candidates are validated, bounded and appended atomically with PostgreSQL JSONB operations instead of read-modify-write races.
- New ICE candidates are delivered immediately through authenticated realtime events; bounded, non-overlapping database polling remains only as recovery.
- Mobile candidate uploads are serialized, remote candidates are deduplicated/queued until the SDP description exists, and legacy `onaddstream` is supported for compatible existing preview binaries.
- The mobile call screen inspects the selected ICE candidate pair and distinguishes actual relay evidence from configuration readiness. A Cloudflare call is only labelled verified when the selected local candidate type is `relay`.

## Admin responsiveness

- GET requests without caller-owned abort signals are deduplicated while in flight.
- Endpoint-specific timeout budgets replace the previous universal 90-second wait.
- External cancellation signals are preserved and combined with timeout cancellation.
- Operations Inbox aborts stale filter/search requests and keeps previously loaded data during refresh failures.
- Sidebar content is stable JSX rather than a remounted inline component type.

## Map response integrity

- TomTom Orbis and legacy candidates are both evaluated through the provider-neutral map adapter.
- A configured TomTom tile smaller than the production floor of 1,500 bytes is treated as suspicious.
- Suspicious tiles are never returned or cached as successful map images; all unusable candidates produce a diagnostic `MAP_TILE_NO_USABLE_IMAGE` response.
- Render and environment blueprints use the same 1,500-byte floor so production cannot silently override the source default.

## Release and data safety

- Development seeding is blocked in production and requires `ALLOW_DEVELOPMENT_SEED=1` plus an explicitly supplied strong administrator password.
- Optional demo users require a second explicit opt-in and their own strong password.
- Seed scripts no longer create active or plausible payment destinations and never print credentials.
- Database pools close cleanly after the seed command.
- Provider chatbot guidance no longer claims that a test deposit is required; approved withdrawals remain manual and restricted to admin-verified destinations.
- Admin GET caching uses a generation counter so a slow response cannot repopulate stale data after a mutation, logout, session change or API-base change.

## Connected release evidence

The connected verifier now fails on:

- suspiciously small/blank map tiles;
- missing map cache-versioning or upstream diagnostics;
- Operations Inbox HTTP/schema/degradation/latency failures;
- slow sidebar counts;
- non-Cloudflare or non-relay production call configuration;
- TURN URLs without short-lived credentials.

## Local source verification

- Standalone API/source regression suite: **563 passed, 0 failed**.
- Phase 28.5 focused regression suite: **7 passed, 0 failed**.
- Changed TypeScript/TSX syntax transpilation: **18 files passed**.
- Project, release, operations, blueprint, security, Expo workspace, React Native style and mobile release validators: **passed**.
- Full dependency-backed `pnpm run release:verify:code` remains mandatory on the Windows workstation before deployment.

## Remaining external evidence

Physical Android/iOS verification remains mandatory for two-way audio quality, selected relay proof, push sounds/deep links, biometric prompts, map rendering, GPS/radius matching and session replacement. These are not represented as passed by source tests.

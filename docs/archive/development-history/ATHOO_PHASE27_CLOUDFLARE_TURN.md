# Phase 27 — Cloudflare TURN Integration

- Uses the managed TURN service, not the Serverless SFU, for Athoo's existing one-to-one WebRTC signaling architecture.
- Keeps the Cloudflare TURN key ID and API token only on the API server.
- Generates short-lived, per-user ICE credentials through the authenticated `/api/calls/config` endpoint.
- Filters the commonly blocked alternate port 53 while preserving UDP, TCP, TLS 5349, and TLS 443 routes returned by Cloudflare.
- Caches credentials per authenticated user with bounded memory and refreshes them before expiry.
- Refreshes active peer-connection ICE configuration without embedding master credentials in the app.
- Retains portable static TURN variables as an operational fallback.
- Repairs four stale Phase 26 regression expectations discovered by full local verification.

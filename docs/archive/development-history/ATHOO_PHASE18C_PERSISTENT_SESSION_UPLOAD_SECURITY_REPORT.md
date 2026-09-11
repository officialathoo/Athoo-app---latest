# ATHOO Phase 18C — Persistent Session and Upload Security Report

Date: 2026-08-01
Input baseline: `ATHOO_PHASE18B_SINGLE_ACCEPT_BROADCAST_BOOKING_FIXED.zip`
Output candidate: `ATHOO_PHASE18C_PERSISTENT_SESSION_UPLOAD_SECURITY_FIXED.zip`
Latest migration: `20260801_upload_security_firewall.sql`

## Outcome

Phase 18C closes two reported high-impact problems in code:

- Normal authenticated sessions survive app closure and temporary refresh-service/network failures without treating availability problems as logout.
- New images, videos, and PDFs cannot become application media merely by using an allowed extension or client-declared MIME type. They must pass owner, metadata, size, byte-signature, active-content, hashing, and external malware checks before the API returns a persistable final path.

The upload design is fail-closed. Staging and production require an authenticated HTTPS malware scanner. Applying the migration, provisioning that scanner, remediating legacy media, and running connected/device acceptance remain mandatory release gates.

## Persistent session correction

- Password, phone OTP, and email OTP login flows persist rotating refresh credentials securely by default while preserving explicit opt-out and logout.
- Startup can restore an access credential from the encrypted refresh credential before deciding that the user is signed out.
- Biometric relock no longer destroys the authenticated session and can restore it after unlock.
- Refresh outcomes distinguish authoritative rejection (`400/401/403`) from timeout, throttling, malformed success, network failure, and upstream `5xx`.
- Temporary refresh unavailability preserves encrypted credentials and the cached non-sensitive user view and produces a retryable state.
- Revoked, expired, missing, device-mismatched, account-invalid, or explicitly rejected sessions still clear private local state.
- Concurrent refresh requests remain coalesced, and ambiguous refresh POSTs are not blindly replayed.

## Upload trust boundary

| Stage | Storage path | Who can write | Application-readable |
|---|---|---|---|
| Incoming quarantine | `uploads/quarantine/incoming/<owner>/...` | Client through one short-lived signed PUT | No |
| Locked snapshot | `uploads/quarantine/locked/<owner>/...` | Server credentials only | No |
| Final object | `uploads/private|shared/<owner>/...` | Server promotion only | Only with a clean security record |

The locked snapshot is essential. A signed PUT can be reused until it expires; scanning the client-writable object and then marking the same key clean would permit a post-scan overwrite. Completion now atomically snapshots the incoming object to a server-only key, scans that snapshot, and promotes only those verified bytes to a distinct final path. The mobile client persists only the final path returned by completion and never receives write capability for it.

## Upload inspection and bypass controls

- Request-time extension, MIME, size, scope, owner, and account/session checks.
- Completion-time revalidation against storage metadata and the current server policy.
- Streaming inspection with a strict byte ceiling and full SHA-256; large videos are not loaded fully into API memory.
- Magic-byte recognition for supported JPEG, PNG, WebP, PDF, MP4/MOV/M4V data.
- Rejection of renamed executables/archives, extension/MIME/signature mismatches, image/script polyglots, and dangerous active PDF actions.
- Authenticated raw-binary HTTPS scanner contract with bounded timeout, response size, and concurrency.
- Fail-closed scanner behavior for missing configuration, overload, timeout, malformed response, service error, or malware result.
- Durable `pending/scanning/clean/rejected/error/expired` state with owner, scope, detected type, actual size, SHA-256, scanner, safe reason code, expiry, and cleanup evidence.
- Atomic scan claiming, bounded stale-lease recovery, and idempotent clean completion.
- Database constraints require separate owner-bound incoming, locked, and final paths.
- Legacy Cloudinary/POST paths remain display-compatible where already present but are disabled for new uploads.
- All current profile, KYC/service document, refund, commission, subscription, support, chat, booking, and broadcast media writes require a clean owner-bound record.
- Uploaded objects without clean evidence are not served; uploaded-object redirects are disabled; responses use `nosniff`, sandbox CSP, safe disposition, and the verified content type.
- Upload URL and completion endpoints have combined account/session/device/IP-sensitive throttling in addition to the global IP boundary.
- Immediate best-effort deletion is followed by an idempotent post-expiry sweep of both temporary keys, including signed-URL reuse after an earlier cleanup.
- Logs use hashed upload references and safe reason codes rather than file bodies or document names.

These controls materially reduce the malicious-upload attack surface. No implementation can truthfully guarantee detection of every future malware technique, which is why the independent scanner, monitoring, updates, and incident procedures remain required.

## Database and operations

- The retry-safe migration creates `upload_security_records`, trust-boundary constraints, unique path indexes, expiry indexes, and cleanup evidence.
- An earlier pre-release draft with unsafe same-path records causes constraint validation to fail rather than silently preserving a bypass.
- Database integrity checks now detect clean records missing scan evidence, unsafe/colliding paths, stale scans, expired pending grants, and expired quarantine that was not cleaned.
- A bounded maintenance worker expires abandoned grants, removes incoming and locked objects, retries failed deletion, and retains rejected/expired evidence until cleanup succeeds.
- Deep health and production readiness expose malware-scanner safety and quarantine maintenance status.
- Environment validation requires deployment-safe scanner, legacy-read, timeout, concurrency, reclaim, sweep, and retention settings.

## Verification completed

- Full repository test gate: **487/487 passed**.
- Shared libraries, API server, admin panel, mobile app, and scripts TypeScript checks: **passed**.
- Project, release, operations, blueprint, security, Expo workspace, React Native style, and Metro configuration checks: **passed**.
- API production bundle and admin production bundle: **built successfully**.
- Executable upload regression coverage includes renamed executables, image/script polyglots, active PDFs, locked snapshot ordering, path traversal, sidecar cleanup, persistence gates, and deployment fail-closed configuration.
- Full command: `pnpm run release:verify:code` — **passed**.

## Mandatory deployment sequence

1. Create and verify a PostgreSQL restore point and an object-storage inventory.
2. Provision an independently operated malware scanner with an authenticated HTTPS endpoint and a rotated, least-privilege token.
3. Validate the scanner's raw-binary request and strict `{"clean": boolean}` response contract in staging.
4. Apply `20260801_upload_security_firewall.sql`; confirm migration status and all upload integrity checks.
5. Inventory every legacy media reference. Scan and import/re-upload acceptable objects into the new clean-record model and quarantine/delete failures. Production deliberately does not grandfather unverified uploads.
6. Deploy API and mobile artifacts from the same candidate, with `UPLOAD_SCAN_MODE=required` and `UPLOAD_LEGACY_READ_POLICY=deny`.
7. Run clean, EICAR/test-malware, renamed executable, polyglot, active-PDF, timeout, scanner-overload, malformed-response, oversized, concurrent-completion, signed-URL-reuse, and large-video scenarios.
8. Monitor scanner latency/errors, upload `429/409/422/503` rates, stale scans, cleanup lag, storage growth, and integrity alerts.

## Connected and device acceptance still required

The following were not claimed as locally completed:

- Real R2/object-store signed PUT, atomic server copy, deletion, TTL-reuse, and permission-boundary tests.
- Real scanner tests for clean files, EICAR/test-malware, timeout, overload, malformed response, and large video streaming.
- Production-shaped migration rehearsal and legacy-media remediation.
- Android and iPhone background/foreground tests across access expiry, refresh rotation, temporary offline state, revocation, explicit logout, biometric relock, and 30-day policy.
- Cross-role verification that every media consumer receives the final clean path and rejected/pending paths remain unavailable.

## Rollback

Keep the Phase 18B API/mobile artifacts, database restore point, and object inventory.

- Stop new uploads before rolling back. Phase 18C final paths must not be exposed through an older API that does not consult scan evidence.
- If only the scanner is degraded, keep the Phase 18C API fail-closed and restore scanner capacity; do not bypass scanning.
- If migration or media-remediation integrity fails, stop upload/media writes, capture sanitized diagnostics, restore the verified database/object state, and redeploy the prior artifacts.
- Do not drop security records or mark legacy objects clean without an actual scan result.

## Next implementation phase

Proceed with Phase 18D items 5, 8, and 9 together: canonical location/address data, real maps and routes, and server-verified geofenced arrival.

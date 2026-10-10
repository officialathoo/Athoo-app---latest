# Phase 19 production-hardening addendum — 2026-08-02

The Phase 18C baseline has been retained and strengthened rather than replaced by an unverified artifact. Phase 19 adds: compound-extension and media-container bypass defenses; fail-closed external malware-scanner deployment; entity-aware stored-media authorization; password/email/mobile-OTP step-up for destructive account actions with legacy bypasses disabled; HTTPS enforcement; per-IP and bearer-token limits; sanitized errors/logging; schedule-aware pending/no-show rules; customer/provider reminders; 1 km configurable arrival geofence; negotiation media/location/hourly/travel amounts; single-accept booking conversion; separate scheduled filtering; smaller provider filters; safe stale-while-revalidate booking cache; OTP keyboard protection; and signed non-PII invoice QR verification.

**Release state:** code-patched and locally source-audited; connected Neon/R2/scanner/Render/Vercel/EAS and Android/iPhone certification remain mandatory. No claim is made that any system can prevent every possible attack.

---

# ATHOO Phase 18 — Master Issue and Hardening Plan

Date: 2026-08-01
Baseline: `ATHOO_PHASE18C_PERSISTENT_SESSION_UPLOAD_SECURITY_FIXED.zip`

## Status legend

- **Open:** confirmed missing or incorrect behavior.
- **Partial:** some foundation exists, but the requested behavior is incomplete or unreliable.
- **Blocked input:** implementation can be planned, but final design needs material from the owner.

## Executive status

All newly reported items are recorded below. Phase 18A1 fixed scheduled-job cancellation safety, Phase 18A2 added mandatory account-action verification, Phase 18A3 repaired refund submission, Phase 18B removed the duplicate provider acceptance from broadcast bookings, and Phase 18C hardened persistent sessions and user-upload quarantine. The highest-risk remaining product area is complete location/map reliability, including server-verified arrival. Applying the upload-security migration and connecting the required independent malware scanner are production release blockers.

## P0 — Booking correctness, money, account access, and security

### 1. Account deactivation and deletion step-up verification — Phase 18A2 code-fixed

The former optional-password bypass and missing mobile confirmation flow are closed in Phase 18A2.

Required behavior:

- Offer **Deactivate temporarily** and **Delete permanently** as distinct actions.
- Require a recent password confirmation or a purpose-bound OTP sent to the verified mobile number/email before either action.
- Support passwordless accounts through OTP.
- Make OTPs one-time, short-lived, rate-limited, and auditable.
- Revoke active sessions after permanent-deletion confirmation; preserve the existing deletion grace period and recovery rules.
- Never reveal whether an unverified phone/email belongs to another account.

Phase 18A2 completion note:

- Temporary deactivation and permanent deletion are now separate, layered-confirmation actions in the shared customer/provider Privacy & Security screen.
- Each action requires either the current password or a fresh six-digit code sent to the account's registered mobile channel or verified email.
- OTPs are HMAC-protected, purpose-specific, short-lived, attempt-bounded, one-time consumed, and protected by request/verification rate limits.
- Successful OTP verification issues a five-minute proof bound to the exact action, authenticated account, role, session, and normalized device ID; a deactivation proof cannot authorize deletion.
- Successful actions are self-audited without recording passwords, OTPs, or verification tokens, and revoke every active session.
- A migration expands the email-purpose constraint and adds a partial unique index so concurrent deletion requests cannot create multiple pending records.
- Code/type verification passed; connected email/SMS/WhatsApp delivery and Android/iPhone acceptance remain release-gate work.

### 2. Refund request temporary error — Phase 18A3 code-fixed

Likely contract mismatches exist between the app and API: the app can submit image data directly where the API expects a private uploaded object, and the app can show bookings that are not payment-eligible for a refund.

Required work:

- Reproduce the exact failure against the deployed API and capture the correlation ID.
- Upload evidence through authenticated private storage before creating the refund request.
- Only show bookings whose payment state is eligible for a refund.
- Calculate and display the valid refundable total, including the correct charge components.
- Preserve idempotency so retrying a temporary failure cannot create duplicate requests.
- Return useful, sanitized validation messages; keep technical details only in logs.

Phase 18A3 completion note:

- The mobile app no longer embeds base64 image data in refund JSON. Optional evidence is uploaded first through authenticated private storage, then only the owned object path is submitted.
- The booking picker now uses a customer-owned server eligibility endpoint. It includes only completed/cancelled bookings with a recorded paid/received payment, hides bookings with an unresolved refund, and subtracts any already-paid refund.
- The form displays service charge, travel/visit charge, already-refunded amount, and the exact maximum remaining refundable amount; the server independently revalidates every rule.
- Client retry identifiers are payload-aware, so a genuine retry returns the original result while reusing an identifier for changed details is rejected.
- A booking-scoped transaction lock plus a new database partial unique index prevents concurrent pending/approved refunds for the same booking.
- Refund writes are account/IP-context rate-limited, inputs are bounded, lists are capped, audit details exclude reason/evidence contents, and API errors remain sanitized.
- Code/type and focused regression verification passed. Applying the migration, reproducing against the deployed API with a correlation ID, real private-storage upload, and Android/iPhone acceptance remain release gates.

### 3. Remove the second provider acceptance — Phase 18B code-fixed

The current broadcast selection can create a `pending` booking, which causes the provider to accept the same work again. This must become one atomic workflow.

Required state rules:

- When a provider accepts the customer's advertised price, the server atomically creates/advances the booking without a second provider confirmation and notifies the customer.
- If multiple providers try to accept at once, only the first valid atomic transaction wins; the others receive a clear "job is no longer available" result.
- When a provider counters and the customer accepts that counter, create an accepted booking immediately; do not return it to the provider for another acceptance.
- If the customer rejects a counter, notify that provider and allow a revised counter with a new version/revision.
- When one provider wins, remove the broadcast from every other provider's live feed immediately, with a foreground-sync fallback if a device missed the real-time event.
- Keep a server-side audit trail of offers, revisions, acceptance, rejection, and the winning transaction.

Phase 18B completion note:

- A provider accepting the customer's exact hourly/travel offer now creates an `accepted` booking in the same database transaction; it never creates the former `pending` booking that required a second provider action.
- Customer acceptance of a provider counter uses the same finalization function and immediately returns the confirmed booking.
- Per-broadcast and ordered customer/provider advisory locks, conditional state updates, active-work rechecks, deterministic booking idempotency, and database uniqueness constraints ensure only one valid winner under duplicate taps or competing provider requests.
- When one provider wins, all other pending responses become `not_selected`; every connected provider receives an opaque invalidation event and offline/foreground list reconciliation removes the filled job.
- Customers can explicitly reject one counter without closing the broadcast. The provider is notified and can submit a changed hourly/travel revision up to the configured bounded revision limit.
- Provider travel counters are now persisted and shown separately from the hourly labor rate. The mobile UI exposes distinct **Accept Offer**, **Counter**, **Accept Counter**, and **Reject** actions with direct **View Booking** navigation after conversion.
- A new append-only offer event table records submission, revision, rejection, withdrawal, cancellation, and winning booking creation without storing private message contents in audit metadata.
- The safe migration deduplicates legacy responses/booking links, promotes legacy broadcast-linked `pending` bookings to `accepted`, adds foreign keys and unique indexes, and extends connected database integrity checks.
- Broadcast writes have a dedicated bounded account/token/device/IP-context rate limit. Code/type, focused regression, and release verification passed; applying the migration plus connected push/realtime and Android/iPhone concurrency acceptance remain release gates.

### 4. Scheduled jobs must never be cancelled using an instant-job timer — Phase 18A1 code-fixed

The current sweeper can cancel an accepted booking after a fixed period without checking whether its scheduled start is still in the future. This explains scheduled work being cancelled because the provider did not mark arrival too early.

Required work:

- Build one timezone-safe scheduled start timestamp on the server.
- Never run a no-arrival cancellation before scheduled start plus a configurable grace period.
- Use separate policies for instant, same-day, and future scheduled jobs.
- Notify both parties before any no-show cancellation and record the reason/audit event.
- Add boundary tests for timezone, daylight/date rollover, rescheduling, and delayed workers.

Phase 18A1 completion note:

- Production now defaults to no automatic cancellation merely because arrival was not pressed.
- The retained opt-in policy is schedule/timezone aware, bounded, fail-closed on invalid schedules, and protected against arrival/update races.
- Code verification passed; connected-service and Android/iPhone acceptance testing remain part of the release gate.

### 5. Arrival must be server-verified by location — Open

The current arrival action does not enforce the requested distance rule.

Required work:

- Send current provider GPS coordinates, accuracy, and timestamp with the arrival request.
- Calculate distance on the server against the customer's validated job coordinates.
- Permit "Mark arrived" only within a configurable radius, initially 1 km.
- Reject stale, impossible, mocked, or excessively inaccurate readings according to a documented policy.
- Provide a support/exception path for poor GPS or an incorrect customer pin; never silently falsify arrival.
- Store only the location evidence required for the booking audit and apply retention/privacy rules.

### 6. Persistent authenticated sessions — Phase 18C code-fixed

The backend has short-lived access tokens and rotating refresh sessions, but the mobile app does not always persist the refresh credential. This can log users out after the app closes.

Required behavior:

- Persist the refresh session securely by default for normal logins.
- Restore the session and refresh silently when the app starts.
- Keep cached, non-sensitive app data visible during temporary network failures instead of treating them as logout.
- Log out only on explicit logout, revoked/expired session, invalid refresh token, account state change, or the single-device policy.
- If desired, use a biometric/PIN relock for privacy without destroying the authenticated session.

Phase 18C completion note:

- Normal password, phone OTP, and email OTP logins continue to remember both access and rotating refresh credentials by default in encrypted device storage; explicit opt-out and explicit logout still remove persistence.
- App startup now restores a missing/expired access credential from the saved refresh session before treating the user as logged out, including after successful biometric unlock.
- Refresh results distinguish an authoritative `400/401/403` rejection from timeout, throttling, malformed upstream success, network loss, and `5xx` unavailability.
- Temporary refresh failure preserves the encrypted credentials and cached user view and returns a retryable service state; it no longer invokes the unauthorized-session cleanup path.
- Explicitly rejected, missing, revoked, expired, device-mismatched, or account-invalid sessions still fail closed and clear private cached state.
- Concurrent refreshes remain coalesced and refresh POSTs are not blindly replayed after an ambiguous network response.
- Focused policy/session regression tests and mobile/server type checks pass. Real background/foreground expiry tests on Android/iPhone and connected 30-day/session-revocation acceptance remain release gates.

### 7. Security foundation and route audit — Partial, continuous

Existing foundations include authenticated sensitive routes, JWT/session validation, token-derived user identity on inspected routes, role checks, security headers, CORS controls, request limits, several rate limits, structured logging, and sanitized general server errors. These are useful controls, but they are not a guarantee against every attack.

Important design correction:

- API paths and request URLs used by a browser or mobile client cannot be hidden from DevTools or network inspection. Security must come from authentication, authorization, ownership checks, least-privilege data responses, validation, throttling, monitoring, and secure transport—not from hiding endpoint names.
- An API key shipped inside a mobile app is not a secret and must not authorize a user's private data. Use server-validated user sessions/tokens and narrowly scoped server-to-server credentials.

Remaining security work:

- Audit every route and socket event for authentication, role, ownership, object-level authorization, and field-level response projection.
- Always derive the acting user from the validated token/session, never a client-supplied user ID.
- Add durable distributed rate limiting by IP and authenticated user/session/token; keep stricter limits for login, OTP, refund, upload, location, and offer actions; return `429` with a safe retry policy.
- Replace ad-hoc validation with centralized schemas for body, path, and query inputs; enforce type, range, length, enum, format, depth, file type/size, and unknown-field rules.
- Add centralized sanitized errors and correlation IDs; never return stack traces, SQL errors, secrets, internal hostnames, or business-rule internals.
- Verify HTTPS redirect/TLS/HSTS behavior in the real production proxy/load-balancer configuration.
- Expand log redaction for passwords, OTPs, tokens, cookies, private addresses, and uploaded content; define retention, access, search, and deletion policies.
- Alert on credential stuffing, unusual failed logins, impossible session/device changes, abusive traffic, admin anomalies, suspicious outbound links, upload abuse, and WebSocket abuse.
- Add SSRF/link allowlisting, malware/content checks where appropriate, storage isolation, database least privilege, backups/restore drills, dependency scanning, and incident-response procedures.
- Add automated negative tests proving users cannot read or change another user's bookings, offers, refunds, messages, invoices, locations, or files.

### 7A. Malicious file upload, quarantine, and bypass protection — Phase 18C code-fixed; scanner deployment required

Client file extensions, picker MIME values, and object-store `Content-Type` metadata are untrusted. A file renamed to `.jpg`, `.pdf`, or `.mp4` must never be accepted only because its headers claim an allowed type.

Required security behavior:

- Keep every direct upload physically isolated and unreadable until the authenticated owner, expected size/type, actual stored metadata, streamed bytes, and malware result are verified.
- Detect file type from magic bytes and reject extension/MIME mismatches, executables/archives disguised as allowed media, active script/polyglot markers, and dangerous active PDF actions.
- Stream inspection with strict byte ceilings and hashing; never load a 200 MB video fully into API memory.
- Require an authenticated independent malware scanner in staging/production and fail closed if it is missing, busy, times out, returns malformed data, or reports a threat.
- Track pending/scanning/clean/rejected/error/expired state, owner, scope, detected type, size, SHA-256, scanner, and safe reason code in a durable database record.
- Permit media persistence and object reads only for a clean owner-bound record. Never let an uncompleted presigned upload bypass scanning by submitting its predictable object path directly to another route.
- Never scan or promote directly from a client-writable key. Snapshot it atomically to a server-only locked quarantine key, scan that immutable snapshot, then promote only those exact bytes to a separate final path so reuse of a still-valid signed PUT cannot overwrite a clean file.
- Disable direct object-store redirects for user uploads so security headers cannot be bypassed; serve verified type with `nosniff`, sandbox CSP, and safe content disposition.
- Rate-limit upload URL and completion actions by combined session/device/IP context, expire unused upload grants, make completion idempotent, and reclaim only stale scan leases.
- Deny unverified legacy uploads in production and run an explicit scan/re-upload migration process instead of silently grandfathering unsafe files.
- Log only object/security identifiers and safe reason codes; never log file bodies, scanner secrets, tokens, or private document contents.

Phase 18C completion note:

- A retry-safe migration adds `upload_security_records`, database-enforced trust-boundary paths, indexed quarantine states, and durable cleanup evidence. All newly issued signed uploads receive an owner/scope-bound pending record before the URL is returned.
- The signed PUT targets only a non-readable incoming key. Completion atomically copies its bytes to a server-only locked snapshot, validates and scans that snapshot, promotes the same verified bytes to a distinct final path, and returns only that final path. Reusing the signed URL cannot mutate the clean object.
- Completion revalidates authoritative request/storage metadata, streams bytes through SHA-256 and byte-signature/active-content checks, deletes rejected temporary objects, and never exposes the final write path to the client.
- Staging and production force `UPLOAD_SCAN_MODE=required`; environment validation, readiness, and deep health require an authenticated HTTPS scanner. Local/test development may use signature-only mode, clearly reported as not deployment-safe.
- Current profile, KYC/service documents, refund evidence, commission/subscription screenshots, support media, chat attachments, booking attachments/videos, and broadcast videos require a clean owner-bound record before persistence.
- Uploaded objects without a clean record are not served. User-upload redirects are disabled, PDFs are attachment-only, and verified images/videos retain inline application use under `nosniff` and sandbox controls.
- Terminal uploads receive an idempotent post-expiry cleanup pass for both temporary keys, including when a signed URL is reused after immediate cleanup; rejected/expired records are retained until cleanup succeeds.
- Renamed executable, image/script polyglot, active-PDF, locked-snapshot/TOCTOU, path-traversal, quarantine cleanup, persistence-gate, deployment-fail-closed, rate-limit, and migration regression coverage was added.
- Applying the migration, provisioning the scanner service/token, validating its raw-stream JSON contract, scanning/re-uploading legacy objects, and connected clean/EICAR/timeout/large-video tests remain mandatory deployment gates. These layered controls materially reduce upload risk; no code can honestly guarantee that every future malware technique is impossible.

## P1 — Location, negotiation, scheduling, and performance

### 8. Correct map placement and lifecycle — Open

The customer booking detail currently renders a fallback map without supplying the real coordinates. The map component is also a static tile mosaic without proper pan/pinch gestures.

Required behavior:

- Immediately after booking acceptance and while the provider is travelling, show the real customer/provider markers, road route, road distance, and ETA where available.
- After verified arrival, collapse the route into an "arrived at site" status; hide the live route/map during in-progress and completed work unless the user explicitly opens location history permitted by policy.
- Pass actual booking coordinates to every map component; never silently default a real booking to the Pakistan center.
- Support pan, pinch zoom, marker focus, route fitting, retry, and a clear external-navigation fallback.
- Use a production map/tile style that exposes available street, area, city, landmark/shop/building labels at appropriate zoom levels.

### 9. Location accuracy and address consistency — Partial

Some booking and negotiation records already carry coordinates and some provider-radius validation exists, but the contract is not consistent across every creation and display path.

Required work:

- Use one canonical address object: formatted address, city, area/locality, latitude, longitude, source, accuracy, and confirmation timestamp.
- Require the customer to confirm the pin and show city/area before broadcasting, negotiating, scheduling, or booking.
- Reverse-geocode coordinates server-side or through an approved service and store a normalized display snapshot.
- Enforce provider service-city/radius eligibility on the server for broadcasts, direct bookings, scheduled jobs, and negotiations.
- Reject missing/out-of-service-area locations before money or acceptance steps.
- Show the confirmed city/area consistently to both customer and provider wherever a job decision is made.

### 10. Negotiation media, location, and price meaning — Open

The mobile app attempts to send negotiation media, but the backend schema/route does not persist it. Location is not consistently rendered as an actionable map, and the amount has no explicit pricing basis.

Required work:

- Add authenticated private media upload IDs/paths to the negotiation API and database; authorize both booking parties and expire access safely.
- Display the same media set and confirmed location/map to both customer and provider.
- Add an explicit pricing basis such as `fixed_total` or `hourly_rate`.
- Keep travel/visit charge as a separately named component rather than an ambiguous second offer amount.
- Display the price basis, rate/quantity if applicable, travel/visit charge, and computed total before acceptance.
- Allow versioned re-counters after a rejection according to the broadcast state rules.

### 11. Scheduled-job reminders and tabs — Open

The existing reminder worker covers approximately one hour before work, not the requested same-day notice and five-hour reminder.

Required behavior:

- Apply the same one-accept booking rules to scheduled broadcasts and counteroffers.
- Add a separate customer **Scheduled** tab with upcoming, today, and past scheduled jobs.
- Show providers a same-day scheduled-job popup/card with service, time, address/city, customer-safe details, and navigation action.
- Send both provider and customer a deduplicated reminder five hours before start.
- Retain or deliberately replace the existing one-hour reminder; document the final reminder schedule.
- Persist separate reminder-delivery timestamps so worker retries cannot send duplicates.

### 12. Fast loading, silent refresh, and scale — Partial

Some caching, compression, paging, polling guards, and the Phase 17 broadcast batching fix exist. Booking and negotiation screens can still reload broad datasets and visibly enter loading state on focus/foreground.

Required work:

- Show cached data immediately and refresh it silently in the background (stale-while-revalidate).
- Reserve full-screen loading for the first uncached load; use small inline states for refresh and pagination.
- Add cursor pagination and incremental/delta sync for bookings, negotiations, refunds, notifications, chats, and other growing lists.
- Prevent duplicate focus/foreground requests and cancel stale in-flight requests.
- Use real-time invalidation for booking/offer changes with a safe foreground reconciliation.
- Select only required response fields, batch related reads, and eliminate remaining N+1 queries.
- Review database indexes and slow-query logs against realistic dataset sizes.
- Add mobile performance budgets and load tests for high concurrency, slow networks, large history, and reconnect storms.

## P2 — Mobile UX, booking cleanup, and invoice

### 13. Completion OTP hidden by keyboard — Open

Keyboard-avoidance code exists, but the reported device behavior remains broken.

Required work:

- Put the OTP entry inside a keyboard-aware, scrollable modal/sheet.
- Apply correct safe-area and keyboard vertical offsets on Android and iOS.
- Keep all OTP boxes and the confirm/error actions visible while typing.
- Test small Android screens, gesture navigation, large accessibility text, and iPhone keyboard variants.

### 14. Provider job-status filter cards are too tall — Open

Required work:

- Replace the oversized cards/chips with compact standard controls (approximately 36–40 px touch height while retaining accessible hit areas).
- Keep the job list visible below the filters on small screens.
- Test horizontal scroll, selected state, text scaling, and all status counts.

### 15. Duplicate booking/history and six-month recommendation — Open

The customer booking history includes a generated "Recommended in about X months" insight, and duplicate-looking booking/history surfaces exist. The reported provider location must also be checked against live data.

Required work:

- Remove the six-month recommendation component and associated calculation.
- Deduplicate API/context results by canonical booking ID without hiding legitimate repeat bookings.
- Use stable list keys and ensure history is represented once per booking.
- Keep **Book Again** only where it is intentional and clearly separate from booking history data.
- Reproduce provider-side duplicate entries and fix the source rather than only hiding duplicates in the UI.

### 16. Remove obsolete offer actions after booking creation — Partial

An accepted negotiation can already create an accepted booking, while the customer offer screen still shows **Complete Booking**, leading into another booking flow.

Required work:

- Once a booking exists, replace offer actions with **View Booking**.
- Remove accepted/converted offers from actionable offer queues.
- Make offer-to-booking conversion idempotent and enforce a unique linkage in the database.
- Reconcile old duplicate records safely before applying the uniqueness rule.

Phase 18B progress: broadcast offers now convert once, close every losing offer, enforce a unique broadcast-to-booking link, and navigate directly to the booking. The separate direct-negotiation offer queue still needs the same final audit and cleanup.

### 17. Branded invoice redesign and official QR verification — Reference received, implementation open

An invoice PDF and invoice screens exist, but the provider invoice view can expose a customer phone number and does not yet match the requested Athoo design. The supplied internet template is a layout reference only; its brand, wording, business fields, and payment QR must not be copied.

Required design rules:

- Use ATHOO's approved blue/orange brand palette and the official transparent-background logo.
- Do not include customer/provider mobile numbers or irrelevant private fields.
- Use Pakistani currency consistently as `PKR` / `Rs.` with safe locale formatting.
- Include only useful invoice data: public invoice number, issue date, booking reference, service description, quantity/hours where relevant, schedule, safe city/area location, service charge, travel/visit charge, legitimate configured discount/tax, total, payment method/status, refund status, and relevant terms.
- Use separate wording/line items where a provider statement needs commission and provider-net information; do not expose internal commission data on a customer invoice unless required.
- Add confirmed public Athoo details only: `athoo.pk`, `official@athoo.pk`, the approved public support number, and verified social handles including the official X account `https://x.com/athoo_services?s=11`.
- Produce consistent mobile, downloadable PDF, and printable layouts.
- Add a professional thank-you message and short instructions: keep the invoice for records, verify through the QR, do not pay outside approved Athoo instructions, and contact official support for disputes.
- State that the invoice is electronically generated and does not require a copied handwritten signature unless legal/accounting review requires one.
- Remove reference-template fields that do not apply to Athoo: GSTIN/HSN placeholders, shipping address, vehicle/e-way/PO fields, product photos, bank details, `Scan & Pay`, marketplace branding, demo declarations, and duplicate phone/address blocks.

QR verification requirements:

- The QR is for **invoice authenticity verification**, not direct payment.
- It must open an HTTPS page on the official configurable Athoo web domain.
- Use an opaque, unguessable, revocable verification reference or signed token; never embed database IDs, customer/provider IDs, phone numbers, addresses, JWTs, API keys, or other private data in the QR.
- The public page returns only a privacy-safe verification result: valid/invalid/revoked, invoice number, issue date, service, safe city/area, amount/currency, payment/refund state, and optional masked party names.
- Protect the verification endpoint against enumeration, tampering, replay abuse, scraping, and excessive scans with signature/expiry or stored-token validation, constant-safe failure responses, rate limits, logs, and revocation history.
- Recalculate or sign the immutable invoice snapshot so later booking edits cannot silently change an already-issued invoice.
- Provide a human-readable verification code below the QR for accessibility and manual verification.

Owner input still needed before final visual certification:

- Confirm the final transparent logo asset to embed and the approved public support number/social links beyond the official X account. Unverified accounts must not be invented.
- Confirm whether Pakistani tax registration/tax lines legally apply. The template's foreign GSTIN/HSN data must never be reused.

## Recommended implementation order

1. **Phase 18A:** scheduled cancellation fix, account step-up verification, and refund repair are code-fixed.
2. **Phase 18B:** atomic one-accept broadcast conversion, offer-to-booking uniqueness, rejected-counter revisions, and real-time removal for losing providers are code-fixed. Direct-negotiation queue cleanup remains under item 16.
3. **Phase 18C:** persistent session resilience and the upload quarantine/scanner firewall are code-fixed. Connected scanner, migration, legacy-media remediation, and device acceptance are mandatory release gates.
4. **Phase 18D:** canonical location model, real maps/routes, server geofenced arrival, scheduled tabs, and reminder workers.
5. **Phase 18E:** cached background refresh, pagination/delta sync, query/index optimization, and realistic load testing.
6. **Phase 18F:** OTP keyboard, compact provider filters, duplicate/history cleanup, and branded invoice after assets are supplied.
7. **Phase 18G:** full production security, observability, abuse-monitoring, device, service, and deployment verification.

Recommended next issue: **items 5, 8, and 9 as one location integrity phase**, because accurate canonical coordinates are a dependency for eligibility, maps/routes, and server-verified arrival.

## Definition of done

No item is complete merely because code was changed. Each item requires:

- API and mobile unit/integration tests for success, failure, retry, permission, and concurrency paths.
- Real Android and iOS device testing where the bug is visual, keyboard-, map-, GPS-, notification-, or lifecycle-related.
- Service-backed testing for maps, uploads, OTP, push, refund/payment, and scheduled workers.
- Migration/rollback planning for database or state-machine changes.
- Security regression tests, sanitized logs with correlation IDs, and no sensitive-data exposure.
- A release verification run plus a short owner acceptance checklist for the affected flow.

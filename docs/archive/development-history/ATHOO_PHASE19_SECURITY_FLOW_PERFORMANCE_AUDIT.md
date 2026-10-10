# Athoo Phase 19 Security, Flow, and Performance Audit

**Input:** `ATHOO_PHASE18C_PERSISTENT_SESSION_UPLOAD_SECURITY_FIXED.zip`
**Candidate:** `ATHOO_PHASE19_SECURITY_FLOW_PERFORMANCE_HARDENED.zip`
**Audit date:** 2026-08-02
**Status:** Code-audited and patched; connected production certification is still required.

## What Phase 19 preserves

Phase 19 keeps the useful Phase 18C persistent-session and secure-upload architecture. It does not revert to older behavior and does not claim comparison with an unavailable or unverified “Phase 24.9” archive.

## Security hardening

- Uploads remain quarantined until a server-only locked snapshot is inspected and an authenticated HTTPS malware scanner reports clean.
- Size, MIME, safe final extension, compound executable extensions, magic bytes, ISO media brands, active PDF actions, image/polyglot markers, hash, and exact byte count are checked.
- Production scanner configuration is fail-closed. Render validates the live process environment before migrations/startup and uses deep readiness.
- Stored uploads require a clean security record. Private evidence is owner/admin only; shared booking, chat, negotiation, and broadcast media requires entity membership or current provider eligibility.
- Legacy account deletion/deactivation endpoints now return `STEP_UP_REQUIRED`; destructive actions use password or verified email/mobile OTP.
- Production HTTP requests are rejected unless the original scheme is HTTPS. Global IP, authenticated-token, upload, auth, account-action, refund, broadcast, map, and invoice-verification limits return sanitized 429 responses.
- Protected route authorization continues to derive identity and role from verified tokens rather than trusting client-supplied user IDs.
- Public invoice verification is the deliberate exception: it requires an HMAC-signed unguessable URL, is rate-limited, and returns no names, phone numbers, addresses, user IDs, or booking secrets.

## Workflow and UX fixes

- Provider acceptance of the customer’s advertised broadcast price creates/advances the booking without a second provider acceptance.
- Customer acceptance of a provider counter creates the booking immediately; rejected counters reopen for a changed revision while the provider is notified.
- Negotiation media, selected location, hourly amount, and travelling amount are persisted and shown to both participants.
- Accepted/rejected negotiations no longer remain as active “complete booking” offers.
- Scheduled work has a separate customer filter, local-date handling, same-day and five-hour reminders for both parties, and future pending work is not expired as an instant request.
- Arrival requires fresh provider GPS within the configurable radius (default 1 km) and configured accuracy.
- Customer booking history no longer renders the six-month recommendation panel; duplicate rows are deduplicated.
- Provider filter cards are reduced to standard height.
- Customer booking data hydrates from a bounded user-keyed cache and refreshes silently; phone numbers and job PINs are stripped before persistence.
- Provider OTP entry uses keyboard-safe layout behavior.
- Accepted booking detail shows route/distance when useful and stops showing the map after arrival/in-progress.

## Invoice implementation

The PDF uses Athoo branding, transparent logo, Pakistani rupees, service and travelling/visit lines, discounts, provider commission/net values where applicable, anti-fraud instructions, configurable official contact destinations, and a real QR that opens official signed verification. Customer/provider mobile numbers are not printed. Pending work is explicitly labelled as an unverified booking summary rather than receiving a decorative verification QR.

## Verification completed here

- Phase 19 focused regression tests: **9/9 passed**.
- Complete API source/regression suite: **499/499 passed** using temporary audit-only AWS SDK stubs. This did not perform real R2 operations.
- TypeScript/TSX syntax parsing: **525/525 files**, zero syntax diagnostics.
- Project, security, operations, release-blueprint, Expo workspace, React Native style, mobile-release, and beta-QA validators passed.
- Invoice HMAC token validation and QR SVG generation passed a local runtime smoke test.

## Mandatory connected gates

1. Clean `pnpm install --frozen-lockfile`, complete typecheck, API/admin builds, Metro/Expo export, and release verification.
2. Neon backup, Phase 19 migration, status, checksum, drift, and integrity checks.
3. Real R2 quarantine/copy/scan/promote/read/delete tests.
4. Production malware-scanner certification using clean media, EICAR/test-malware, renamed executables, polyglots, malformed replies, timeout, overload, and outage cases.
5. Existing-media inventory, hashes, scan, authorization review, clean-record backfill, and rollback manifest before legacy reads are denied.
6. Connected refund reproduction with private evidence.
7. Render/Vercel/EAS, push receipts, maps/geocoding, TURN/calls, email/OTP, monitoring, and signed invoice page verification.
8. Android and iPhone evidence for session persistence, OTP keyboard, map gestures/labels, negotiation media/location, scheduled reminders, arrival geofence, broadcast concurrency, refunds, and invoices.

## Security guarantee

The design adds multiple independent prevention and containment layers. It materially reduces upload and API attack risk, but no responsible production system can promise that every future attack will be impossible. Monitoring, patching, scanner updates, incident response, least privilege, backups, and recurring security tests remain part of the firewall.

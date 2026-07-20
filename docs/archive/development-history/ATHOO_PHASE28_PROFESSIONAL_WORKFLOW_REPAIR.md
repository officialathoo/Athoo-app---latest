# Athoo Phase 28 — Professional Workflow Repair

## Scope

Phase 28 is a regression-safe repair release based on the fully code-certified Phase 27.2 source. It addresses reported customer, provider, calling, chat, document-renewal, authentication, and admin-operations gaps without replacing the vendor-neutral infrastructure introduced in earlier phases.

## Customer and provider repairs

- Refund requests now select only paid/received completed or cancelled bookings, validate the refundable total, use an idempotent client request ID, and upload optional evidence to authenticated private storage before submission.
- Time selection keeps the selected value above a transparent selection outline instead of covering it.
- Provider document-expiry notifications deep-link to the provider verification-document screen.
- Provider Profile now exposes **Verification documents & validity**, where documents and issued/expiry dates can be uploaded or renewed.
- Customer and provider profiles display the account's stable Athoo public ID.
- The welcome journey now presents a simple **Sign in** or **Create account** choice, followed by an explicit Customer or Service Provider role choice.

## Canonical messaging

- Every customer/provider pair now has one canonical chat, regardless of whether it is opened from a profile, booking, notification, or previous conversation.
- A database pair key and unique index prevent new duplicates.
- The migration merges historical duplicate chats into the newest canonical conversation and moves their messages safely.
- Mobile navigation waits for the canonical chat ID before opening the room and removes stale pair duplicates from local state.

## Calling reliability

- Cloudflare TURN remains the primary WebRTC transport.
- Cloudflare TURN now defaults to relay-only ICE transport, avoiding false-positive direct connections on restrictive carrier-grade NAT networks.
- The mobile call watchdog verifies actual inbound audio RTP bytes/packets instead of trusting only the ICE connection state or the presence of a remote track.
- A genuinely negotiating connection receives one short extension; a track that still carries no RTP audio falls back without being trusted indefinitely.
- When media still does not arrive, the authenticated fallback activates after a configurable 3-second default; fallback chunks use an 800 ms default to reduce recorder start/stop gaps.
- Remote tracks are explicitly enabled, speaker routing is reapplied, and WebRTC is accepted as usable only after inbound packets are confirmed.

This code-level repair cannot certify carrier/Wi-Fi audio quality without a new native build and a real Android-to-iPhone cross-network call test.

## Professional admin operations

- A new permission-aware **Operations Inbox** consolidates unresolved admin notifications, inactive-account reviews, provider verifications, document renewals, rate requests, refunds, withdrawals, commission evidence, subscriptions, support tickets, reported issues, service requests, deletion requests, and overdue negotiations.
- Work is sorted unseen-first, then priority, then recency.
- Admins can search by request details, name, internal resource ID, or Athoo public ID; filter by work type, seen state, and date range; select rows; and mark visible or selected work as seen.
- Seen state is persisted per administrator without incorrectly resolving the underlying request.
- Sidebar counts include reported issues and overdue negotiations so outstanding work is visible from any admin screen.
- Core user, provider, complaint, and refund screens now support Athoo-ID search and date filters. Public IDs are displayed in list and detail views.

## Database migration

`20260720_release_phase28_professional_workflow_integrity.sql`

The migration:

- adds and backfills role-prefixed public user IDs;
- adds and backfills canonical chat pair keys;
- merges historical duplicate chats before uniqueness enforcement;
- adds operational queue/date indexes;
- adds per-admin work-item seen records;
- preserves internal UUIDs as the authoritative identifiers.

The database integrity command now checks missing/duplicate public IDs, missing/noncanonical chat pair keys, and duplicate chat pairs.

## Verification performed in the packaging environment

- Full static API/regression test suite: **547 passed, 0 failed**.
- Phase 28 focused regression suite: **8 passed, 0 failed**.
- TypeScript/TSX syntax transpilation: **39 changed files, 0 failures**.
- Project JSON validation passed.
- Release check passed.
- Operations-readiness validation passed.
- Release-blueprint validation passed.
- Security scan passed.
- Expo workspace validation passed.
- React Native style-key validation passed.

## Verification not represented as completed

Package installation could not run in the packaging environment because outbound npm DNS resolution was unavailable. Therefore the complete monorepo TypeScript typecheck, Metro dependency resolution, API/admin build, connected production checks, database migration execution, and physical-device acceptance tests must be run from the user's installed Windows workspace before deployment.

## Required deployment order

1. Install dependencies and run `pnpm run release:verify:code` locally.
2. Apply and verify the database migration.
3. Push the certified source to GitHub.
4. Deploy the API to Render and verify health/readiness.
5. Deploy the admin panel to Vercel.
6. Create a new Android and iOS EAS build; previous Phase 27 builds do not contain these Phase 28 mobile fixes.
7. Complete Android ↔ iPhone calls on separate networks, refund submission, canonical chat, notification deep-link, document renewal, auth-flow, and Operations Inbox acceptance tests.

Email delivery remains intentionally deferred until Brevo domain authentication and Render `http_json` environment configuration are complete.

## Phase 28.1 verification hardening

The release verification pass found that the secure first-admin bootstrap and development seed paths did not yet supply the new non-null `users.public_id` field. Phase 28.1 now generates the same role-prefixed 64-bit public-ID format for every user-creation path and backfills existing accounts into a consistent `CUS|PRO|ADM-<16 hex>` format before the unique index is enforced. This prevents bootstrap/seed failures after the Phase 28 migration and keeps displayed identifiers consistent.

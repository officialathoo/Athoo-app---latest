# Athoo Deep Audit and Remediation Plan

## Goal
Deliver a production-ready Athoo platform in which customer, provider, API, database, realtime messaging, push notifications, calling, storage, and admin operations work as one complete system with professional UX and no dead navigation or disconnected workflow.

## Audit scope completed in this pass
- Monorepo/workspace structure and release scripts
- Customer and provider mobile routing and tab layouts
- Authentication/profile data flow
- Provider service/rate request flow
- Broadcast creation, matching, realtime delivery, DB notifications, and push delivery
- Chat creation, message delivery, push notification, realtime events, read status, keyboard behavior, and badges
- Negotiation API and mobile submission path
- Call signaling, WebRTC configuration, and audio fallback architecture
- Mobile notification sound configuration and routing
- Admin notification list and click navigation
- Database schemas and migration/release tooling presence
- Packaging hygiene and secret/generated-file exposure

## Confirmed critical issues and reasons

### 1. Broadcasts can be created but providers may not receive them
Reason: provider delivery is filtered by approval, blocked/deactivated status, active work, service matching, provider coordinates, and configured radius. Any stale/missing service slug or location silently excludes the provider. Push also requires a valid stored Expo token and a rebuilt native app containing the configured notification channels/sounds. The previous notification link format was inconsistent with mobile routing.

### 2. Provider hourly rate appears unchanged to customers
Reason: provider rate edits are approval requests, not direct public-profile mutations. The previous UI did not clearly distinguish the active public rate from the pending requested rate, and customer discovery/profile screens did not refresh immediately after approval. Phase 2 now labels this as one general profile rate, displays approval state, and broadcasts approved changes to connected clients.

### 3. Multiple provider categories are not fully represented
Reason: the data model supports multiple services, but several customer-facing screens previously treated the first service as the silent default. Phase 2 keeps multiple selection, renders all approved services, requires an explicit service for negotiation/booking/chat context, and removes first-service assumptions from customer workflows.

### 4. Notification ringtone and message tune are unavailable
Reason: source configuration includes WAV assets and channel policies, but Android notification channel sound changes require a fresh native build/install and a new channel version. Existing installed channels retain old/no sound settings. Foreground in-app sound and background push sound are separate systems.

### 5. Keyboard covers the chat typing field
Reason: both chat-room screens only used keyboard avoidance on iOS. Android had no resize behavior in the React Native screen, so the input could remain behind the keyboard.

### 6. Voice call connects without transferring usable voice
Reason: WebRTC is attempted, but reliable media requires native WebRTC builds plus working ICE negotiation. The API health previously showed TURN unconfigured. STUN-only calling frequently fails across mobile networks/NAT. The fallback relays short audio chunks through process memory, which is not horizontally scalable and can break on Render restarts or multi-instance deployment.

### 7. Messages appear only after opening the conversation
Reason: the server emits realtime events and creates push notifications, but successful background delivery depends on a valid Expo token, notification permission, native channel configuration, and app build. Realtime sockets can sleep in background, so push is mandatory. Failures were previously swallowed in some paths, reducing diagnostics.

### 8. Negotiation submission reports “couldn’t submit”
Reason: negotiation creation has strict server conditions: customer role, location/date/time, valid provider, provider availability, no active work conflict, no duplicate active negotiation, and accepted numerical values. The UI collapses several server failures into one generic message, preventing users and support from seeing the actual blocking reason.

### 9. Chat/message count is missing or inconsistent
Reason: `/api/chat` returned chat rows without per-chat unread counts. The tab badge depended on notification state instead of authoritative unread messages, and the chat list had no unread badge.

### 10. Admin notification click opens the wrong area or does nothing
Reason: the admin bell navigated directly to the stored backend link. Backend notifications can use API/mobile-style links such as `/admin/...`, `/bookings/:id`, or other shapes that do not match Wouter admin routes.

### 11. Sensitive and generated files are included in the ZIP
Reason: root `.env`, mobile `.env.local`, Expo debug/error output, and exported web build artifacts are present. Production handoffs must exclude secrets, local runtime files, caches, exports, and old reports unless intentionally archived.

### 12. Release evidence is stronger than runtime evidence
Reason: the repository contains many certification documents and static regression tests, but several real-device failures remain. Source-level certification cannot replace connected API/database/push/TURN testing on one Android and one iPhone.

## Fixes applied in this pass
1. Added authoritative per-chat unread counts to the chat API.
2. Added unread count support to the mobile Chat model.
3. Incremented unread counts on incoming realtime messages when the chat is not active.
4. Reset unread count immediately when a chat is opened/read, with server reconciliation fallback.
5. Added unread badges to customer and provider chat lists.
6. Enabled Android keyboard avoidance (`height`) on both customer and provider chat-room screens.
7. Normalized admin notification links to real admin routes and added type-based fallbacks.
8. Aligned broadcast notification links with the broadcast route naming used by the mobile resolver.

## Phase 2 completion — Provider profile correctness
Completed against `ATHOO_DEEP_AUDIT_PATCHED_PHASE1.zip`:

1. Customer provider cards now display all approved categories, with compact overflow text when necessary.
2. Provider details render every approved service and allow the customer to choose the exact service used for chat, negotiation, and booking.
3. Negotiation no longer silently falls back to the first category; multi-service providers require explicit service selection.
4. The provider edit screen separates the active public hourly rate from a pending requested rate and displays pending/rejected/approved review states.
5. The single public rate is explicitly modeled in the request workflow as a `general` profile rate instead of being attached arbitrarily to the first approved service.
6. Admin approval emits provider update events to customers and the provider, and customer discovery/profile screens refresh immediately.
7. Newly approved service categories trigger a filtered-provider refetch, allowing newly eligible providers to appear without restarting the app.
8. Direct provider-detail API access now excludes unapproved, blocked, deactivated, and non-provider accounts.
9. Admin request review mutations invalidate provider and sidebar query caches.
10. Negotiation submission surfaces safe server validation messages instead of only a generic failure.

Phase 2 source validation: 12 changed TypeScript/TSX files parsed successfully, 21 targeted regression tests passed, project JSON validation passed, React Native style validation passed, and the repository security scan passed. Full dependency-aware typecheck/build and connected device tests remain required.

## Phase 3 completion — Notifications, broadcasts, sounds and destinations
Completed against `ATHOO_PHASE2_PROVIDER_PROFILE_FIXED.zip`:

1. Consolidated both admin broadcast paths onto persisted in-app notifications, realtime delivery, and Expo push.
2. Added strict audience normalization and rejection so invalid values can never silently target all users.
3. Added channel-by-channel delivery evidence for admins: in-app, online, token, push accepted/failed, fallback, invalid token, and receipt queue state.
4. Unified provider eligibility across initial delivery, expanded delivery, list, detail, and response submission.
5. Added exact normalized matching for canonical service slugs and older exact display-name records.
6. Added durable delayed expanded-radius notification delivery.
7. Added Expo push-receipt processing and stale-token cleanup.
8. Enforced one Expo device token per account through an API transaction and database unique index.
9. Added deduplicated native local fallback when an online user has no token or push fails.
10. Rotated Android notification channels to v4 for distinct job, message, general, and call sounds.
11. Added concrete chat/broadcast notification deep links and provider request prioritization.
12. Synchronized root and mobile EAS profiles.

Phase 3 validation: 388 full API/source regression tests passed, 7 targeted Phase 3 tests passed, 17 changed TS/TSX files parsed successfully, and project/security/style/Expo/release static checks passed. Native builds, connected Expo delivery, Neon migration execution, and physical-device testing remain required.

## Phased remediation plan

### Phase 1 — Release blockers and observability
- Complete chat unread source-of-truth integration for both tab badges and notification list.
- Return/log structured broadcast matching diagnostics for admins without exposing private provider data to customers.
- Surface exact negotiation validation errors in mobile UI.
- Add push-token registration health, last-success timestamp, invalid-token cleanup visibility, and admin diagnostics.
- Remove secrets/generated files from release packages and rotate any exposed credentials.

### Phase 2 — Provider profile correctness
- Keep multiple category selection.
- Render all approved categories on every customer provider card/detail/search result.
- Define category-specific rates or explicitly label the single rate as the provider’s general hourly rate.
- Make pending rate/service approval status visible to provider and admin.
- Invalidate/refetch provider discovery and profile queries immediately after admin approval.

### Phase 3 — Notifications and sounds (source implementation complete; connected acceptance pending)
- Completed push-token ownership, receipt verification, delivery diagnostics, channel v4 configuration, local fallback, and canonical destination routing.
- Still required in the connected environment: apply migration, deploy API, create fresh native builds, and test Android/iOS foreground/background/terminated delivery and sounds.

### Phase 4 — Realtime chat and negotiation reliability
- Add reconnect/resubscribe handling and delivery telemetry.
- Use message unread counts from DB for tab badges; notifications remain a separate inbox.
- Add delivery/read receipts and retry status to chat UI.
- Add negotiation idempotency key, field-level errors, duplicate recovery, and exact failure messaging.

### Phase 5 — Production calling
- Configure a vendor-agnostic TURN abstraction and production TURN credentials.
- Exchange ICE candidates reliably and verify remote tracks/audio routing on both platforms.
- Remove the in-memory HTTP audio relay as a production dependency or move fallback media to a durable/realtime media service.
- Test speaker/earpiece, mute, Bluetooth, interruptions, backgrounding, timeout, decline, and reconnect.

### Phase 6 — Admin operations and professional UX
- Canonical admin destination mapping for every notification type.
- Detail drawers/pages for referenced entities, not only list-page redirects.
- Consistent loading, empty, error, pagination, filters, toasts, and permission gates.
- Cross-platform design review for spacing, typography, cards, dark/light themes, and accessibility.

### Phase 7 — Connected production certification
- Apply and verify DB migrations on Neon.
- Deploy API to Render and admin to Vercel.
- Validate R2 upload/download lifecycle.
- Run end-to-end customer/provider workflows on one Android and one iPhone.
- Verify push while app is foregrounded, backgrounded, and terminated.
- Verify calling on different networks using TURN.
- Record evidence and only then approve production release.

## Validation limitation in this environment
Dependencies were not included in the ZIP and package installation could not access the npm registry from the audit environment. Therefore full `pnpm test`, `pnpm typecheck`, builds, database verification, and native device tests must be run in the connected development environment before release. Static source inspection and targeted patches were completed, but production certification is not honestly possible without those executions.


## Phase 4 completion — Chat and negotiation reliability

Status: source remediation complete.

Completed: negotiation coordinate resolution, request idempotency, duplicate recovery, chat delivered/read synchronization, active-room unread handling, reconnect fallback preservation, and database indexes. Full source regression result: 391/391 passed. Connected Neon, deployment, and real-device certification remain required.


## Phase 5 status — Voice calling
Completed in source: ICE buffering, WebRTC/fallback arbitration, native mute/audio routing, signaling hardening, and TURN readiness reporting. Connected TURN deployment and two-device cross-network certification remain required.

## Phase 6 completion — Admin operations and exact notification destinations

Status: source remediation complete against `ATHOO_PHASE5_VOICE_CALL_FIXED.zip`.

Completed:
1. Centralized admin notification persistence and realtime delivery.
2. Rejected unsafe/external admin links and normalized internal destinations.
3. Added exact entity focus/open behavior for subscriptions, commission payments, support tickets, service/deletion requests, users, providers, leads, bookings, negotiations, refunds, withdrawals, verification, rate requests, and reported issues.
4. Added premium user/plan context, reference-number visibility, and authenticated screenshot access.
5. Added persistent support evidence, booking/upload ownership validation, assignment validation, resolution rules, replies, filters, and authenticated evidence viewing.
6. Corrected Requests and Complaints sidebar counts.
7. Canonicalized legacy permission aliases and reorganized the admin permission editor.
8. Added `20260716_support_premium_admin_integrity.sql` and updated the latest-migration contract.

Validation: 11/11 targeted Phase 6 tests and 406/406 complete API/source tests passed; 30 changed TS/TSX files passed syntax validation; project, security, style, mobile, Expo workspace, and release static checks passed.

Connected migration, builds, deployment, browser E2E, and R2 acceptance remain required.

## Next phase — Platform security, session governance, and production release hardening
- Re-audit one-device session enforcement across mobile, API, sockets, push tokens, biometric unlock, sign-out, app restart, and admin revocation.
- Close remaining session blinking/navigation restoration failures.
- Audit rate limits, abuse controls, audit retention, PII exposure, and account lifecycle jobs.
- Verify build/deployment portability and environment validation.
- Complete professional cross-platform UX consistency and accessibility review.
- Finish connected Neon/Render/Vercel/R2/Android/iPhone release certification.

## Phase 7 completion — Session governance, biometric lock and startup stability

Status: source remediation complete against `ATHOO_PHASE6_ADMIN_OPERATIONS_FIXED.zip`.

Completed:
1. Enforced exactly one active session per account in application transactions and with a partial unique database index.
2. Added stable secure mobile and admin-web device identity to login, refresh, authenticated API, protected storage and purpose-token flows.
3. Added device-aware refresh rejection, login-history evidence and new-device alert deduplication.
4. Closed displaced event/call WebSockets immediately and added cross-instance session heartbeat validation.
5. Rebuilt biometric login as a true lock over a remembered encrypted session, including background relock.
6. Made logout idempotent, cache-safe, push-safe and bounded without blocking local sign-out.
7. Centralized all auth/role/startup navigation under the root session route guard and removed competing redirects.
8. Added `20260716_user_session_device_biometric_integrity.sql` and updated the authoritative latest-migration contract.

Validation: 10/10 Phase 7 targeted checks, 416/416 complete regression tests, and 30/30 changed TypeScript/TSX syntax checks passed. Project, security, React Native style, Expo workspace, mobile release and release configuration checks passed.

Connected migration execution, dependency-aware typecheck/build, deployment, and Android/iPhone acceptance remain required.

## Next phase — Professional UX, accessibility, lifecycle automation and final release certification

- Complete cross-platform spacing, typography, card, keyboard, loading, empty/error and dark/light consistency audit.
- Complete accessibility labels, focus order, contrast, dynamic text and touch-target review.
- Audit inactive-account alerts/restrictions/deletion lifecycle, policy acknowledgements and scheduled operational jobs.
- Run dependency-aware typecheck/build and connected Neon/Render/Vercel/R2 validation.
- Execute full customer/provider/admin E2E on Android and iPhone, including notifications, chat, negotiations, calls, finance, support and account governance.
- Generate final production evidence and release/no-release decision.

# Athoo Phase 3 — Notifications, Broadcast Delivery, Sounds and Deep Links

## Baseline

This phase was implemented only on the latest approved baseline:

`ATHOO_PHASE2_PROVIDER_PROFILE_FIXED.zip`

The resulting package becomes the next canonical Athoo baseline after final packaging and validation.

## Objective

Make provider job broadcasts, admin announcements, chat/general notification delivery, native sounds, push-token ownership, and notification destinations operate through one traceable and secure delivery system.

## Root causes confirmed

### Provider broadcasts were not reliably reaching providers

A broadcast could be saved successfully while zero eligible providers received it. Delivery was filtered by provider approval, account status, active work, selected services, coordinates, platform radius, and provider travel radius. These exclusions were not returned clearly to the caller. Initial and expanded-radius delivery also did not share one complete eligibility policy.

### Admin had two incompatible broadcast paths

One admin page used persisted in-app notifications and another sent raw Expo pushes only. Their audience names differed. Singular values such as `provider` or `customer` could be interpreted incorrectly, and an invalid audience could fall through to all users.

### “Sent” did not represent actual delivery

Some screens counted database notification rows as sent while another path counted push tickets. The admin could not distinguish in-app creation, online realtime recipients, registered push tokens, accepted Expo tickets, failures, or local-fallback signals.

### Native notification sounds were pinned to immutable Android channels

Android keeps the original sound and importance of an existing notification channel. Updating a WAV file or source configuration without creating a new channel generation cannot repair an already installed channel.

### Expo tickets were accepted without receipt verification

Immediate ticket errors were handled, but delayed Expo receipts were not checked. Tokens that became unregistered after ticket acceptance could remain stored and continue failing silently.

### A push token could remain attached to more than one account

When a device switched Athoo accounts, its Expo token could exist on multiple users. That creates cross-account delivery risk and makes notification troubleshooting unreliable.

### Foreground realtime delivery could be silent

When an online native user had no token, or Expo rejected the push, the realtime event reached the app but did not consistently create a native local alert with the correct channel and sound.

### Notification destinations were incomplete

Concrete links such as `/chat/:id` and `/broadcasts/:id` were not fully resolved to role-specific mobile routes. A provider opening a job alert could land on a generic screen without the referenced request prioritized.

## Changes completed

### 1. Unified notification delivery evidence

`notifyUser` and `notifyUsers` now report separate, explicit delivery facts:

- notification row created
- recipient found
- push token present
- online realtime connection present
- Expo ticket accepted
- push failed
- invalid token detected
- receipt verification queued
- native local fallback signaled

Admin broadcast responses and UI toasts now use these real delivery channels instead of one ambiguous sent number.

### 2. Consolidated admin broadcasts

Both admin broadcast routes now use the same persisted notification, realtime, and Expo push service.

- Platform announcements use `type: system`.
- They open the Notifications screen rather than the provider job-broadcast screen.
- Blocked and deactivated users are excluded.
- Audience values are normalized safely.
- Invalid audiences return `INVALID_BROADCAST_AUDIENCE` and never default to all users.
- Specific recipient broadcasts remain restricted to customer/provider accounts.

### 3. Provider broadcast eligibility and diagnostics

One shared provider-matching function now controls initial delivery, expanded-radius delivery, list visibility, detail access, and response submission.

It verifies:

- provider role and approved verification
- non-blocked and non-deactivated account
- no conflicting active work
- exact normalized service/category match
- compatibility with older exact display-name service records
- provider and customer coordinates
- platform radius and provider maximum travel radius

The creation response records candidate count, matched count, notification rows, push-token count, accepted pushes, failed pushes, online recipients, fallback signals, queued expansion, and exclusions grouped by reason.

### 4. Delayed expanded-radius delivery

A durable `broadcast_expand_notifications` queue job now delivers the request to newly eligible providers in the configured expanded radius after the configured delay. It does not resend to providers who were already inside the initial radius.

### 5. Expo receipt processing

A durable `expo_push_receipts` queue job now checks Expo push receipts after ticket acceptance.

- `DeviceNotRegistered` tokens are removed.
- Missing/not-ready receipts are retried through the durable queue.
- Timeouts, attempts, delays, and receipt endpoint are configuration-driven.
- No provider-specific URL or credential is hardcoded into business logic.

### 6. One device token, one account

Push-token registration now runs transactionally:

1. Clear the same token from other accounts.
2. Assign it to the authenticated account.

Migration `20260716_push_token_delivery_integrity.sql` cleans historical duplicates and creates a partial unique database index on nonempty Expo push tokens.

### 7. Native fallback for online users

Realtime notification payloads state whether native push is expected. The mobile app schedules a native local notification only when:

- the user has no registered push token, or
- Expo immediately rejects/fails the push.

Fallbacks are deduplicated by notification ID. A real native push cancels a pending fallback, reducing duplicate alerts.

### 8. Android channel generation v4

The notification channels are now:

- `jobs-v4`
- `messages-v4`
- `general-v4`
- `calls-v4`

The previous v2/v3 channels are listed for cleanup. Job, chat, general, and call notifications retain separate WAV assets, vibration patterns, importance, and channel policies.

### 9. Concrete notification routing

Mobile routing now understands concrete chat and broadcast identifiers.

- `/chat/:id` and `/chats/:id` open the correct role-specific chat room.
- `/broadcast/:id` and `/broadcasts/:id` open the provider broadcast list with that request prioritized.
- Customer broadcast payloads open the referenced broadcast status.
- Admin platform announcements open Notifications.

### 10. EAS configuration synchronization

Root `eas.json` and `athoo-app/eas.json` are synchronized again so release commands cannot pick different build profiles depending on the working directory.

## Database action required

Before deploying the updated API, apply:

`deploy/migrations/20260716_push_token_delivery_integrity.sql`

Use the repository migration command in the connected environment and then run database verification/integrity checks.

## Native rebuild required

This phase changes bundled notification sounds and Android notification channel IDs. A JavaScript/OTA update cannot install those native sound resources or recreate channel policies.

A new Android and iOS binary must be built and installed. Android should create v4 channels on first launch and remove deprecated v2/v3 channels where the OS permits it.

## Validation completed

- Full API/source regression suite: **388 passed, 0 failed**.
- Phase 3 targeted regression suite: **7 passed, 0 failed**.
- Changed TypeScript/TSX syntax transpilation: **17 passed, 0 failed**.
- Project JSON validation: passed, 33 JSON files checked.
- Security scan: passed.
- React Native style-key validation: passed.
- Expo workspace validation: passed.
- Mobile release validation: passed.
- Release configuration/synchronization check: passed.
- Sound assets exist and have distinct SHA-256 hashes.
- No actual `.env`, `.env.local`, `.env.production`, or `.env.development` file is present in the clean source tree.

## Validation not possible in this environment

The clean baseline contains no `node_modules`, and Corepack attempted to download pnpm 10.33.2 from npm. This environment could not resolve `registry.npmjs.org`. Therefore the following connected/dependency-aware checks could not be completed here:

- workspace `pnpm test` wrapper
- full TypeScript typecheck with installed package declarations
- API/admin production builds
- Metro configuration loading through `expo/metro-config`
- Expo native builds
- Neon migration execution and integrity verification
- real Expo push and receipt delivery
- foreground/background/terminated testing on Android and iPhone

The standalone Node test runner completed the full 388-test API regression suite successfully, but production certification still requires the connected checks above.

## Required real-device acceptance checks

1. Sign in as customer and provider on separate physical phones.
2. Confirm each account stores only its own current Expo token.
3. Send a customer job broadcast and verify the provider receives it while foregrounded, backgrounded, and terminated.
4. Confirm job alerts use the job tune and open the exact broadcast request.
5. Send chat messages in both directions and confirm the message tune and exact chat destination.
6. Send an admin provider-only announcement and confirm no customer receives it.
7. Send customer-only and all-user announcements and compare admin delivery counters with recipients.
8. Test a provider outside the initial radius but inside the expansion radius.
9. Test blocked, deactivated, unapproved, busy, wrong-category, no-location, and outside-travel-radius providers; each must be excluded.
10. Confirm v4 notification channels exist in Android system notification settings.

## Next phase

Phase 4 will address realtime chat and negotiation reliability: reconnect/resubscribe behavior, delivery/read state, authoritative badges under background recovery, negotiation idempotency, duplicate recovery, and field-specific submission errors.

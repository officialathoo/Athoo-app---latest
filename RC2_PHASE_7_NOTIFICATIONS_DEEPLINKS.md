# Athoo RC2 Phase 7 — Notifications, Deep Links, Background Delivery and Sounds

## Baseline

This phase was applied directly to `ATHOO_RC2_PHASE_6_ADMIN_PANEL_COMPLETION.zip`.

## Implemented

- Bundled four genuinely distinct native notification sounds:
  - job and booking alerts;
  - chat messages;
  - general updates;
  - incoming calls.
- Replaced the previously duplicated in-app MP3 assets with distinct ringtone, message, notification, and success sounds.
- Added versioned Android notification channels so installations do not retain legacy default-sound channel settings:
  - `jobs-v2`;
  - `messages-v2`;
  - `general-v2`;
  - `calls-v2`.
- Added one server-side push policy that chooses channel, sound, priority, and TTL from notification type.
- Added per-recipient notification IDs to push payloads, including bulk broadcasts.
- Added a single allowlisted, role-aware mobile notification route resolver.
- Added foreground native notification ingestion and WebSocket/push de-duplication.
- Added foreground resynchronization after notifications arrive while the app is backgrounded.
- Added badge count synchronization.
- Added killed/background-app incoming-call push recovery with a 35-second TTL.
- Expanded customer and provider notification card icons for broadcast, Premium, calls, refunds, withdrawals, support, and invoices.

## Security and reliability

- Arbitrary notification links are not passed directly to Expo Router.
- Unknown or malformed links fall back to the authenticated role home screen.
- Push data contains the database notification ID so notification taps can mark the correct record read.
- Stale Expo tokens continue to be removed after `DeviceNotRegistered` responses.
- Call push notifications expire with the same 35-second limit used by the server call lifecycle.

## Verification completed in the packaging environment

- Project configuration validation: passed (24 JSON files).
- Changed TypeScript/TSX transpilation and syntax validation: passed.
- Phase 7 focused tests: 8 passed, 0 failed.
- Complete API/source regression suite: 257 passed, 0 failed.
- ZIP integrity verification: required after packaging.

## Remaining deployment and device gates

The clean source package does not include installed dependencies or production credentials. Run the normal workspace typecheck/build after extraction. Real-device testing is still required for:

- Android custom sounds on a newly installed Phase 7 build;
- iOS custom sounds and badge behavior;
- foreground, background, and killed-app notification delivery;
- customer/provider notification deep links;
- incoming-call recovery while the app is backgrounded or killed;
- notification permission denial and Settings recovery;
- Expo token registration and invalid-token cleanup against the deployed API.

Because Android notification channel sound settings are immutable after channel creation, Phase 7 uses new `-v2` channel IDs. A fresh APK/IPA build is required; an old APK cannot receive the newly bundled sound resources.

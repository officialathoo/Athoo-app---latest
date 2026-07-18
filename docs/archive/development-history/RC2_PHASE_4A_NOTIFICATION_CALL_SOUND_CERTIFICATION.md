# Athoo RC2 Phase 4A — Notification and Call Sound Certification

## Baseline

This cumulative phase was built only from:

- `ATHOO_RC2_PHASE_3D_THEME_PORTABILITY_CERTIFIED.zip`
- SHA-256: `365437e3e71850dafbe4504bea701192f39a26e38960218226874db6a20c2d25`

No older ZIP was used.

## Scope completed

### Native notification runtime

- Corrected Expo Go detection so EAS development clients and internal native builds are no longer incorrectly treated as Expo Go merely because they run in development mode.
- Centralized job, message, general, and call notification policies.
- Added build-time configurable channel IDs, names, sound files, vibration patterns, light colors, and sound asset paths.
- Upgraded default Android notification channels from version 2 to version 3 because Android does not reliably apply changed sound/importance settings to an existing channel.
- Added safe cleanup of configured deprecated channel IDs.
- Preserved distinct bundled WAV assets for jobs, messages, general alerts, and calls.
- Added safe notification diagnostics for project ID, permission, policy, and channel state.

### Server push portability

- Made the Expo push endpoint configurable through `PUSH_PROVIDER_ENDPOINT`.
- Made push timeouts, batch size, retry policy, badge count, channel IDs, sounds, and TTL values configurable.
- Added bounded validation for numeric and identifier settings.
- Added support for explicitly disabling push without changing business code.
- Exposed safe push configuration status through standard and deep health responses.

### Duplicate alert correction

- Removed local native notification scheduling and manual sound playback from booking, negotiation, broadcast, and navigator-level realtime handlers.
- Native builds now use server remote push as the single owner of OS notification audio.
- Web and Expo Go retain one controlled in-app sound fallback.
- Existing notification-ID deduplication remains active for WebSocket and Expo push delivery.

### Call audio correction

- App-managed ringtone now runs only while the app is active.
- When the app backgrounds, the in-app ringtone stops and the native call notification channel owns background audio.
- The ringtone resumes when returning to the foreground while a call remains incoming or outgoing.
- Alert audio mode is reapplied before each playback instead of relying on stale initialization state.
- One-shot sounds are tracked and unloaded safely.
- Starting call recording stops ringtone and stale one-shot sounds before enabling recording mode.
- Alert audio is routed away from the Android earpiece.

### Configuration and safety

- Added all portable notification settings to `.env.production.example` and `render.yaml`.
- Environment validation now rejects insecure push endpoints, duplicate channel IDs, malformed channel IDs, and invalid sound filenames.
- No real credentials or provider secrets were added.
- No database migration was required.

## Verification evidence

- Changed TS/TSX syntax transpilation: **17 passed, 0 failed**
- Focused notification/call tests: **13 passed, 0 failed**
- Complete API/source regression: **353 passed, 0 failed**
- Project JSON validation: **31 passed**
- Release check: **passed**
- Mobile release validation: **passed**
- Closed-beta QA validation: **passed**
- Operations readiness: **passed**
- Security scan: **passed**
- Valid notification environment fixture: **passed**
- Duplicate-channel environment fixture: **correctly rejected**
- Sound assets inspected: **8 bundled files**, with four distinct native WAV hashes

## Certification boundary

This phase is source-certified for notification and call-sound configuration, deduplication, and runtime ownership. Physical-device testing is still required for:

- Android foreground, background, and killed-app notifications
- iPhone foreground, background, and killed-app notifications
- Android notification channel sound behavior after uninstall/reinstall
- Incoming call ringing, answer, reject, timeout, and remote hangup
- Device silent/DND behavior, which remains controlled by the operating system and user settings

A new native build is mandatory because notification sound assets and Android channels are build-time native configuration.

## Next phase

Phase 4B will build the vendor-agnostic transactional email system on this exact Phase 4A baseline: Zoho SMTP configuration, email verification, email OTP alternative, welcome/security/account emails, delivery queue, retries, logs, preferences, and safe admin controls.

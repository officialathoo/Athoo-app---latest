# Athoo Android/iOS Device Acceptance Runbook

This runbook validates the exact Phase 28.5 release candidate on one physical Android phone and one physical iPhone. Do not reuse evidence from an older ZIP, commit, EAS Update group, Render deploy or Vercel deploy.

## 1. Build preparation

```bash
pnpm install --frozen-lockfile
pnpm device:prepare
APP_ENV=staging EXPO_PUBLIC_API_BASE_URL=https://<staging-api> EAS_PROJECT_ID=<id> pnpm mobile:validate
```

Use one of these two release paths from the same commit:

1. Preferred final-binary acceptance after quota/reset:

```bash
eas build --profile preview --platform android --clear-cache
eas build --profile preview --platform ios --clear-cache
```

2. OTA-compatible acceptance while reusing the existing preview binary:

```bash
eas update --channel preview --environment preview --message "Phase 28.5 release hardening"
```

For OTA testing, record the base EAS build ID **and** the EAS Update group ID/runtime version. Both devices must load the same update before cross-role tests. Native dependency, permission, notification-channel or bundled-resource changes still require a fresh binary. Use dedicated customer, provider and administrator acceptance accounts. Do not use personal production accounts.

## 2. Initialize evidence from the exact ZIP

```powershell
pnpm device:evidence:init -- --artifact .\ATHOO_PHASE28_5_2_RELEASE_METADATA_FIXED.zip --release-version <release-version> --commit <full-git-sha>
```

This computes the ZIP checksum and creates every required Android, iOS and cross-role evidence record. Do not delete cases or rename IDs.

## 3. Automated navigation smoke

```bash
ATHOO_APP_ID=com.athoo26436.athooapp \
BETA_CUSTOMER_IDENTIFIER=... BETA_CUSTOMER_PASSWORD=... \
maestro test .maestro/customer-device-smoke.yaml

ATHOO_APP_ID=com.athoo26436.athooapp \
BETA_PROVIDER_IDENTIFIER=... BETA_PROVIDER_PASSWORD=... \
maestro test .maestro/provider-device-smoke.yaml
```

Automated navigation is supplemental. It does not replace physical evidence for push delivery, map tiles, GPS, biometric prompts, sounds or two-way voice.

## 4. Original-defect acceptance matrix

Execute the full JSON checklist. The following sequences are mandatory because they reproduce the reported release blockers.

### Map rendering and provider location

1. Fresh-launch the provider app with location enabled.
2. Open every map screen and confirm streets/tiles render behind the marker; a gray/white surface with only a red dot or attribution fails. Pan and zoom to force additional tile requests.
3. Record the device's current coordinates and accuracy.
4. Move or simulate a meaningful location change, foreground the app, and verify the provider profile coordinates update.
5. Turn **Available for Jobs** off and on and confirm another fresh location synchronization occurs.
6. Close and reopen the app. The location must refresh without requiring the provider to edit the city.

### Radius persistence and matching

1. Set provider radius to a non-default value such as 8 km.
2. Refresh, background, terminate and reopen the app.
3. Confirm the same value remains visible and is returned by the API.
4. Create a customer request inside the selected radius and verify provider eligibility.
5. Create a controlled request outside the selected radius and verify exclusion.
6. Change the radius, refresh provider location, and repeat broadcast delivery to prove the new value affects matching.

### Broadcast and notification delivery

1. Keep the provider approved, active, available, category-matched and not busy.
2. Create a customer job request within radius.
3. Verify provider receipt in foreground, background and killed states.
4. Verify sound/channel, one notification only, correct content and exact deep-link destination.
5. Repeat after token refresh, app restart and provider radius change.
6. Record server delivery diagnostics and Expo receipt evidence alongside device video.

### Single-device revocation and biometrics

1. Log the same account into phone A.
2. Enable biometric unlock and prove app restart requires successful device authentication.
3. Log the same account into phone B.
4. Phone A must lose HTTP, WebSocket, notification registration and call access and return to login without manual logout.
5. Phone A biometric unlock must not restore the revoked session.
6. Verify biometric enable, unlock, fallback and disable paths on each supported platform.

### Calls and voice

1. Place customer-to-provider and provider-to-customer calls across different networks.
2. Verify no crash during ringing, answer, speaker, mute, background/foreground and hang-up.
3. Prove two-way voice for at least 60 seconds with no self-echo, clipping, repeated cut-outs or material timer skew.
4. The live call screen must display **Cloudflare TURN relay verified** and show a `RELAY` candidate type. Record the displayed protocol and RTT. `TURN ready` or `secure connected` alone is not evidence that media used the relay.
5. Confirm caller and receiver timers start from the same server timestamp and remain within one second.
6. Temporarily change network conditions and verify bounded failure/recovery instead of a silent hung call.
7. Test mute, speaker, foreground/background return and remote hang-up on both devices.
8. A call that connects with one-way, low-volume, delayed, noisy or cut audio fails acceptance.

### Mobile layout and availability controls

1. Test gesture navigation and button navigation where available.
2. Confirm bottom tabs are fully visible above the Android navigation bar and iPhone home indicator.
3. Open availability time selectors on small screens and verify start/end controls do not overlap or clip.
4. Toggle availability repeatedly. Animation and displayed state must match the confirmed server state; failed API updates must roll back visibly.

### Invoice tax policy

Complete a controlled booking and inspect customer, provider, PDF/print and admin invoice views. No GST, VAT, tax rate, tax amount or tax-inclusive calculation may appear. Service amount, commission and final payable totals must remain internally consistent.

### Admin operability and latency

1. Open Operations Inbox after a cold API start; it must not return HTTP 500.
2. Confirm a partial source failure is shown as degraded rather than a false all-clear queue.
3. Change search/type/date filters rapidly and confirm stale responses do not overwrite the latest results.
4. Confirm sidebar counters and Operations Inbox load within the connected-verifier latency budgets.
5. Verify no blocked Google Fonts CSP request and that the Athoo admin logo loads locally.

## 5. Cross-role setup

Use the Android and iPhone simultaneously for booking, negotiation, broadcast, chat, arrival, PIN start/completion, live location, notifications, session replacement and calls. Use the admin panel in a separate browser for approvals, exact notification routing, account restriction and availability override.

Every completed cross-role evidence record must identify both device models, OS versions and build IDs.

## 6. Evidence quality rules

For every completed, failed or blocked case record:

- use an ISO-8601 test timestamp after the relevant build creation time;
- use the exact matching Android or iOS build ID;
- reference a real screenshot, video, log or evidence URL;
- write specific notes describing the observed result;
- never use generic evidence or notes such as `OK`, `Passed`, `Test` or `N/A`.

Validate:

```powershell
pnpm device:evidence:validate -- .\device-acceptance-evidence.json .\ATHOO_PHASE28_5_2_RELEASE_METADATA_FIXED.zip
```

The command returns exit code 0 only when every case passes. Pending evidence returns code 3. Failed or blocked evidence returns code 1. Invalid or mismatched evidence returns code 2.

## 7. Pass criteria

- The exact candidate name, ZIP checksum and Git commit match the active release status.
- Android and iOS builds come from that same commit.
- No P0/P1 defect remains open.
- Every mandatory case passes on both platforms; platform exceptions require a failed/blocked record and prevent GO until resolved.
- Push taps navigate exactly once in foreground, background and terminated states.
- No permission is requested before the user invokes the related feature.
- Denied/blocked permissions provide a usable manual fallback and Settings recovery.
- Offline recovery does not duplicate bookings, messages, negotiations, refunds or payments.
- Two-device session replacement, biometric invalidation, radius matching, broadcasts and two-way audio pass with recorded evidence.

# Athoo Android/iOS Device Acceptance Runbook

## Build preparation

```bash
pnpm install --frozen-lockfile
pnpm device:prepare
APP_ENV=staging EXPO_PUBLIC_API_BASE_URL=https://<staging-api> EAS_PROJECT_ID=<id> pnpm mobile:validate
```

Create internal builds:

```bash
eas build --profile preview --platform android
eas build --profile preview --platform ios
```

Use dedicated customer, provider, and admin acceptance accounts. Do not use production personal accounts.

## Automated navigation smoke

```bash
ATHOO_APP_ID=com.athoo26436.athooapp \
BETA_CUSTOMER_IDENTIFIER=... BETA_CUSTOMER_PASSWORD=... \
maestro test .maestro/customer-device-smoke.yaml

ATHOO_APP_ID=com.athoo26436.athooapp \
BETA_PROVIDER_IDENTIFIER=... BETA_PROVIDER_PASSWORD=... \
maestro test .maestro/provider-device-smoke.yaml
```

## Manual evidence

Execute every case in `docs/qa/device-acceptance-checklist.json` on at least one current Android device and one current iPhone. Record build, OS, timestamp, result, evidence, and notes.

## Required cross-role setup

Use two physical phones simultaneously for booking, negotiation, chat, arrival, PIN start/completion, and live foreground location. Use the admin panel in a separate browser for force logout and availability override.

## Pass criteria

- No P0/P1 defects open.
- Every mandatory case passes on both platforms or has a documented platform exception.
- Push taps navigate exactly once in foreground, background, and terminated states.
- No permission is requested before the user invokes the related feature.
- Denied/blocked permissions provide a usable manual fallback and Settings recovery.
- Offline recovery does not duplicate bookings, messages, negotiations, refunds, or payments.

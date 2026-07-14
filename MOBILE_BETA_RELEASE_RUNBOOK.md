# Athoo Mobile Beta Release Runbook

## Required EAS environment values

Configure these in the EAS `preview` environment before building:

- `APP_ENV=staging`
- `EXPO_PUBLIC_API_BASE_URL=https://<staging-api-host>`
- `EAS_PROJECT_ID=<Expo project UUID>`
- `GOOGLE_MAPS_API_KEY=<restricted native key>`
- `ANDROID_PACKAGE=com.athoo26436.athooapp`
- `IOS_BUNDLE_IDENTIFIER=com.athoo26436.athooapp`

Do not configure TURN usernames or credentials in `EXPO_PUBLIC_*`. The authenticated calls API returns ICE server configuration.

## Validate locally

```bash
APP_ENV=staging \
EXPO_PUBLIC_API_BASE_URL=https://api-staging.example.com \
EAS_PROJECT_ID=00000000-0000-0000-0000-000000000000 \
pnpm mobile:validate

pnpm release:verify:code
pnpm mobile:export
```

## Create internal beta builds

```bash
eas login
eas build:configure
eas build --profile preview --platform android
eas build --profile preview --platform ios
```

The preview Android profile produces an APK for internal installation. The preview iOS build uses internal distribution and requires registered test devices.

## Beta acceptance checks

Test on at least one supported Android device and one iPhone:

1. Install and launch from a clean device state.
2. Register/login and confirm secure session restoration after restart.
3. Allow/deny notifications, camera, photos, microphone, and location.
4. Complete customer and provider booking journeys.
5. Verify chat attachments, calls, start/completion PINs, invoices, refunds, and withdrawals.
6. Tap notifications from foreground, background, and terminated states.
7. Log out and confirm the device no longer receives account notifications.
8. Verify app behavior on slow and temporarily disconnected networks.

## Production build

Only after closed-beta sign-off:

```bash
eas build --profile production --platform android
eas build --profile production --platform ios
eas submit --profile production --platform android
eas submit --profile production --platform ios
```

Store credentials and signing keys must remain in Expo/Apple/Google credential stores, not in the repository.

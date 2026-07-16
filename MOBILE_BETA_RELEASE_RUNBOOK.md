# Athoo Mobile Beta Release Runbook

## Canonical rule

Build Android and iOS only from the exact Git commit verified by the API release identity. Never mix an old APK with a newer authentication/backend contract.

## Required EAS values

Configure non-secret mobile values in the EAS `preview` environment:

```env
APP_ENV=staging
EAS_PROJECT_ID=42a7f8fe-68ea-4422-8f46-0def1f55abb9
EXPO_PUBLIC_API_BASE_URL=https://athoo-api.onrender.com
EXPO_PUBLIC_MAP_TILE_URL=https://athoo-api.onrender.com/api/geo/tiles/{z}/{x}/{y}.png
EXPO_PUBLIC_MAP_TILE_SIZE=512
EXPO_PUBLIC_MAP_ATTRIBUTION=© Mapbox © OpenStreetMap contributors
ANDROID_PACKAGE=com.athoo26436.athooapp
IOS_BUNDLE_IDENTIFIER=com.athoo26436.athooapp
```

Do not put Mapbox, Zoho, WhatsApp, SMS, R2, TURN, database, JWT or admin secrets in `EXPO_PUBLIC_*` values. Protected provider configuration belongs on the API server.

## Local gates

From the monorepo root:

```powershell
pnpm install --frozen-lockfile
pnpm rc2:source-verify
pnpm db:verify
pnpm db:integrity
pnpm mobile:doctor
pnpm mobile:export
```

From `athoo-app`:

```powershell
pnpm exec expo config --type public
eas project:info
```

Confirm the Athoo project ID, Android package and iOS bundle identifier before building.

## Internal preview builds

```powershell
eas build --profile preview --platform android --clear-cache
eas build --profile preview --platform ios --clear-cache
```

The Android preview profile must produce an installable APK. Internal iOS distribution requires registered devices.

## Required devices

- One physical Android phone
- One physical iPhone
- Browser admin panel
- A separate customer and provider account

An emulator may supplement testing but cannot replace the required physical-platform evidence.

## Acceptance evidence

Copy the evidence template:

```powershell
Copy-Item device-acceptance-evidence-template.json device-acceptance-evidence.json
```

Complete every case in `device-acceptance-checklist.json`. Passed cases require:

- ISO timestamp
- matching EAS build ID
- device model
- OS version
- screenshot/video/log evidence location
- meaningful notes

Validate:

```powershell
pnpm device:evidence:validate
```

## Critical runtime matrix

Test both light and dark themes and all relevant app states:

- fresh install and native splash
- customer/provider phone OTP
- verified-email OTP alternative
- account-not-found, blocked, deactivated and deleted handling
- one-device session replacement
- location permission, accurate current location and named address
- search suggestions, pin selection and directions
- R2 media uploads from camera and gallery
- customer/provider booking and negotiation
- chat and call lifecycle
- job, chat, general and call sounds
- foreground, background and killed-app notification taps
- logout and token invalidation
- slow, offline and recovered network states

## Native notification note

Android notification channels are immutable after creation. Phase 4A moved Athoo to the `v3` channels. Install the new preview build cleanly when testing sound changes; an old installation may retain old channel behavior.

## Map note

The mobile app does not call Mapbox directly. Mapbox tiles/directions and Photon search/reverse geocoding are selected by the backend. Verify tile alignment at zoom 12–18, attribution visibility, search accuracy and route polylines.

## Production builds

Only after connected evidence and device evidence pass and `pnpm rc2:decision` returns `GO`:

```powershell
eas build --profile production --platform android
eas build --profile production --platform ios
eas submit --profile production --platform android
eas submit --profile production --platform ios
```

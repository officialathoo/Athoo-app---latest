# Athoo RC2 Phase 3C — Theme, Branding, Call and Runtime Configuration Certification

## Baseline integrity

This cumulative phase was built only on:

- Baseline ZIP: `ATHOO_RC2_PHASE_3B_THEME_SHARED_COMPONENTS_CERTIFIED.zip`
- Baseline SHA-256: `985d6dc45c065c6ed359f4e4fa65c0828d025d6f0891a237a7f348c12f4561b5`

No older Athoo ZIP was used as an implementation source.

## Completed scope

### 1. Centralized and portable branding

- Added `athoo-app/config/brand.ts` as the single mobile brand source.
- Centralized display name, descriptor, approved mark and light/dark brand colors.
- Added environment-controlled app slug, URI scheme, icons, notification icon, splash assets and splash backgrounds.
- Updated native permission descriptions to use the configured display name.
- Removed all source references to the old `logo_transparent.png` and legacy `logo.png` branding.
- Updated login, welcome, loader, About, booking details, invoices and provider job details to use the approved centralized brand mark.

### 2. Native light/dark splash alignment

- Replaced the legacy static splash block with the `expo-splash-screen` configuration plugin.
- Added separate configurable light and dark splash backgrounds.
- Kept launcher, adaptive and notification assets configurable from deployment settings.
- Kept EAS project linkage and the Expo Updates URL derived from `EAS_PROJECT_ID`.

### 3. Dark-theme runtime visibility

- Migrated notification banners and the global toast system to semantic active-theme colors.
- Migrated the provider verification wall, tab badges, error fallback, call overlays and selected remaining static screens.
- Migrated customer/provider chat tabs, customer map, customer addresses and provider verification layout away from module-load light-palette styles.
- Added configurable dark-mode brand colors so rebranding does not silently revert to fixed blue/orange values in dark mode.
- Confirmed no TSX component remains with a static color-bearing `StyleSheet.create` that lacks a theme-aware adapter.

### 4. Configurable call provider architecture

- Added authenticated `/api/calls/config` runtime configuration.
- Added plural and legacy-compatible `STUN_URLS`/`STUN_URL` and `TURN_URLS`/`TURN_URL` support.
- Removed embedded Google STUN servers from mobile and backend call source.
- Kept TURN credentials server-side and returned them only through the authenticated call configuration route.
- Added configurable call provider, codec declaration and bounded fallback-audio chunk timing.
- Wired mobile fallback chunk recording, polling and playback safety timing to backend configuration.
- Added safe empty ICE configuration and existing authenticated audio fallback when no WebRTC provider is configured.
- Replaced call notification/display-name and default color literals with centralized deployment/brand configuration.

### 5. Hosting-provider portability

- Removed the Render API URL fallback from mobile runtime source.
- Removed the Render tile URL fallback from map preview and app configuration source.
- Native builds now require deployment configuration through `EXPO_PUBLIC_API_BASE_URL`.
- Map preview now fails safely and preserves the selected address when the tile template is absent or invalid.
- EAS profile URLs remain deployment configuration, not feature-code dependencies, and can be changed in one configuration location.

## New or expanded configuration

```env
APP_DISPLAY_NAME=Athoo
APP_SLUG=athoo-app
APP_SCHEME=athoo
BRAND_DESCRIPTOR=Home Services
BRAND_PRIMARY_COLOR="#1A6EE0"
BRAND_PRIMARY_PRESSED_COLOR="#1558B4"
BRAND_PRIMARY_DARK_COLOR="#60A5FA"
BRAND_PRIMARY_PRESSED_DARK_COLOR="#3B82F6"
BRAND_SECONDARY_COLOR="#F97316"
BRAND_SECONDARY_PRESSED_COLOR="#C4510B"
BRAND_SECONDARY_DARK_COLOR="#F97316"
BRAND_SECONDARY_PRESSED_DARK_COLOR="#EA580C"
APP_ICON_PATH=./assets/images/icon.png
ADAPTIVE_ICON_PATH=./assets/images/adaptive-icon.png
ADAPTIVE_ICON_BACKGROUND="#FFFFFF"
SPLASH_IMAGE_PATH=./assets/images/splash.png
SPLASH_BACKGROUND_LIGHT="#FFFFFF"
SPLASH_BACKGROUND_DARK="#08111F"
NOTIFICATION_ICON_PATH=./assets/images/notification-icon.png

CALL_PROVIDER=webrtc
STUN_URLS=
TURN_URLS=
TURN_USERNAME=
TURN_CREDENTIAL=
CALL_FALLBACK_CHUNK_MS=800
CALL_PREFERRED_CODEC=opus
```

The `EXPO_PUBLIC_BRAND_*` counterparts are public build values only. TURN credentials must never use an `EXPO_PUBLIC_` variable.

## Verification evidence

- Changed TypeScript/TSX syntax transpilation: **37 files passed, 0 failures**.
- JavaScript configuration syntax: **passed**.
- Focused Phase 3C/theme/map compatibility tests: **29 passed, 0 failed**.
- Complete source regression: **341 passed, 0 failed**.
- Project JSON validation: **31 files passed**.
- Release check: **passed**.
- Mobile release validation: **passed**.
- Closed-beta QA asset validation: **passed**.
- Operations readiness: **passed — 6 runbooks and retention controls**.
- Security scan: **passed**.
- Database migration required: **no**.
- Existing API route removed: **no**.

## Measured source improvement

| Audit item | Phase 3B | Phase 3C |
|---|---:|---:|
| Legacy mobile `Colors.*` references | 502 | 483 |
| Direct mobile HEX literals | 661 | 606 |
| Old-logo source references | 7 | 0 |
| Render API/tile fallback references in mobile runtime source | 3 | 0 |
| Static color-bearing TSX styles without a theme adapter | — | 0 |

The remaining legacy color references are concentrated in large individual feature screens and semantic/status palettes. They are not being represented as fully resolved in this phase.

## Certification boundary

This phase is **source-certified for the scope above**. It does not claim that the following live checks have already passed:

- dependency-backed workspace typecheck and production builds;
- Expo Doctor and native prebuild;
- Android/iOS light/dark splash rendering;
- physical-device notification and call audio behavior;
- live WebRTC STUN/TURN connectivity;
- killed-app incoming-call notification behavior.

The execution environment did not have `pnpm` installed and could not download the pinned package manager because outbound registry access was unavailable. Therefore the dependency-backed commands must be run locally before deployment.

## Required local gates

```powershell
pnpm install --frozen-lockfile
pnpm check:project
pnpm typecheck
pnpm test
pnpm build
pnpm db:verify
pnpm db:integrity
pnpm mobile:doctor
pnpm mobile:validate
```

Then build a new preview APK from this exact source and verify both light and dark mode, native splash, login/welcome branding, map configuration failure/success, notifications, and calls on physical devices.

## Next controlled phase

Phase 3D should continue from this Phase 3C ZIP only and migrate the remaining high-density individual screens and semantic status surfaces, especially booking details, provider job details, profile, negotiation, booking, subscription, refund and withdrawal screens.

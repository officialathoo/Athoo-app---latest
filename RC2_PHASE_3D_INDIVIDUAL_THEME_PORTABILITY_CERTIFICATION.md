# Athoo RC2 Phase 3D — Individual Theme and Portability Certification

## Baseline integrity

This cumulative phase was built only on:

- Baseline ZIP: `ATHOO_RC2_PHASE_3C_THEME_BRANDING_CALL_CONFIG_CERTIFIED.zip`
- Baseline SHA-256: `47db2facebb4e627377782a3399c19b67797ac563069702e0fb86793dbd0ad22`

No older Athoo ZIP was used as an implementation source.

## Completed scope

### 1. Remaining individual-screen theme migration

- Removed legacy `Colors.*` consumption from all customer/provider feature screens.
- Removed direct HEX UI literals from all files inside `athoo-app/app`.
- Migrated high-density customer flows including booking lists, booking details, negotiation, service selection, provider results, provider details, subscription, refunds, invoices, profile and search.
- Migrated high-density provider flows including dashboard, jobs, earnings, job details, negotiations, availability, service radius, profile, edit profile, verification, commission, wallet, withdrawals, subscriptions and invoices.
- Replaced status maps with active-theme semantic colors for booking, job, refund, withdrawal and commission states.
- Added semantic contrast tokens for brand, danger, success, light surfaces, shadows, neutral states, accent states and premium states.

### 2. Dynamic category contrast safety

- Added `athoo-app/utils/categoryAppearance.ts` as the single appearance adapter for admin-managed service-category colors.
- Validates category colors before use.
- Improves accent contrast against the current surface.
- Generates separate light/dark soft backgrounds and selected backgrounds.
- Selects readable foreground color for solid category accents.
- Migrated service cards, service booking, customer search, provider results, provider details, provider registration, provider edit profile and provider profile to this helper.
- Feature screens no longer trust light-only `bgColor` values directly in dark mode.

### 3. Theme-scope runtime bug fixes

Deep source checking found two helper-component scope defects that syntax-only validation could not detect:

- Provider tab `BroadcastBadge` referenced `theme` without owning a theme context.
- Provider edit-profile `Field` referenced parent `styles` outside its component scope.

Both helpers now resolve and memoize their own active-theme values. Customer/provider badge foregrounds also use semantic danger contrast tokens.

### 4. Map and route portability cleanup

- Removed a missed direct mobile call to the public OSRM router from customer booking details.
- Customer and provider route drawing now use the existing authenticated Athoo backend directions abstraction.
- Added `athoo-app/services/externalMaps.ts` so feature screens do not embed Apple Maps, geo URI, Mapbox, MapTiler or other external-map URLs.
- External map location/search destinations are deployment-configurable by platform.
- Provider job details and customer booking details now fail safely when no external destination is configured.
- No mobile feature screen contains a direct map-vendor endpoint.

### 5. Portable support, invoice and referral configuration

- Added public runtime configuration for support email, display phone, social handle, app-download URL and platform-specific external-map templates.
- Updated About and settings fallbacks to consume runtime/brand configuration.
- Referral sharing now uses the configured display name and optional app-download URL.
- Added centralized `athoo-app/config/invoice.ts` for stable print colors, brand name and configurable contact line.
- Customer invoices, provider statements and booking invoice PDFs no longer embed Athoo contact details or visual identity in feature code.

## New public mobile configuration

```env
EXPO_PUBLIC_SUPPORT_EMAIL=
EXPO_PUBLIC_SUPPORT_PHONE_DISPLAY=
EXPO_PUBLIC_SUPPORT_SOCIAL_HANDLE=
EXPO_PUBLIC_APP_DOWNLOAD_URL=
EXPO_PUBLIC_MAP_EXTERNAL_ANDROID_URL_TEMPLATE=geo:{lat},{lng}?q={lat},{lng}({label})
EXPO_PUBLIC_MAP_EXTERNAL_IOS_URL_TEMPLATE=https://maps.apple.com/?ll={lat},{lng}&q={label}
EXPO_PUBLIC_MAP_EXTERNAL_WEB_URL_TEMPLATE=
EXPO_PUBLIC_MAP_EXTERNAL_ANDROID_SEARCH_URL_TEMPLATE=geo:0,0?q={query}
EXPO_PUBLIC_MAP_EXTERNAL_IOS_SEARCH_URL_TEMPLATE=https://maps.apple.com/?q={query}
EXPO_PUBLIC_MAP_EXTERNAL_WEB_SEARCH_URL_TEMPLATE=
```

These values are non-secret. Map provider secrets and protected geocoding/directions credentials remain backend-only.

## Verification evidence

- Mobile TypeScript/TSX syntax transpilation: **171 files passed, 0 failures**.
- Loose semantic identifier audit: **no new unresolved local `theme` or `styles` identifiers**.
- Focused Phase 3D and localization tests: **10 passed, 0 failed**.
- Complete source regression: **348 passed, 0 failed**.
- Project JSON validation: **31 files passed**.
- Release check: **passed**.
- Mobile release validation: **passed**.
- Closed-beta QA asset validation: **passed**.
- Operations readiness: **passed — 6 runbooks and retention controls**.
- Security scan: **passed**.
- JavaScript app-configuration syntax: **passed**.
- Database migration required: **no**.
- Existing API route removed: **no**.

## Measured source improvement

| Audit item | Phase 3C baseline | Phase 3D |
|---|---:|---:|
| Legacy `Colors.*` references in feature screens | 465 | **0** |
| Direct HEX literals in feature screens | 555 | **0** |
| Direct category `color`/`bgColor` visual consumption in feature screens | 25 | **0** |
| Legacy `Colors.*` references across all mobile source | 483 | **18** |
| Direct mobile map-vendor endpoints in feature code | present | **0** |
| Hardcoded Athoo support/contact destinations in mobile feature code | present | **0** |

The remaining 18 `Colors.*` references are isolated to `ThemeContext.tsx`, where the active semantic theme is synchronized into the legacy compatibility object for non-feature consumers. The remaining mobile HEX values are centralized design tokens, validated branding, print configuration, notification-channel configuration and offline category fallback data rather than feature-screen UI literals.

## Certification boundary

This phase is **source-certified for the scope above**. It does not claim that the following dependency-backed or physical-device checks have already passed:

- full workspace `pnpm typecheck` and production builds;
- Expo Doctor, native prebuild and EAS compilation;
- visual inspection of every screen on Android and iOS in both themes;
- live external-map application opening;
- live backend routing with the selected map provider;
- PDF print rendering on physical devices.

The execution environment could not download the pinned `pnpm` package manager because outbound registry access was unavailable. Those gates must be run locally before deployment.

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

Then create a new preview APK from this exact source and run the Android/iOS light-and-dark device matrix. Older APKs cannot validate these source changes.

## Next controlled phase

Continue only from the Phase 3D ZIP. The next phase should audit notification/call sound behavior, foreground/background/killed-app delivery, native channel migration, branding assets and the complete configurable Zoho transactional-email module.

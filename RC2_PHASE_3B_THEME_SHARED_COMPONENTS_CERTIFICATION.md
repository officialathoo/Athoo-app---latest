# Athoo RC2 Phase 3B — Shared Theme, Runtime Links and Loading UI Certification

## Baseline

This cumulative phase was built only on:

- `ATHOO_RC2_PHASE_3A_THEME_CRITICAL_FLOWS_FIXED.zip`
- SHA-256: `97b29c9eb29c0678dbe72d21a42c2c61b6ea2c09a4cf75df91505aca7cdc8804`

No older Athoo ZIP was merged into this phase.

## Scope completed

### Shared dark-theme and contrast migration

The following shared or cross-role UI was migrated to the active semantic theme:

- City picker
- Time picker
- Permission gate
- Legal acceptance checkbox
- Legal consent gate
- Video player states
- Athoo loading screen
- Shared icon fallback color
- Shared loading, error, empty and offline states
- Booking card status/rating surfaces
- Provider card badges
- Appearance selector
- OpenStreetMap preview overlays and markers
- Backward-compatible map fallback
- Call screen
- Customer/provider chatbot shared implementation
- About screen contact section
- Customer/provider social contact sections

All source files under `athoo-app/components/ui`, `athoo-app/components/maps`, and
`athoo-app/components/screens` now have:

- `0` legacy `Colors.*` references
- `0` direct HEX color literals

Shared icons without an explicit color now use the active theme text color instead
of defaulting to black, preventing invisible icons in dark mode.

### Loading logo correction

`AthooLoader` now uses `assets/images/app-icon-approved.png` instead of the old
`logo_transparent.png`. Its looping animations and timers are stopped during
unmount so a navigation or logout transition cannot leave orphaned animation work.

The two remaining `logo_transparent.png` references are on the login and welcome
branding screens, not the runtime loading component. Native splash and store-brand
asset certification remains a separate branding phase.

### Configuration-first portability

Added a centralized non-secret mobile runtime configuration layer:

- `athoo-app/config/runtime.ts`

The following destinations are now build/deployment configurable:

- WhatsApp support URL
- Instagram support URL
- Facebook support URL
- Terms URL
- Privacy URL

Customer profile, provider profile, About, chatbot and legal components no longer
embed Athoo social-provider URLs. Missing optional destinations are hidden safely
rather than producing broken buttons.

New public mobile variables:

- `EXPO_PUBLIC_SUPPORT_WHATSAPP_URL`
- `EXPO_PUBLIC_SUPPORT_INSTAGRAM_URL`
- `EXPO_PUBLIC_SUPPORT_FACEBOOK_URL`
- `EXPO_PUBLIC_TERMS_URL`
- `EXPO_PUBLIC_PRIVACY_URL`

Secrets are not accepted by this runtime configuration layer.

### Production environment template recovery

The prior packaged baseline omitted `.env.production.example` even though release
checks and tests require it. A safe, non-secret template was restored with:

- durable PostgreSQL queue configuration
- storage provider placeholders
- Zoho-compatible SMTP settings
- OTP safety settings
- map-provider abstraction settings
- mobile public runtime settings
- no duplicate keys

`.gitignore` now blocks real environment files while explicitly allowing only the
safe production template.

## Regression and certification evidence

Completed in the audit environment:

- TypeScript/JavaScript syntax transpilation: **24 changed files passed**
- Focused Phase 3B tests: **6 passed, 0 failed**
- Complete API/static regression suite: **336 passed, 0 failed**
- Project JSON validation: **31 files passed**
- Mobile release validation: **passed**
- Closed-beta QA asset validation: **passed**
- Release check: **passed**
- Production environment template validation: **passed**
- Security scan: **passed**
- Hardcoded Athoo social URLs in mobile source: **0**

Environment-template validation produced expected warnings because example SMTP,
OTP provider and error-tracking secrets are intentionally blank. Real deployment
values must be entered in Render/EAS secret management.

## Measured source improvement from Phase 3A baseline

| Audit item | Phase 3A baseline | Phase 3B result |
|---|---:|---:|
| Mobile `Colors.*` references | 641 | 502 |
| Mobile direct HEX literals | 782 | 661 |
| Shared-component `Colors.*` references | 93 | 0 |
| Shared-component direct HEX literals | 41 | 0 |
| Hardcoded Athoo social-provider URLs | 16 | 0 |
| Old logo references | 3 | 2 |

Remaining color references are primarily in individual feature screens outside the
shared-component layer. They remain scheduled for the next screen-by-screen pass.

## Certification boundary

This phase is **source-certified for its stated scope**. It is not yet full mobile
release certification because the audit environment does not contain installed
workspace dependencies or `pnpm`, so dependency-backed typecheck, native Expo
Doctor, bundle builds and real-device visual testing must run after extraction.

Required local gates:

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

Required runtime checks:

- Android light/dark switching on every shared dialog and picker
- iPhone light/dark switching
- Call screen foreground/background behavior
- Offline banner visibility
- Loading/logout transition behavior
- Configured and unconfigured support links
- Map overlay contrast in both themes

## Next cumulative phase

Phase 3C should continue only from this Phase 3B ZIP and cover:

- remaining individual feature screens with legacy palette references
- authentication/login/welcome branding and contrast
- notification screen and call-related secondary states
- native splash, launcher and approved-logo asset alignment
- final light/dark visual matrix on Android and iOS

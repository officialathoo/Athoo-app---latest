# RC2 Phase 3A — Theme Critical Flows Audit

Baseline: `ATHOO_RC2_PHASE_2_MAP_LOCATION_CERTIFIED.zip`

## Scope completed

The highest-risk customer/provider runtime screens that still created static `StyleSheet` objects from the legacy mutable `Colors` palette were migrated to per-render theme factories using `useTheme()` and `useMemo()`.

This prevents screens loaded before the saved dark-mode preference is restored from permanently retaining light-mode surfaces and text colors.

### Migrated screens/components

- Customer booking creation
- Customer booking detail
- Customer negotiation
- Customer provider detail
- Customer service-provider list
- Customer broadcast status
- Customer chat room
- Customer Home, Search, Bookings, and Profile tabs
- Provider job detail
- Provider negotiations
- Provider broadcasts
- Provider availability
- Provider service radius
- Provider verification documents
- Provider edit profile
- Provider chat room
- Provider Dashboard, Jobs, Earnings, and Profile tabs
- Shared ProviderCard

## Implementation rules

- Theme-driven styles are created with `createStyles(theme)`.
- Styles are memoized with `useMemo`.
- Surfaces, backgrounds, borders, primary/secondary text, muted text, and semantic status colors use the central theme.
- Changeable vendor/business configuration remains configuration-driven; no new provider or endpoint hardcoding was introduced.
- True-white text remains reserved for content on brand/semantic solid backgrounds.

## Verification performed in this environment

- TypeScript parser/transpilation check: 28 dynamic-theme source files passed, 0 syntax failures.
- Invalid unquoted shadow-color regression detected and corrected during audit.
- Source archive integrity checked after packaging.

## Remaining theme migration inventory

The following lower-priority static theme consumers remain for Phase 3B:

- CityPicker
- TimePicker
- Customer/provider chatbot
- Legal consent and permission gates
- Provider layout shell
- Notification and toast contexts
- Map fallback
- Video player
- Call screen residual styles

These files are not being falsely marked complete in this Phase 3A certificate.

## Local release gates required

Run on the user's Windows workspace after extracting this cumulative ZIP:

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

Full production certification remains conditional on those gates and real-device dark/light walkthrough testing.

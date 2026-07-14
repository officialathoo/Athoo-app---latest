# RC2 Phase 8B2 — Customer and Provider Main Tabs

## Baseline

This phase was applied directly to `ATHOO_RC2_PHASE_8B1_AUTH_THEME_LOCALIZATION.zip`. All earlier backend, media, maps, mobile runtime, admin, notification, authentication, theme and localization work remains in the cumulative source.

## Completed work

- Connected all ten primary customer/provider tab routes to both `useTheme()` and `useLang()`.
- Removed theme-breaking `Colors.white` background surfaces from all primary tab routes. Legacy surfaces now use the synchronized card/surface palette instead of remaining bright white in dark mode.
- Rebuilt both customer and provider chat-list tabs with semantic runtime colors, Urdu-aware direction, localized empty states, localized destructive confirmations, accessible labels and theme-aware loading skeletons.
- Applied runtime theme backgrounds and border colors to customer bookings, search, profile, provider dashboard, jobs, earnings and profile shells.
- Localized primary customer Home, Search and Bookings actions and status text.
- Localized provider Dashboard broadcast actions, Jobs filters/empty states, Earnings summaries/commission content and profile availability content.
- Added localized currency use in key earnings and negotiation amounts.
- Preserved canonical API values, booking statuses, service-area sentinels, route names and database identifiers. Only user-facing labels are translated.

## Safety decisions

- The internal `All Areas` sentinel remains in English because it is a filtering value. Its displayed label is localized.
- Service names, provider names and admin-authored content remain as supplied by the database rather than being automatically altered.
- Brand and status colors that are intentionally semantic remain in the established palette. Complex nested cards still using the synchronized legacy palette are tracked instead of being blindly rewritten.
- No API contract, database schema, storage path, navigation route or business-state value changed in this phase.

## Remaining UI migration

`RC2_PHASE_8B2_UI_AUDIT.json` records remaining legacy color references and direct literals in complex nested cards and gradients. These are not presented as fully migrated. They are assigned to Phase 8B3, which will cover booking cards, negotiation cards, profile modals, finance cards and final accessibility/spacing consistency.

## Verification performed in the audit environment

- Project structure validation: passed (`27` JSON configuration files checked).
- TypeScript/TSX transpilation syntax validation: passed for every changed source and test file.
- Source-level regression tests that require only the Node standard library: `243 passed, 0 failed`.
- Focused Phase 8B2 tests are included in `api-server/test/rc2-phase8b2-main-tabs-theme-localization.test.ts`.
- A dependency-backed Expo typecheck/export and production native build still require `pnpm install --frozen-lockfile` in the user's release environment.

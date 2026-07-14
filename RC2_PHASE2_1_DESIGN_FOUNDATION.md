# Athoo RC2 Phase 2.1 — Design Foundation

## Scope

This is a regression-safe foundation patch. It does not change booking, payments, chat, calls, notifications, API contracts, or database structures.

## Corrections

- Added a theme readiness gate so the navigator does not render with a temporary light theme before the saved preference is restored.
- Made the root status bar and root application surface follow the resolved light/dark/system theme.
- Converted the legacy `useColors()` adapter into a theme-aware compatibility layer. Existing screens using this hook now follow the active theme without a broad rewrite.
- Removed hard-coded white and dark-text colors from the shared service card.
- Preserved the existing ThemeContext API and added only the backward-compatible `ready` field.

## Regression protection

- Existing providers and navigator order are unchanged.
- Existing theme preference values (`light`, `dark`, `system`) and storage key are unchanged.
- No database, backend route, admin workflow, or business logic changes.
- Added focused source regression tests under `api-server/test/rc2-design-foundation.test.ts`.

## Next Phase 2.1 work

- Migrate shared inputs, cards, loading states, tab bars, and authentication surfaces to the token system.
- Audit fixed `Colors` imports screen-by-screen rather than replacing them globally.
- Expand dark-mode visual testing on Android and iPhone.

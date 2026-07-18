# RC2 Phase 2.1 — Shared UI and Navigation Patch

## Scope
Regression-safe continuation of the existing Athoo theme foundation. No API, database, booking, notification, payment, or authentication business logic was changed.

## Changes
- Added standardized icon-size tokens to the shared theme.
- Improved shared AppInput disabled, focus, padding, and theme behavior.
- Aligned shared Button typography with design tokens.
- Reused the shared Button in error and empty states.
- Made the offline banner theme-aware.
- Migrated customer and provider bottom tabs from fixed light colors to active theme tokens.
- Added themed dividers, active states, badges, shadows, and keyboard-aware tab hiding.

## Regression protection
Focused source tests verify shared controls, theme-driven tabs, and icon token availability.

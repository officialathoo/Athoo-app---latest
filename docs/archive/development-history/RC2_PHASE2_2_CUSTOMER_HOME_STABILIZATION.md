# RC2 Phase 2.2 — Customer Home Stabilization

## Scope
Regression-safe stabilization of the Customer Home experience and shared provider presentation. No API contracts, database schema, booking, broadcast, premium, authentication, or notification business logic were changed.

## Verified root causes addressed

1. Home re-ran all dashboard API calls every time the Home tab regained focus.
2. Focus refresh used the visible pull-to-refresh state, producing unnecessary visual movement.
3. Initial skeleton and populated Home sections rendered together, allowing partial content and animations to appear behind the loader.
4. Customer Home retained fixed light colors despite the Phase 2.1 theme foundation.
5. Provider cards retained fixed light surfaces and shadows.
6. The active-broadcast gradient contained a duplicate JSX `style` property.

## Changes

- Added a 60-second background refresh threshold for tab focus.
- Added an in-flight request guard to prevent overlapping Home refreshes.
- Kept pull-to-refresh explicit and visible while making focus refresh silent.
- Made the first-load skeleton exclusive: content renders only after initial Home loading completes.
- Applied theme-aware Home backgrounds, header, search controls, primary text, errors, section labels, and announcement surfaces.
- Applied theme-aware Provider Card surfaces, borders, shadows, and text.
- Removed the duplicate active-broadcast `style` property.
- Preserved all existing destinations and actions.

## Device acceptance

Test on Android and iPhone:

1. Login opens Customer Home.
2. First Home load shows one professional skeleton, not black blocks.
3. Switching away from and back to Home within 60 seconds does not flash or show a refresh spinner.
4. Pull-to-refresh remains functional.
5. Light, dark, and system themes keep service/provider cards readable.
6. Search, service cards, provider cards, broadcasts, notifications, emergency calling, and banners retain their destinations.

# RC2 Runtime Blockers Patch 01A — Map Type Fix

## Correction

- Replaced the invalid `MapView` prop `onMapPress` with the supported `onPress` prop from `react-native-maps`.
- Map tap coordinate selection behavior is unchanged.
- No API, database, navigation, upload, theme, or admin logic changed.

## Verification

- Focused runtime-blocker tests: 4 passed, 0 failed.
- The corrected prop matches the installed `react-native-maps` TypeScript interface.

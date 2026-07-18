# RC2 Phase 5 Expo and Release Check Final Fix

Baseline: `ATHOO_RC2_PHASE_5_FINAL_ALL_REPORTED_ERRORS_RESOLVED.zip`

## Corrected

- Added `expo` and `expo-updates` to pnpm `minimumReleaseAgeExclude`, allowing Expo SDK patch releases selected by Expo Doctor to be installed immediately while retaining the 24-hour age policy for all other dependencies.
- Changed `mobile:align-sdk` to `expo install --fix`, removing hardcoded Expo patch versions and keeping SDK alignment configuration-driven.
- Made local release verification tolerate an extracted package that omits `.github/workflows/ci.yml`. The workflow remains packaged and remains mandatory in actual CI.
- Retained the typed SMTP pool/non-pool transport separation from the prior fix.

## Verification boundary

Static project and release checks were executed in the packaging environment. Network-backed Expo installation and full dependency-backed workspace typecheck/build must be run locally.

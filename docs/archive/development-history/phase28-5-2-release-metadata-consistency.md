# Athoo Phase 28.5.2 Release Metadata Consistency Fix

## Problem

Phase 28.5.1 corrected the map-provider TypeScript inference issue, but the authoritative candidate name had advanced while release-gate tests, device evidence templates, and active runbooks still referenced `ATHOO_PHASE28_5_RELEASE_HARDENED.zip`. This first caused four source tests to fail before typecheck could run; a complete suite then exposed two additional stale blueprint assertions.

## Permanent fix

- Advanced the candidate to `ATHOO_PHASE28_5_2_RELEASE_METADATA_FIXED.zip` with `ATHOO_PHASE28_5_1_MAP_PROVIDER_TYPECHECK_FIXED.zip` recorded as the baseline.
- Synchronized device and RC2 evidence templates with the authoritative candidate.
- Synchronized active deployment and acceptance runbooks.
- Changed device-evidence tests, release-blueprint validation, and release-document tests to derive the candidate from `docs/qa/current-release-status.json` instead of duplicating a hard-coded artifact name.
- Added a regression test that enforces cross-file release metadata consistency.
- Preserved the NO-GO decision until connected and real-device evidence is complete.

No database migration or production data change is included.

# RC2 Phase D Typecheck and Test Fix

## Corrections

- Added typed selection state to the account-deletion request list.
- Added select-all and bulk restore for pending account-deletion requests.
- Removed the unresolved `selectedIds` / `setSelectedIds` references that blocked admin-panel typecheck.
- Updated the stale Customer Home regression test to enforce the current product rule: admin-managed banners do not silently fall back to hardcoded promotional banners.

## Verification

- Focused Customer Home tests: 3 passed, 0 failed.
- Full workspace typecheck, test, and build must be run locally with installed dependencies.

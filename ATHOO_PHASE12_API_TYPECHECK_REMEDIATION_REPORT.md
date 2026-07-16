# Athoo Phase 12 — API Typecheck Remediation

**Date:** 17 July 2026  
**Input baseline:** `ATHOO_PHASE11_LOCAL_TESTING_COMPILE_FIXED.zip`  
**Output candidate:** `ATHOO_PHASE12_API_TYPECHECK_REMEDIATED.zip`  
**Status:** Typecheck rerun required on the connected Windows workspace.

## Trigger

The frozen dependency installation completed successfully on Windows. The first dependency-aware `pnpm run release:verify:code` run passed project, release, operations, blueprint, security, Expo, style, and all 441 existing tests, then exposed ten genuine API TypeScript errors.

## Errors remediated

1. Registered the `account:inactivity-cleared` realtime event in the central event union.
2. Removed the unsupported `data` property from `createAdminNotification` usage.
3. Added optional `size` support to `UploadFileInput` for R2 `ContentLength`.
4. Normalized `x-athoo-device-id` headers that Express may represent as `string[]`.
5. Added `serviceLabel` to the broadcast request type used by provider matching.
6. Made every ICE-candidate route path return consistently, resolving `TS7030`.
7. Updated public banner sanitization to accept nullable database `linkType` values.
8. Normalized Express route-array parameters before querying subscription IDs.

## Verification completed after remediation

- Phase 12 focused regressions: **7/7 passed**
- Complete source regression suite: **448/448 passed**
- TypeScript/TSX syntax parse: **504/504 files passed**
- Project validation: passed
- Release validation: passed
- Operations readiness: passed
- Release blueprint validation: passed
- Security scan: passed
- Expo workspace validation: passed
- React Native style validation: passed
- Mobile release validation: passed
- Closed-beta QA validation: passed
- Device acceptance preparation: passed

## Required next action

Extract this ZIP into a new folder, reuse the local pnpm store with `pnpm install --frozen-lockfile`, and run:

```powershell
pnpm run release:verify:code
```

Do not run database migrations or deployments until that command reaches the end with zero failures. A further compiler error, if any, must be treated as a real blocker and fixed against this Phase 12 baseline.

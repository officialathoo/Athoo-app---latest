# RC2 Phase 5 — All Reported Errors Fix

Baseline: `ATHOO_RC2_PHASE_5_TYPECHECK_ISSUES_FIXED.zip`

## Fixed

- Nodemailer v8 SMTP pool typing is isolated at the provider adapter boundary, resolving `TS2353` without removing SMTP pooling configuration.
- Added cross-platform `pnpm mobile:align-sdk`; it does not depend on PowerShell script execution policy.
- The command uses Expo's compatible installer to update `expo` to `~54.0.36`, `expo-updates` to `~29.0.19`, and refresh `pnpm-lock.yaml`.
- Existing database state remains unchanged: 37 migrations, no drift.

## Required command order

Run `pnpm mobile:align-sdk` while online, then `pnpm install --frozen-lockfile`, then `pnpm rc2:source-verify` and `pnpm mobile:doctor`.

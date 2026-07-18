# Athoo RC2 Phase 5 — Final Reported Error Resolution

## Baseline

Built only from `ATHOO_RC2_PHASE_5_ALL_REPORTED_ERRORS_FIXED.zip`.

## Corrections

1. Replaced the invalid pooled SMTP object typed as `SMTPTransport.Options` with two fully typed Nodemailer adapters:
   - `SMTPPool.Options` when pooling is enabled (`pool: true` literal).
   - `SMTPTransport.Options` when pooling is disabled.
2. Removed the Windows `spawnSync pnpm.cmd` path that produced `EINVAL`.
3. Changed `pnpm mobile:align-sdk` to execute Expo's compatible installer directly through pnpm's script shell:
   - `expo@~54.0.36`
   - `expo-updates@~29.0.19`
4. Kept a corrected Node fallback helper that invokes the active pnpm CLI through Node instead of spawning a `.cmd` file.

## Verification performed in the artifact environment

- Package JSON parsing: passed.
- Alignment helper JavaScript syntax: passed.
- Nodemailer SMTP/SMTP-pool type fixture: passed with TypeScript strict mode.
- Invalid `pool` property on `SMTPTransport.Options`: removed.
- ZIP creation and integrity verification: passed.

## Required local commands

```powershell
pnpm install --frozen-lockfile
pnpm mobile:align-sdk
pnpm install --frozen-lockfile
pnpm rc2:source-verify
pnpm db:verify
pnpm db:integrity
pnpm mobile:doctor
pnpm mobile:export
```

The first install uses the packaged lockfile. `mobile:align-sdk` then updates the two Expo patch packages and refreshes the lockfile. The second frozen install verifies the updated lockfile.

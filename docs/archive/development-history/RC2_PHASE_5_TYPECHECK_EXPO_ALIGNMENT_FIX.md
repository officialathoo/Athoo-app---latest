# RC2 Phase 5 Typecheck and Expo Alignment Fix

Baseline: ATHOO_RC2_PHASE_5_FINAL_RELEASE_CANDIDATE_SOURCE_CERTIFIED.zip

## Fixed in source

- Corrected Nodemailer SMTP transport typing using `SMTPTransport.Options`.
- Normalized email template variables before Drizzle JSON insertion so `undefined` values cannot reach the database contract.
- Added explicit response returns to registration and password-login handlers to satisfy `noImplicitReturns`.
- Added explicit delivery-count row typing in the email admin route.
- Aligned Android status-bar background with the configured light splash background to remove the Expo splash conflict warning.

## Expo patch alignment

The baseline lockfile still pins Expo 54.0.35 and expo-updates 29.0.18 so the ZIP remains installable with `--frozen-lockfile`.
Run the included PowerShell helper after extraction while online:

```powershell
.\scripts\tools\align-expo-sdk.ps1
```

It updates both package.json and pnpm-lock.yaml through Expo's compatible installer, then runs Expo Doctor.

## Verification boundary

Static syntax checks passed for all changed TypeScript files. Full dependency-backed typecheck must be rerun locally because this packaging environment does not contain the workspace dependencies and cannot access the npm registry.

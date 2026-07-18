# RC2 Local Build Stabilization

## Fixed

- Replaced the Unix-only root `preinstall` shell command with a portable Node.js package-manager guard.
- Removed the stale `artifacts/**` typecheck filter after Replit wrappers were removed.
- Removed the unused `@replit/connectors-sdk` root dependency.
- Removed Replit-only workspace packages, catalogs, minimum-age exceptions, and Linux-only native-package exclusions.
- Restored Windows native optional dependencies for Rollup, esbuild, Tailwind oxide, Lightning CSS, and Expo tooling by removing platform-pruning overrides.
- Corrected the shared `AppInput` text tone from unsupported `default` to `primary`.
- Restored the device acceptance checklist and RC1 release-evidence template required by release tests.
- Updated migration-integrity tests to verify the authoritative shared migration constant.
- Updated the performance test to inspect the actual performance migration instead of the broadcast idempotency migration.

## Verification

- Project validation: passed (24 JSON files).
- API test suite: 216 passed, 0 failed.
- Focused release/device/migration/performance tests: 16 passed, 0 failed.
- YAML parsing: `pnpm-workspace.yaml` and `pnpm-lock.yaml` valid.
- No Replit runtime dependency or `artifacts/**` workspace filter remains.

## Local validation required

Run on Windows after extracting into a new folder:

```powershell
pnpm install --frozen-lockfile
pnpm check:project
pnpm typecheck
pnpm test
pnpm build
pnpm db:verify
pnpm db:integrity
pnpm mobile:doctor
pnpm mobile:validate
```

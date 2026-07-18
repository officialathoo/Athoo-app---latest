# RC2 Phase 5 Final Clean Typecheck and Dependency Policy Fix

## Baseline

Built only from `ATHOO_RC2_PHASE_5_MOBILE_TYPECHECK_EXPO_STABLE_FIXED.zip`.

## Corrections

- Corrected all remaining incorrectly cased React Native style properties in provider broadcast video modal styles.
- Added a release-gate scanner that rejects common lowercase React Native style keys before TypeScript compilation.
- Removed Expo dependency-validation bypasses. Expo Doctor now reports real compatibility status.
- Removed package-name-specific pnpm release-age exceptions.
- Replaced version-specific Expo alignment with `expo install --fix` selected by the installed Expo SDK.
- The Expo maintenance command temporarily relaxes pnpm's release-age gate only for the explicit update operation and restores the security setting immediately afterward.
- Existing semver compatibility ranges and the lockfile are retained. The lockfile is required for repeatable releases; compatible updates are applied deliberately through the update command and verified before deployment.

## Long-term dependency policy

- Patch/minor updates inside compatible ranges are allowed.
- Native Expo/React Native dependencies are aligned by Expo tooling rather than manually guessed versions.
- Major Node, pnpm, Expo SDK, React Native, database-driver, and build-tool upgrades remain deliberate migrations because they can contain breaking changes.
- No dependency validation warning is hidden to make a gate pass.

## Verification added

`pnpm mobile:styles:validate` is now part of `pnpm rc2:source-verify` through the release verification chain.

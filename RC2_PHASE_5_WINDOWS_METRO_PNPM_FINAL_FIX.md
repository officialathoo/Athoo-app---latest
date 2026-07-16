# RC2 Phase 5 — Windows Metro and pnpm Toolchain Fix

## Baseline

Built from `ATHOO_RC2_PHASE_5_FINAL_CLEAN_LONG_TERM_FIXED.zip`.

## User-confirmed state before this fix

- 376 tests passed.
- API, admin, mobile, and scripts TypeScript checks passed.
- API and admin production builds passed.
- Database schema verified with 37 migrations and no checksum drift.
- Database integrity passed.
- Expo package alignment completed.
- `expo-doctor` then failed because a hoisted `@expo/metro-config` could not resolve the app-local `expo/package.json`.
- `expo export` failed on Windows after Metro's config loader fell back to importing a drive-letter path as an ESM URL.

## Root correction

- Changed pnpm from the legacy hoisted layout to `nodeLinker: isolated`.
- Removed `shamefully-hoist` and the forced hoisted node linker.
- Removed the global `@esbuild-kit/esm-loader` override that could affect Metro config loading.
- Removed the redundant direct `@expo/cli` dependency; the installed `expo` package supplies its matching CLI.
- Added dynamic Expo SDK alignment without hardcoded patch versions.
- Added registry-based selection of a `@config-plugins/react-native-webrtc` release whose Expo peer range matches the installed SDK.
- Added a clean dependency reinstall and Metro resolution check.
- Added Node 22.x and pnpm 10.x preinstall validation while allowing supported patch/minor updates.
- Added permanent workspace and Metro validators to the release gate.

## Commands

Run once after applying this release or patch:

```powershell
pnpm mobile:repair-toolchain
pnpm rc2:source-verify
pnpm db:verify
pnpm db:integrity
pnpm mobile:doctor
pnpm mobile:export
```

`mobile:repair-toolchain` performs the clean node_modules reinstall itself.

## Verification performed in the packaging environment

- Project JSON validation passed.
- Release-check validation passed.
- React Native style-key validation passed.
- Expo workspace configuration validation passed.
- All new Node scripts passed syntax validation.
- The repair workflow was simulated with a fake registry/installer and selected the Expo-compatible WebRTC config plugin correctly.
- ZIP integrity and forbidden-file checks passed.

## Certification boundary

The packaging environment has no npm registry access, so the final real dependency reinstall, Expo Doctor, and Metro export must run on the Windows machine. The repair command is designed to execute those dependency-backed checks against the user's current registry and lockfile state.

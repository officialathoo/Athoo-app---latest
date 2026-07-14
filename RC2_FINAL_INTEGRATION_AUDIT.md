# Athoo RC2 Final Integration Audit — 2026-07-14

## Baseline
Replit checkpoint with 35 applied migrations ending at `20260714_service_areas_pakistan_location_system.sql`.

## Integration corrections applied

1. **Canonical toolchain restored**
   - Restored `pnpm@10.33.2` and Node `>=22 <23` to match CI, Render, Docker, Vercel, lockfile expectations, and the validated Windows environment.
   - Removed the Replit-only toolchain relaxation from the canonical source.

2. **Replit decoupling**
   - Removed `.replit`, `.replitignore`, `replit.md`, and the `artifacts/` wrapper/sandbox tree from the portable release source.
   - Removed generated `*.tsbuildinfo` files.
   - No Athoo application source was relocated.

3. **Protected document access fixed centrally**
   - `openAuthenticatedFile()` now automatically converts persisted `/objects/...` references into `/api/storage/objects/...`.
   - This fixes provider verification document opening and protects future callers from the same path mismatch.
   - Existing full URLs and already-normalized API paths remain backward compatible.

4. **Service-area duplicate validation aligned with the database**
   - Create/update checks now compare trimmed, case-insensitive city and province values.
   - This matches the existing database expression uniqueness rule and prevents generic database errors for casing/whitespace duplicates.

5. **Canonical service-area API adopted by mobile**
   - Mobile `getServiceAreas()` now calls `/api/service-areas`.
   - `/api/marketing/areas` remains available as a compatibility proxy for older clients; it was not removed.

6. **Project validation made environment-safe**
   - `.cache`, generated build, and coverage directories are ignored by `project-check`.
   - Real source JSON and conflicting package-manager files remain validated.

7. **Stale regression test corrected**
   - The city-picker test now verifies live `getActiveServiceAreas()` usage and asserts that the removed hardcoded city constant is absent.

## Verification completed in this audit environment

- `node scripts/tools/project-check.mjs`: passed, 22 JSON files checked.
- Focused city-picker/map/status-badge tests: 3 passed, 0 failed.
- No real `.env`, private key, PEM, Git metadata, node_modules, build output, or cache content remains in the packaged source.
- Latest shared migration constant matches the final migration filename.
- Direct notification-table writes remain confined to the shared notification helper.
- No old hardcoded `PAKISTAN_CITIES` or multi-city `CITY_FILTERS` implementation remains in active mobile/admin/API source.

## Verification limitation

A full dependency-backed typecheck/test/build could not be executed in this isolated audit container because the exported source intentionally excludes `node_modules` and internet installation was unavailable. Local verification commands are listed below and remain mandatory before deployment.

## Confirmed remaining product work

These are not claimed as completed:

- Native map/location crash reproduction and Android/iOS remediation.
- Full Pakistan district/tehsil/locality hierarchy; current completion is province + city standardization.
- Admin bulk select/approve/reject/activate/deactivate coverage across every requested page.
- Complete dark/light/system migration across all legacy screens.
- Voice-call real-device certification, ringing/audio route/speaker/mute behavior.
- Custom notification sounds and missed-call persisted notifications.
- Durable queue-based push delivery for crash-safe notification retries.
- Full Android and iPhone end-to-end acceptance testing.

## Mandatory local release checks

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

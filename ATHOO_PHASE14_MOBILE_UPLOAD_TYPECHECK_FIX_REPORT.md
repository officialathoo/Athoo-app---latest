# Athoo Phase 14 — Mobile Upload Typecheck Fix

**Input baseline:** `ATHOO_PHASE13_ADMIN_TYPECHECK_FIXED.zip`  
**Output candidate:** `ATHOO_PHASE14_MOBILE_UPLOAD_TYPECHECK_FIXED.zip`

## Connected test result that triggered this phase

The third Windows `pnpm run release:verify:code` run proved that:

- API typecheck passed.
- Admin-panel typecheck passed.
- Mobile typecheck reached the upload subsystem and reported eight compiler errors.

All eight errors had one root cause: sensitive upload callers had already been migrated to pass a fifth `private`/`shared` scope argument, but `uploadPickedImage` still accepted only four arguments and referenced an undefined `scope` variable.

## Fix

`athoo-app/services/storage.ts` now defines the portable upload contract as:

```ts
uploadPickedImage(uri, filename, contentType, onProgress, scope)
```

The default scope is `shared` for backward compatibility. Sensitive evidence workflows explicitly pass `private`. The scope is used when requesting backend upload instructions and is forwarded through provider-specific upload handling.

## Workflows corrected

- Customer premium-payment evidence
- Provider premium-payment evidence
- Provider commission-payment evidence
- Provider verification documents
- Provider registration documents
- Support ticket attachments
- Booking video upload

## Required next proof

Run the full dependency-aware Windows release verification against a clean Phase 14 extraction. No database migration or deployment is authorized until the command completes successfully.

## Source verification

- Phase 14 focused tests: **3/3 passed**
- Complete source regression suite: **452/452 passed**
- TypeScript/TSX syntax parsing: **506/506 passed**
- Project, release, operations, blueprint, security, Expo workspace, React Native style, mobile release, beta QA and device-preparation validations passed.
- Dependency-aware mobile typecheck, Metro loading and production builds must be rerun on the connected Windows workspace with installed dependencies.

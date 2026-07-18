# Athoo Phase 20 — Portable Storage and Legacy Cleanup

## Objective

Make object storage configurable without source-code changes, preserve current Cloudflare R2 compatibility, add migration-safe switching, and remove obsolete Replit object-storage remnants.

## Delivered

- Replaced the R2-only implementation with a provider registry covering S3-compatible vendors, Google Cloud Storage, and local development storage.
- Preserved existing `StorageProvider`, `/api/storage/*`, and `/objects/*` contracts.
- Preserved all current R2 environment names while adding canonical `STORAGE_S3_*` names.
- Added configuration-only support for AWS S3, MinIO, Wasabi, Backblaze B2 S3, DigitalOcean Spaces, custom S3-compatible endpoints, and GCS.
- Added a secret-safe Admin Panel storage status and active write/stat/delete connectivity test.
- Added dry-run, execution, and verification storage migration tooling.
- Removed unused Replit sidecar object-storage source files and the unused direct `google-auth-library` dependency.
- Retained `@google-cloud/storage` as an actual supported provider dependency rather than dead Replit code.
- Kept stateful switching restart-controlled to prevent split writes and lost in-flight uploads.
- Preserved the EAS project fallback in `athoo-app/app.config.js`.

## Removed legacy files

- `api-server/src/lib/objectStorage.ts`
- `api-server/src/lib/objectAcl.ts`

These files were not imported anywhere and were tied to a local Replit sidecar endpoint rather than Athoo's current Render/R2 architecture.

## Verification boundary

No real provider credentials are included in the package. Connected storage migration and provider connectivity must be tested in the deployment environment with secret-managed credentials.

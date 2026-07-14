# RC2 Runtime Blockers Patch 01

## Implemented

- Guarded native map initialization with a safe fallback instead of allowing a missing/failed native map module to terminate the route.
- Location requests now use last-known position first, balanced accuracy, a 12-second timeout, coordinate validation, and permission-aware user-location rendering.
- Presigned uploads now require a readable positive file size, with a blob fallback when native metadata lookup fails.
- Upload filenames/extensions are normalized to match their declared MIME type before the API policy check.
- Customer and provider profile-photo uploads now use the picker asset's actual filename and MIME type and show the real sanitized failure message.
- iOS image selection requests a compatible representation when supported.
- Added an in-app System/Light/Dark appearance selector to customer and provider profile screens.
- Added reusable admin bulk-action UI and select-all checkboxes for Service Areas and Categories, including bulk activate/deactivate.

## Verification

- Project structure validation passed.
- Focused runtime blocker tests: 4 passed, 0 failed.

## Remaining Work

- Complete theme-token migration is still required for legacy screens that import static `Colors` values.
- Bulk selection should be expanded to additional appropriate admin lists (users, providers, requests, verifications, complaints) with role-specific safe actions.
- Native Android/iOS device validation is required for maps, GPS permission denial, camera/gallery uploads, R2 PUT, and profile-photo persistence.

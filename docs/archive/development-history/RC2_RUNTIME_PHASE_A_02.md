# RC2 Runtime Phase A — Map Configuration and Native Upload URI Hardening

## Changes
- Prevents Android from mounting the native Google map when the build has no Google Maps API key; the screen remains usable through the existing fallback.
- Keeps iOS native map behavior intact because Apple Maps does not require the Android Google key.
- Stages Android `content://` and other non-file picker URIs into the Expo cache before binary upload when possible.
- Deletes temporary staged upload files after success or failure.
- Infers common MIME types from filename extensions when a picker supplies `application/octet-stream`.
- Rejects unsupported HEIC/HEIF assets with an actionable message rather than an opaque upload failure.

## Scope
No API routes, database schema, authentication, booking, Premium, notification, or admin behavior was changed.

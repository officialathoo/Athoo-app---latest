# Storage Provider Architecture

Athoo routes, mobile screens, database records, and business workflows use stable `/api/storage/*` APIs and stable `/objects/<key>` references. They never depend on a storage vendor URL or SDK.

## Supported adapters

### S3-compatible adapter

One adapter supports configuration-only switching among:

- Cloudflare R2;
- AWS S3;
- MinIO;
- Wasabi;
- Backblaze B2 S3;
- DigitalOcean Spaces;
- any conventional custom S3-compatible endpoint.

Select the vendor with `STORAGE_PROVIDER` and configure the canonical `STORAGE_S3_*` variables. Existing `CLOUDFLARE_R2_*`, `S3_*`, and AWS credential variable names remain backward compatible.

### Google Cloud Storage adapter

Set `STORAGE_PROVIDER=gcs` and provide `GCS_BUCKET` plus workload identity, application-default credentials, a key file, or secret-managed service-account JSON.

### Local adapter

`STORAGE_PROVIDER=local` is for development only and is rejected in production.

## Switching rule

Changing storage vendors does not require source-code, route, database-schema, mobile, or admin-panel changes. It does require:

1. configuring the target credentials in the deployment secret manager;
2. copying and verifying existing objects;
3. changing `STORAGE_PROVIDER` and its adapter settings;
4. restarting the API;
5. running the Admin Panel storage connectivity test and application upload/download checks.

Athoo deliberately does not hot-switch object storage during live requests. A runtime hot switch could split files across providers, invalidate signed URLs, and lose uploads in progress.

## Canonical S3-compatible settings

```env
STORAGE_PROVIDER=r2
STORAGE_S3_ENDPOINT=https://account-id.r2.cloudflarestorage.com
STORAGE_S3_REGION=auto
STORAGE_S3_ACCESS_KEY_ID=secret-managed-value
STORAGE_S3_SECRET_ACCESS_KEY=secret-managed-value
STORAGE_S3_BUCKET=athoo
STORAGE_S3_FORCE_PATH_STYLE=true
STORAGE_S3_USE_DEFAULT_CREDENTIALS=false
```

For AWS S3, `STORAGE_S3_ENDPOINT` is optional. Set `STORAGE_S3_USE_DEFAULT_CREDENTIALS=true` to use an attached IAM role/default AWS credential chain instead of storing static access keys. For R2, MinIO, Backblaze B2, and custom S3-compatible services it is required unless Athoo can derive it from provider-specific settings.

## Migration tooling

Dry run:

```bash
pnpm storage:migrate
```

Execute after reviewing the dry-run summary:

```bash
pnpm storage:migrate -- --execute
```

Verify source and target object sizes:

```bash
pnpm storage:verify
```

The tool never deletes source objects. It copies missing or size-mismatched objects and verifies each completed copy.

Source and target credentials use separate prefixed variables:

```env
STORAGE_MIGRATION_SOURCE_PROVIDER=r2
STORAGE_SOURCE_S3_ENDPOINT=...
STORAGE_SOURCE_S3_REGION=auto
STORAGE_SOURCE_S3_ACCESS_KEY_ID=...
STORAGE_SOURCE_S3_SECRET_ACCESS_KEY=...
STORAGE_SOURCE_S3_BUCKET=athoo-old

STORAGE_MIGRATION_TARGET_PROVIDER=s3
STORAGE_TARGET_S3_REGION=ap-south-1
STORAGE_TARGET_S3_ACCESS_KEY_ID=...
STORAGE_TARGET_S3_SECRET_ACCESS_KEY=...
STORAGE_TARGET_S3_BUCKET=athoo-new
```

GCS source or target uses `STORAGE_SOURCE_GCS_*` or `STORAGE_TARGET_GCS_*`.

## Security

- Keep credentials only in Render or the deployment secret manager.
- Never put storage credentials in `EXPO_PUBLIC_*` variables.
- Production custom endpoints must use HTTPS.
- The Admin Panel receives readiness booleans, not secret values.
- Storage tests create a small `.athoo-health/*` object, verify it, and delete it.
- Preserve private bucket defaults and serve access through Athoo authorization or short-lived signed URLs.

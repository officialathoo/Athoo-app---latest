# Storage Provider Switch Runbook

## 1. Prepare the target

Create a private target bucket, least-privilege service credentials, lifecycle rules, CORS rules for signed uploads, and any required region/endpoint settings. Do not change the live Athoo provider yet.

## 2. Dry-run migration

Configure `STORAGE_MIGRATION_SOURCE_PROVIDER`, `STORAGE_MIGRATION_TARGET_PROVIDER`, and the corresponding source/target secret variables. Run:

```bash
pnpm storage:migrate
```

Review object count, byte count, matching objects, and objects that would be copied.

## 3. Copy objects

```bash
pnpm storage:migrate -- --execute
```

The source remains untouched. Re-running is safe because size-matching target objects are skipped.

## 4. Verify

```bash
pnpm storage:verify
```

Do not cut over while mismatched or failed objects remain.

## 5. Configure Athoo

Set the normal `STORAGE_PROVIDER` and adapter variables to the target in Render. Keep the source credentials available for rollback, but not in the mobile or admin builds.

## 6. Restart and test

Deploy/restart the API, then open:

`Admin Panel → Platform Settings → Communication & External Providers → Test Storage`

Also verify:

- profile image upload and display;
- camera and gallery media upload;
- KYC document upload and protected viewing;
- Premium/commission/refund evidence upload;
- chat media upload and viewing;
- object deletion and replacement workflows.

## 7. Rollback

If validation fails, restore the previous `STORAGE_PROVIDER` settings and restart. Because source objects were not deleted, rollback does not require reverse migration.

## 8. Retire the source

Keep the old provider read-only for an agreed safety window. Delete it only after database references, application workflows, backups, and target retention policies are verified.

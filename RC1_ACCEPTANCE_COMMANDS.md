# ATHOO RC1 Acceptance Commands

## Code verification

```bash
pnpm install --frozen-lockfile
pnpm release:verify:code
```

## Database

```bash
pnpm db:migrate
pnpm db:verify
pnpm db:integrity
DATABASE_URL=postgresql://.../athoo DB_ADMIN_URL=postgresql://.../postgres pnpm db:rehearse
```

## Cross-role API

```bash
RC_API_BASE_URL=https://<staging-api> \
RC_CUSTOMER_IDENTIFIER=... RC_CUSTOMER_PASSWORD=... \
RC_PROVIDER_IDENTIFIER=... RC_PROVIDER_PASSWORD=... \
RC_ADMIN_IDENTIFIER=... RC_ADMIN_PASSWORD=... \
pnpm rc:workflow-smoke
```

## Performance

```bash
PERF_API_BASE_URL=https://<staging-api> \
PERF_ACCESS_TOKEN=<dedicated-token> \
PERF_ROUTES=/api/health,/api/categories,/api/settings/public,/api/bookings/summary,/api/me/notifications \
PERF_CONCURRENCY=20 PERF_REQUESTS_PER_ROUTE=200 \
PERF_P95_LIMIT_MS=750 PERF_ERROR_RATE_LIMIT=0.01 \
pnpm performance:smoke
```

## Mobile and devices

```bash
pnpm mobile:doctor
pnpm mobile:export
pnpm device:prepare

eas build --profile preview --platform android
eas build --profile preview --platform ios
```

Execute `device-acceptance-checklist.json` and `docs/DEVICE_ACCEPTANCE_RUNBOOK.md` on physical Android and iOS devices.

## Final decision

```bash
cp rc1-evidence-template.json rc1-evidence.json
# Fill evidence, artifact hash, defect counts, and approvals.
pnpm rc1:decision ./rc1-evidence.json
```

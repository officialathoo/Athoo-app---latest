# Athoo Production GO Checklist

This repository is configured for GitHub, Neon PostgreSQL, Render API hosting, Vercel admin hosting, Cloudflare R2 object storage, and Expo EAS mobile builds.

## Required deployment order

1. Create the private GitHub repository and push this source tree.
2. Create Neon production and staging databases. Use pooled URLs for the API and direct URLs for migrations when required.
3. Create a private Cloudflare R2 bucket and API token restricted to that bucket.
4. Deploy the API from `render.yaml`; set every secret marked `sync: false`.
5. Run database migrations and `pnpm db:verify` against staging, then production.
6. Deploy the admin panel to Vercel from the repository root and set `VITE_API_BASE_URL`.
7. Configure the API CORS allowlist with the exact Vercel/admin domain and approved application domains.
8. Configure Expo EAS secrets and build Android and iOS preview binaries.
9. Execute API smoke, performance smoke, Android acceptance, iOS acceptance, backup and restore rehearsal.
10. Complete `rc1-evidence.json`; run `pnpm rc1:decision`. Production is GO only when it returns `GO`.

## Never commit

Real `.env` files, Neon credentials, R2 secret keys, Expo tokens, SMTP passwords, signing certificates, service-account JSON, device evidence containing personal data, or database backups.

## Required production services

- Render: `athoo-api`
- Vercel: admin static application
- Neon: PostgreSQL
- Cloudflare R2: private object bucket
- Expo EAS / FCM / APNs: mobile builds and notifications
- Transactional SMTP provider
- Error monitoring such as Sentry

The built-in queue uses PostgreSQL (`QUEUE_PROVIDER=postgres`), so Redis is not mandatory for the initial launch.

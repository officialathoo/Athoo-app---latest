# ATHOO Staging Deployment Runbook

1. Create an isolated staging PostgreSQL database, R2 bucket, SMTP account, Expo project, and staging domains.
2. Copy `.env.production.example` to a secure staging environment file. Set `NODE_ENV=staging`; never commit the completed file.
3. Validate configuration: `pnpm env:validate /secure/path/staging.env`.
4. Install exact dependencies: `pnpm install --frozen-lockfile`.
5. Run the code release gate: `pnpm release:verify:code`.
6. Apply migrations: `pnpm db:migrate`, then `pnpm db:verify`.
7. Create the first administrator once: set the `BOOTSTRAP_ADMIN_*` variables and run `pnpm admin:bootstrap`. Delete the bootstrap password from shell history and secret storage immediately afterward.
8. Deploy API and admin from the same Git commit/package checksum.
9. Run `SMOKE_API_BASE_URL=https://api-staging.example.com pnpm smoke:test`.
10. Build internal Android/iOS packages from the same commit and complete the closed-beta checklist.

A failed environment validation, release gate, migration, health check, or smoke test stops the deployment.

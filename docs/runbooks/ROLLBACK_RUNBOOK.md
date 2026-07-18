# ATHOO Rollback Runbook

1. Stop the release if migrations, health checks, smoke tests, or critical journeys fail.
2. Keep the previous API/admin container or package and its environment configuration available.
3. Before any destructive/data-changing release, create `pnpm db:backup` and verify the file exists.
4. Prefer forward-fix migrations. Do not edit or delete an applied migration.
5. For application-only failure, redeploy the previous application artifact while keeping the database if it remains backward compatible.
6. For incompatible schema failure, place Athoo in maintenance mode, preserve logs and a fresh backup, then restore only after explicit technical approval using `pnpm db:restore <file> --confirm-destructive-restore`.
7. Run `pnpm smoke:test` after rollback and verify login, booking, chat, finance, and admin access.
8. Record incident timeline, affected users, root cause, and corrective action before the next release.

# ATHOO Database Backup, Restore, and Migration Rehearsal

## Required PostgreSQL tools

The local machine must have compatible versions of:

- `pg_dump`
- `pg_restore`
- `psql`
- `createdb`
- `dropdb`

Verify them with:

```bash
pnpm db:tools-check
```

## Create a verified backup set

```bash
DATABASE_URL=postgresql://... \
DB_BACKUP_DIR=./backups \
DB_BACKUP_RETENTION_DAYS=14 \
pnpm db:backup
```

Each backup consists of:

- `*.dump` — PostgreSQL custom-format snapshot
- `*.dump.manifest.json` — source fingerprint, migration, tool version, size, checksum
- `*.dump.sha256` — SHA-256 verification file

Files are created with owner-only permissions. Store copies on encrypted storage outside the application host.

## Restore to an explicit target

Restores never use `DATABASE_URL` implicitly. Set a separate target and confirm its exact database name:

```bash
RESTORE_DATABASE_URL=postgresql://.../athoo_restore_test \
pnpm db:restore ./backups/athoo-....dump \
  --confirm-database=athoo_restore_test
```

The restore verifies the checksum and archive catalog, then performs a clean, transactional restore.

## Full rehearsal

`DB_ADMIN_URL` must connect to a maintenance database on a PostgreSQL server where the user can create and drop temporary databases.

```bash
DATABASE_URL=postgresql://.../athoo_source \
DB_ADMIN_URL=postgresql://.../postgres \
pnpm db:rehearse
```

The rehearsal:

1. Creates and verifies a custom-format backup.
2. Restores it into an isolated temporary database.
3. Runs `db:verify` and `db:integrity` against the restored database.
4. Creates a second empty temporary database.
5. Applies the baseline and every migration from scratch.
6. Runs `db:verify` and `db:integrity` against the fresh database.
7. Compares latest migration IDs.
8. Drops both temporary databases.

Use `KEEP_REHEARSAL_BACKUP=true` to retain the generated rehearsal backup.

## Safety

- Never rehearse against the production database itself.
- Use a restricted rehearsal server or local PostgreSQL instance.
- Keep at least one off-host encrypted backup.
- Run a restore rehearsal before every release candidate and after migration changes.
- Record elapsed time and backup size to establish recovery-time and recovery-point expectations.

# Athoo RC2 Protected Baseline

This package is the protected starting point for the Athoo RC2 production upgrade program.

## Baseline rules

- Preserve all currently working behavior.
- Apply isolated, backward-compatible patches only.
- Keep migrations append-only and idempotent.
- Run project validation, TypeScript, tests, builds, database verification, integrity checks, and mobile validation after changes.
- Require real-device regression testing before release certification.

## Included systems

- React Native / Expo customer and provider application
- Node.js API server
- Vite administration panel
- Shared database and API libraries
- SQL baseline and ordered deployment migrations
- EAS, Render, Docker, Vercel, Maestro and CI configuration
- Operational deployment, rollback, incident-response and retention documentation

## Cleanup performed

Only nonfunctional artifacts were removed:

- Real `.env` file (examples remain)
- Generated `*.tsbuildinfo`
- Obsolete RC1 device-fix and stabilization reports
- Closed-beta evidence templates and outdated checklists
- Logs, temporary files, source maps, nested ZIPs and checksums

No application source, migrations, tests, assets, deployment configuration, or operational runbooks were removed.

## Migration baseline

Latest ordered migration:

`20260713_broadcast_request_idempotency.sql`

The database and API migration-health constants must continue to match this filename until a newer append-only migration is introduced.

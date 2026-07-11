# Athoo Clean RC1 Source Package

This package contains the Athoo application source required for development, testing, deployment, and release validation.

## Main workspaces
- `api-server/` — backend API
- `admin-panel/` — web administration panel
- `athoo-app/` — Expo/React Native customer and provider mobile application
- `lib/` — shared packages and database schema
- `scripts/` — release, database, security, and validation tooling
- `sql/` and `deploy/` — database and deployment resources
- `.maestro/` — Android/iOS device smoke tests

## Setup
1. Copy the appropriate `.env*.example` files and provide real environment values locally.
2. Install the Node.js version declared by `.nvmrc` or `.node-version`.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm verify` for the standard code validation pipeline.

Generated build folders, dependency folders, temporary files, historical certification reports, phase changelogs, and audit evidence were intentionally excluded.

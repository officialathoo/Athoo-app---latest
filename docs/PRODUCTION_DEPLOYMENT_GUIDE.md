# Athoo Production Deployment Guide

Athoo is structured to be provider-agnostic: backend API, admin panel, PostgreSQL, Redis, storage, maps, notifications, and email are configured by environment variables.

## Local run
```powershell
pnpm install --ignore-scripts
pnpm run build
cd api-server
pnpm run start
```

Admin:
```powershell
cd admin-panel
pnpm run dev
```

Mobile:
```powershell
cd athoo-app
pnpm run start -- --clear
```

## Docker run
Copy `.env.production.example` to `.env.production`, fill real secrets, then:
```bash
docker compose up --build -d
```

## Own server/domain
1. Point `api.yourdomain.com` to backend.
2. Point `admin.yourdomain.com` to admin panel.
3. Set `API_BASE_URL`, `ADMIN_BASE_URL`, `CORS_ORIGIN`, `DATABASE_URL`, `REDIS_URL`, storage and notification variables.
4. Run DB migrations before exposing traffic.
5. Use HTTPS via Nginx/Caddy/Traefik or cloud load balancer.

## Backup
```bash
pg_dump "$DATABASE_URL" > athoo_backup.sql
```

## Restore
```bash
psql "$DATABASE_URL" < athoo_backup.sql
```

## Notes
Expo Go cannot test real Android push notifications. Use an Expo development build or production build for push, biometric, and native-call behavior.

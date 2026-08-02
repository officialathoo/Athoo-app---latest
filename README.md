# Athoo App V2.1 — Connected-Certification Hardened Candidate

This repository is the cumulative Athoo App V2.1 baseline. It preserves the complete V2 application and strengthens the connected release path so the exact source, database, storage, map, email, OTP and malware-scanner evidence can be verified from one release identity.

## Workspaces

- `api-server/` — authenticated API, authorization, bookings, realtime events, secure uploads, invoices and provider abstractions
- `admin-panel/` — operational administration panel
- `athoo-app/` — Expo/React Native customer and provider application
- `lib/` — shared API and database packages
- `scripts/` — database, validation, security and release tooling
- `deploy/` and `sql/` — ordered migrations and deployment resources
- `.maestro/` — mobile smoke-test flows

## V2 source position

- Media is quarantined, locked, content-inspected, externally malware-scanned and promoted only after a clean result.
- Protected media requires entity-level owner, participant, eligible-provider or administrator authorization.
- Account deletion and temporary deactivation require password or verified email/mobile OTP step-up.
- Broadcast, direct and negotiated jobs use a single final acceptance and atomic winner selection.
- Scheduled jobs use schedule-aware expiry and reminders; arrival uses a configurable GPS geofence.
- Negotiations preserve media, canonical location, hourly charges and travelling charges into the booking.
- Invoices use Athoo branding and signed non-PII QR verification.
- Booking history uses bounded cursor pagination, immediate sanitized cache hydration and silent delta refresh.
- Every new booking, broadcast, negotiation and saved address requires one canonical location snapshot: address, city, area, province, ISO country code, coordinates, source, accuracy and confirmation time.
- Default service-area seed supports all Pakistani provinces and territories, while administrators retain runtime control over active regions, cities and areas.
- Stage 24/Phase 25 provider-neutral maps, storage, email, push, calls, notifications, sessions and device-evidence controls remain active.
- Connected production verification now validates a harmless PNG through the real malware scanner and requires rejection of the safe EICAR antivirus test signature.
- The connected GitHub workflow installs the locked pnpm version before enabling dependency caching and uploads evidence under the active V2 release name.

## Local source verification

```powershell
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install --frozen-lockfile
pnpm rc2:source-verify
pnpm db:verify
pnpm db:integrity
pnpm mobile:doctor
pnpm mobile:export
```

## Connected certification

Use `ATHOO_APP_V2_1_CONNECTED_CERTIFICATION_HARDENED.zip` as the only active candidate and follow:

- `docs/archive/development-history/ATHOO_APP_V2_SOURCE_COMPLETION.md`
- `docs/archive/development-history/ATHOO_APP_V2_1_CONNECTED_CERTIFICATION_HARDENING.md`
- `docs/runbooks/FINAL_CONNECTED_DEPLOYMENT.md`
- `docs/runbooks/PRODUCTION_LAUNCH_RUNBOOK.md`
- `docs/runbooks/DEVICE_ACCEPTANCE_RUNBOOK.md`
- `docs/qa/device-acceptance-checklist.json`
- `docs/qa/device-acceptance-evidence-template.json`
- `docs/qa/rc2-evidence-template.json`

“Source verified” does not mean “production certified.” Launch remains prohibited until clean dependency-backed typecheck/builds, Neon migration rehearsal, real storage and malware-scanner probes, legacy-media remediation, exact Android/iPhone evidence, load/recovery/security testing and the final release decision all pass.

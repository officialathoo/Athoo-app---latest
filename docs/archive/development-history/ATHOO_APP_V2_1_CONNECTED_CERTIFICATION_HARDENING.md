# Athoo App V2.1 Connected-Certification Hardening

## Candidate

`ATHOO_APP_V2_1_CONNECTED_CERTIFICATION_HARDENED.zip`

This candidate continues from `ATHOO_APP_V2_SOURCE_COMPLETE_CERTIFICATION_READY.zip`. It does not replace application features with a new architecture. It hardens the evidence and connected-verification path required to certify the existing V2 source against the real production services.

## Implemented in V2.1

- Corrected the connected GitHub workflow so pnpm 10.33.2 is installed before the pnpm dependency cache is enabled.
- Bound connected evidence to the active V2 release name rather than the obsolete Phase 23 artifact name.
- Added a permission-protected administrator scanner-test endpoint.
- Added a real malware-scanner certification probe that must accept a harmless one-pixel PNG.
- Added a safe EICAR antivirus-test probe that the configured scanner must reject.
- Added scanner and upload-security maintenance status to administrator integration health.
- Required deep health, administrator integration status and the direct scanner probe to agree before connected verification passes.
- Expanded connected evidence schema to record scanner safety and upload-maintenance results without exposing secrets or raw malicious-test content.
- Corrected production guidance to require `UPLOAD_SCAN_MODE=required`.
- Updated active release metadata, deployment runbooks, device evidence, validators and regression guards to V2.1.

## Source verification completed in the isolated audit environment

- API/regression tests: 576 passed, 0 failed.
- TypeScript/TSX syntax parsing: 553 files, 0 syntax diagnostics.
- JavaScript syntax: 44 files, 0 errors.
- JSON parsing: 36 files, 0 errors.
- Project structure validation: passed.
- Release metadata validation: passed.
- Operations-readiness validation: passed.
- Release-blueprint validation: passed.
- Security scan: passed.
- Expo workspace validation: passed.
- React Native style validation: passed.
- Mobile-release validation: passed.
- Beta-QA validation: passed.
- Device-acceptance preparation validation: passed.

## Evidence not produced in the isolated audit environment

The environment could not reach the package registry and did not contain the locked pnpm/dependency installation. Therefore the following are deliberately still pending:

- frozen-lockfile dependency installation;
- dependency-backed monorepo typecheck;
- API and admin production builds;
- Metro dependency resolution and Expo export;
- Neon migration rehearsal and rollback evidence;
- real R2/GCS quarantine, promotion, denial and cleanup evidence;
- live malware-scanner clean/EICAR evidence;
- Render, Vercel, maps, email, phone OTP, push and TURN verification;
- Android and iPhone physical-device evidence;
- connected load, outage, restoration and penetration-test evidence.

## Certification boundary

V2.1 is source-verified and connected-certification hardened. It is not production certified. `docs/qa/current-release-status.json` remains the authoritative launch gate, and launch remains `NO-GO` until every external evidence item is completed against the exact candidate checksum and commit.

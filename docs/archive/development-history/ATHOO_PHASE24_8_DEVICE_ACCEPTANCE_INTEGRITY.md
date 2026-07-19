# Athoo Phase 24.8 — Device Acceptance Integrity

## Baseline

- Input: `ATHOO_PHASE24_7_BROADCAST_LIFECYCLE_INTEGRITY_DEVICE_VALIDATION_READY.zip`
- Output: `ATHOO_PHASE24_8_DEVICE_ACCEPTANCE_INTEGRITY_READY.zip`
- Launch status: **NO-GO until dependency-backed, connected, physical-device, load, recovery and security evidence passes**

## Why this phase was required

The source contained device acceptance tooling, but evidence could still be copied from a template without cryptographically binding it to the active ZIP. Cross-role cases did not require both physical build identities, generic notes such as `OK` could be accepted, the template could drift from the checklist, and the final RC2 decision did not verify a passed device summary. Several originally reported defects were also covered only indirectly.

## Production changes

- Added `device:evidence:init` to compute the exact candidate SHA-256 and generate all evidence cases from the certified checklist.
- Required `device:evidence:validate` to reopen the supplied candidate ZIP and recompute its filename and SHA-256 instead of trusting copied JSON fields.
- Upgraded device evidence to schema v4 and bound it to the active candidate filename, real release version, non-zero Git commit and non-zero ZIP checksum.
- Required exact Android and iOS build provenance with HTTPS artifact URLs.
- Required every completed case timestamp to follow the corresponding build creation time.
- Required real evidence references and specific notes; generic placeholders are rejected.
- Required every cross-role case to identify both Android and iPhone build IDs, devices and OS versions.
- Enforced exact checklist/template/evidence case parity so missing, duplicated and unknown cases fail.
- Added explicit physical acceptance for:
  - full map-tile rendering instead of a white map;
  - provider location refresh on open/foreground;
  - radius persistence and live matching;
  - broadcast delivery after location/radius changes;
  - immediate old-device session revocation;
  - biometric enable/unlock/disable behavior;
  - call crash resistance and two-way audio;
  - bottom safe-area compatibility;
  - non-overlapping availability time selection;
  - availability animation/server-state consistency;
  - invoices containing no tax.
- Upgraded RC2 evidence to schema v4 and made GO depend on a passed matching device summary.
- Updated active deployment, launch and device runbooks to the exact Phase 24.8 candidate.

## Verification

- Phase 24.8 focused tests: **4/4 passed**
- Complete API/source suite: **521/521 passed**
- TypeScript/TSX syntax transpilation: **532/532 passed**
- JavaScript syntax checks: **44/44 passed**
- Project, release, operations, release-blueprint, security, Expo workspace, React Native style, mobile release, beta QA and strict device-preparation validators: **passed**
- `pnpm run release:verify:code`: **not executed in the packaging environment because pnpm was unavailable**

The focused suite executes the initializer, validates a complete exact-build evidence set, proves build drift is rejected, and proves RC2 GO is rejected when the device summary is not passed or does not match the release identity.

Connected infrastructure and physical-device behavior are intentionally not represented as passed by this source-only phase.

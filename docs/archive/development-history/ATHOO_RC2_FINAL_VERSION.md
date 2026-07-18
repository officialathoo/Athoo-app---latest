# Athoo RC2 Final Release-Candidate Source

## Canonical baseline

This cumulative package was built directly and only from:

```text
ATHOO_RC2_PHASE_4C_PORTABLE_MAP_CONNECTED_RUNTIME_CERTIFIED.zip
SHA-256: cf56ae5904636083cd467094fe12967771c259e45f1a95683366f6f0085747c5
```

It preserves all previously certified authentication, maps, theme, branding, notification/call sound, email and portability work. No older baseline was merged.

## Phase 5 final release-candidate hardening

- Added provider-neutral WhatsApp Cloud, verified-email fallback and generic HTTPS SMS authentication OTP adapters.
- Restricted phone registration to phone-bound OTP channels so email cannot incorrectly prove phone ownership.
- Restricted phone-login email fallback to already verified account emails.
- Added safe release version, commit and build identity to health endpoints.
- Added storage and phone-registration OTP readiness diagnostics.
- Added strict connected verification for deployed release identity, CORS, Neon, storage, maps, email and controlled OTP delivery.
- Added Android, iPhone and cross-role evidence schemas and validators.
- Added a formal RC2 GO/NO-GO decision gate requiring zero open P0/P1 defects and four-role approval.
- Added a manual, secret-safe connected-runtime GitHub workflow with redacted evidence artifacts.
- Corrected pnpm setup order in CI and disabled package-manager caching in the secret-bearing connected workflow.
- Added a distinct registration-code email template so phone registration and email-address verification remain separate security controls.

## Source verification completed

```text
Project validation:                    33 JSON files passed
Release check:                         Passed
Mobile release validation:             Passed
Closed-beta validation:                Passed
Operations readiness:                  Passed — 6 runbooks
Security scan:                         Passed
Device preparation:                    Passed
YAML parsing:                           3 files passed
TypeScript/TSX syntax-transpile audit: 462 files passed
Focused Phase 5 tests:                 5 passed, 0 failed
Complete API source regression:         376 passed, 0 failed
Production-like environment fixture:    Passed
Unsafe email-only phone registration:   Correctly rejected
```

## Honest certification boundary

This package is source-certified. It is not evidence that dependency-backed workspace typecheck/build, Neon, Render, Vercel, R2, Mapbox, Zoho/SMTP, WhatsApp/SMS, Expo push, EAS Android/iOS builds or physical-device tests have already passed.

Use `docs/archive/development-history/RC2_PHASE_5_FINAL_RELEASE_CANDIDATE_INTEGRATION_CERTIFICATION.md`, `docs/runbooks/FINAL_CONNECTED_DEPLOYMENT.md`, `docs/runbooks/MOBILE_BETA_RELEASE_RUNBOOK.md`, `docs/qa/device-acceptance-evidence-template.json` and `docs/qa/rc2-evidence-template.json` to complete the final connected and device certification.

## RC2 Phase 3B — Shared Theme and Runtime Configuration

The latest cumulative source includes source-certified shared-component dark-theme
migration, semantic icon defaults, approved loading-logo use, runtime-configurable
support/legal destinations, and the restored safe production environment template.
See `docs/archive/development-history/RC2_PHASE_3B_THEME_SHARED_COMPONENTS_CERTIFICATION.md` for scope, evidence,
remaining inventory, and local/native verification requirements.

## RC2 Phase 3C — Theme, Branding, Calls and Portable Runtime Configuration

The latest cumulative source now includes centralized light/dark brand configuration,
configurable native splash and identity assets, approved-logo replacement, theme-safe
notification/toast/call UI, server-configured STUN/TURN and fallback-audio timing, and
removal of hosting-vendor API/tile fallbacks from mobile runtime source.

See `docs/archive/development-history/RC2_PHASE_3C_THEME_BRANDING_CALL_CONFIGURATION_CERTIFICATION.md` for the exact
baseline hash, changed scope, regression evidence, remaining color inventory and live
device certification boundary.

## RC2 Phase 3D — Individual Theme and Portability Certification

The latest cumulative source removes legacy and literal colors from all mobile feature
screens, introduces contrast-safe rendering for admin-managed category colors, fixes
two helper-component theme-scope defects, centralizes invoice/support/referral values,
and removes the final direct mobile route/map-vendor dependency from booking/job flows.

See `docs/archive/development-history/RC2_PHASE_3D_INDIVIDUAL_THEME_PORTABILITY_CERTIFICATION.md` for the exact
baseline hash, scope, regression evidence, measured improvements and physical-device
certification boundary.

## RC2 Phase 4A — Notification and Call Sound Certification

The cumulative source includes configurable job, message, general, and call notification
policies; corrected Android channel versioning; foreground/background ringtone ownership;
push portability; duplicate-sound prevention; and safe push diagnostics.

See `docs/archive/development-history/RC2_PHASE_4A_NOTIFICATION_CALL_SOUND_CERTIFICATION.md` for the exact baseline,
verification evidence, native-build requirement, and physical-device boundary.

## RC2 Phase 4B — Portable Email System Certification

The latest cumulative source adds provider-neutral SMTP delivery, secure email verification
and email OTP login, recovery/security/account/booking/finance emails, durable delivery
queues and audit logs, consent/preferences/unsubscribe controls, a permissioned Admin Email
Center, Urdu UI coverage, retention controls, and additive database migration
`20260715_portable_email_delivery_verification.sql`.

See `docs/archive/development-history/RC2_PHASE_4B_PORTABLE_EMAIL_SYSTEM_CERTIFICATION.md` for the exact baseline hash,
security model, configuration, regression evidence, deployment order, and connected-testing
boundary.

## RC2 Phase 4C — Portable Maps and Connected Runtime

The cumulative source includes provider-neutral map tiles, search, reverse geocoding and directions; backend-only Mapbox credentials; Photon saved-address geocoding; cache and tile-size safety; and redacted connected-runtime evidence generation.

See `docs/archive/development-history/RC2_PHASE_4C_PORTABLE_MAP_CONNECTED_RUNTIME_CERTIFICATION.md` for the exact scope and source certification boundary.

## RC2 Phase 5 — Final Release-Candidate Integration

The latest source adds portable authentication OTP delivery, phone-registration channel safety, release identity, connected deployment matching, physical-device evidence validation and a formal production GO/NO-GO decision gate.

See `docs/archive/development-history/RC2_PHASE_5_FINAL_RELEASE_CANDIDATE_INTEGRATION_CERTIFICATION.md` for the complete audit, test evidence, configuration and remaining live release gates.

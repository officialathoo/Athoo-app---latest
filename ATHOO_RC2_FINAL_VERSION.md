# Athoo RC2 Final Version for Connected Testing

## Canonical baseline

This package is cumulative and was built directly on:

`ATHOO_RC2_PHASE_8B4_SUPPORT_POLICY_SECURITY_PROFESSIONAL_UX.zip`

It retains all completed Phase 1–8B4 work and adds the final connected-testing hardening listed below.

## Final hardening completed

- Production OTP endpoints now return success only when WhatsApp or SMTP actually delivers the code.
- Failed production OTP delivery invalidates the persisted OTP and returns a user-safe temporary-unavailable response.
- Password-reset requests use a signed opaque challenge instead of returning a customer's full phone number.
- OTP values returned for local development are never rendered by production mobile builds.
- Root and mobile EAS configuration are synchronized and point to the connected Render API.
- Render configuration now declares WhatsApp OTP, SMTP sender, and production dev-OTP controls.
- App configuration and crash screens show customer-friendly copy rather than environment or developer instructions.
- Runtime mobile diagnostics now pass through a production-safe logger that suppresses raw call, media, request, and exception details outside development.
- A responsive viewport prevents stretched web/desktop previews while keeping native phone layouts full width.
- The approved centered icon, adaptive icon, splash, notification icon, and single white background are retained.
- Closed beta and feedback-triage operational documents are restored to the canonical source.

## Verification performed in this package

- Project validation: passed — 31 JSON files.
- Release check: passed.
- Mobile release validation: passed.
- Closed-beta QA validation: passed.
- Operations readiness: passed — 6 runbooks.
- Security scan: passed.
- Device-acceptance preparation: passed.
- TypeScript/TSX parser validation: 445 files, 0 syntax failures.
- Source regression suite: 309 passed, 0 failed.
- Database migration added by this final phase: no.
- Existing API route removed: no.
- Existing cumulative phase work removed: no.

## External release gates still required

This source package intentionally excludes dependencies, deployment secrets, signing credentials, and live infrastructure access. The following must be performed through the connected Athoo workflow:

1. Install dependencies and run the dependency-backed typecheck/build locally.
2. Push the exact source to GitHub `main`.
3. Verify Render API deployment and `/api/healthz`.
4. Run Neon migration verification and integrity checks.
5. Verify the Vercel admin deployment.
6. Configure at least one real OTP channel in Render: WhatsApp or SMTP.
7. Build the EAS development APK and test it on the Android phone.
8. Complete `CLOSED_BETA_CHECKLIST.md` before production certification.

This ZIP is the canonical RC2 code-final baseline for connected deployment and device testing. It is not evidence that Render, Neon, Vercel, R2, WhatsApp/SMTP, Android, or iOS live tests have already passed.

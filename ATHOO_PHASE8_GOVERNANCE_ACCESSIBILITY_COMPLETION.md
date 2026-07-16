# Athoo Phase 8 — Governance, Inactivity Lifecycle, Accessibility and Release Readiness

## Baseline

This phase was completed only against `ATHOO_PHASE7_SESSION_SECURITY_FIXED.zip`.

## Objective

Close the remaining source-level gaps around inactive-account operations, policy governance, admin/mobile accessibility, cross-platform visual consistency, and final connected-production preparation without introducing automatic destructive account behavior.

## Completed work

### 1. Safe inactive-account lifecycle

- Added `lastActiveAt` and staged lifecycle states: `active`, `warning`, `restricted`, and `review`.
- Added configurable warning, restriction, and administrator-review thresholds.
- Added rate-limited activity tracking for authenticated customer/provider requests and successful sign-ins.
- Returning users clear inactivity lifecycle flags through verified activity.
- Returning providers are not silently made available; they must intentionally turn availability back on.
- Warning stage sends in-app/push and email reminders.
- Restriction stage pauses provider matching and sends a reasoned notice.
- Review stage creates an exact administrator notification and review-queue item.
- Permanent account deletion is never triggered automatically by inactivity.
- Automated sweeps are concurrency-safe and do not suppress retries after failures.
- Inactivity-specific administrator actions reject active accounts, preventing ID-based misuse.
- Manual deactivation is audited, revokes sessions, disables matching, and clears stale push-token ownership.

### 2. Inactive-account operations in admin

- Added a searchable, filterable, paginated inactivity queue.
- Added summary cards for warnings, restrictions, and administrator reviews.
- Added explicit actions to remind, clear review, or manually deactivate with reason requirements.
- Added an on-demand lifecycle sweep for authorized settings administrators.
- Added exact notification routing to the referenced inactive account.
- Added a dedicated sidebar count for accounts requiring administrator review.

### 3. Versioned policy governance

- Added a versioned `policy_documents` database model.
- Added bilingual title, summary, and full-content fields.
- Added customer/provider/all audience controls.
- Added explicit draft, publish, unpublish, and update workflows.
- Every content update automatically returns the document to draft for review.
- Added audit records for creation, update, publication, and unpublication.
- Only Privacy Policy and Terms of Service can require account acceptance.
- Required-acceptance policy versions must match the application legal version.
- Added public read-only policy APIs and permission-protected admin APIs.
- Seeded nine operational policy documents:
  - Privacy Policy
  - Terms of Service
  - Community Guidelines
  - Complaints and Support Policy
  - Provider Commission Policy
  - Refund and Cancellation Policy
  - Account Restriction Policy
  - Account Deletion and Retention Policy
  - Athoo Rights and Platform Controls

The seeded content is an operational product baseline, not a substitute for review by qualified Pakistani legal counsel before public launch.

### 4. Mobile policy center

- Added a customer/provider-aware Policy Center.
- Added current version and acceptance-required indicators.
- Added bilingual policy selection.
- Added offline list and document caching.
- Added safe fallback copies for Privacy Policy and Terms when the API cannot be reached on a first launch.
- Added loading, offline, empty, and unavailable states.
- Added accessible labels and hints to policy navigation.
- Added Policy Center access from Privacy & Security.

### 5. Accessibility and professional UX hardening

- Added an admin skip-to-content link.
- Added visible keyboard focus rings.
- Added reduced-motion behavior for users who request it.
- Added accessible expanded/collapsed state and relationships for sidebar groups.
- Added labelled mobile navigation controls and navigation landmarks.
- Added accessible switch semantics in settings.
- Added responsive admin page spacing and responsive lifecycle/settings grids.
- Confirmed the shared Expo splash configuration is used for both Android and iOS.
- Confirmed no hardcoded black customer/provider screen backgrounds were found in the audited app source.
- Confirmed the customer referral/invite card retains horizontal margins rather than rendering edge-to-edge.

## New migration

`deploy/migrations/20260716_workflow_inactivity_policy_governance.sql`

The migration name intentionally sorts after the previous Phase 7 migration so runtime migration health and deployment ordering remain correct.

## Validation completed

- Phase 8 targeted regression tests: **9/9 passed**.
- Complete API/source regression suite: **425/425 passed**.
- Changed TypeScript/TSX syntax validation: **31/31 passed**.
- Project JSON validation passed.
- Security scan passed.
- React Native style-key validation passed.
- Expo workspace validation passed.
- Mobile release validation passed.
- Release configuration check passed.

## Connected deployment and acceptance still required

The source package intentionally excludes dependencies and secrets. The following must be completed in the connected environment before production approval:

1. Back up Neon.
2. Run `pnpm db:migrate`, `pnpm db:status`, `pnpm db:verify`, and `pnpm db:integrity`.
3. Run dependency-aware workspace typecheck, tests, and builds.
4. Deploy the API to Render and admin panel to Vercel.
5. Confirm seeded policies appear in admin and mobile.
6. Confirm policy edit → draft → publish behavior.
7. Temporarily lower inactivity thresholds in staging and verify warning, provider pause, review queue, manual clear, and manual deactivation.
8. Confirm returning providers remain unavailable until they intentionally enable availability.
9. Verify admin keyboard-only navigation, focus visibility, screen-reader labels, reduced motion, and responsive layouts.
10. Run the complete Android/iPhone customer/provider/admin acceptance matrix.

## Production status

Source remediation for Phase 8 is complete. Production certification remains conditional on connected infrastructure, fresh native builds, legal review, and recorded real-device evidence.

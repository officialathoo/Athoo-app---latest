# Athoo Phase 2 — Provider Profile Correctness Completion

## Baseline

- Input baseline: `ATHOO_DEEP_AUDIT_PATCHED_PHASE1.zip`
- Output baseline: `ATHOO_PHASE2_PROVIDER_PROFILE_FIXED.zip`
- Scope: provider services, customer-facing provider profile accuracy, general hourly-rate approval visibility, negotiation service context, and post-approval refresh behavior.

## Problems confirmed

1. Provider services were stored as an array, but customer cards and actions repeatedly treated only the first service as the default.
2. Multiple selection remained available to providers while customers could not reliably choose which service they wanted.
3. Negotiation could silently use the first provider category when route context was incomplete.
4. Provider rate changes were approval requests, but the UI did not clearly separate the approved public rate from the pending requested rate.
5. Rate requests were attached to the first approved category even though the data model exposes one public `ratePerHour`.
6. Approved rate/service changes did not immediately refresh every customer discovery/profile surface.
7. Direct provider detail lookup did not enforce the same approved/active eligibility rules as provider discovery.

## Fixes completed

### Multiple-service customer experience

- All approved services are shown on provider cards and provider details.
- Long service lists use compact `+N more` display while retaining a complete accessibility label.
- Customers select the required service on the provider profile.
- Chat, negotiation, and booking carry the selected service context.
- Negotiation includes its own selector when opened without a complete service route, so it never guesses the first category.

### General hourly-rate workflow

- The active public rate is labelled as the provider's general hourly rate.
- The provider sees the approved public rate separately from a pending request.
- Pending, rejected, and approved review states are shown with review feedback.
- While one request is pending, the rate input is read-only and duplicate submission is prevented.
- New requests use `service: "general"`, removing the arbitrary first-category assumption.
- Admin review displays `General profile rate` for these requests.

### Approval propagation and eligibility

- Approved rate changes emit a realtime provider update to customer and provider roles.
- Approved service additions emit the full updated services array.
- Customer home, search, filtered provider lists, and provider detail respond to provider update events.
- Filtered service results refetch after service approval so newly eligible providers appear.
- Provider detail API now returns only approved, active, unblocked provider accounts.
- Admin approval actions invalidate provider/request/sidebar caches.

### Negotiation diagnostics

- The negotiation screen now converts safe API validation failures into actionable user messages instead of always showing one generic error.
- Existing-active-negotiation recovery remains supported.

## Files changed

- `athoo-app/components/ui/ProviderCard.tsx`
- `athoo-app/app/(customer)/provider-detail.tsx`
- `athoo-app/app/(customer)/service-providers.tsx`
- `athoo-app/app/(customer)/(tabs)/home.tsx`
- `athoo-app/app/(customer)/(tabs)/search.tsx`
- `athoo-app/app/(customer)/negotiate.tsx`
- `athoo-app/app/(provider)/edit-profile.tsx`
- `api-server/src/routes/providers.ts`
- `api-server/src/routes/rate-requests.ts`
- `api-server/src/routes/account.ts`
- `admin-panel/src/pages/RateRequestsPage.tsx`
- `admin-panel/src/pages/RequestsPage.tsx`
- Added `api-server/test/provider-profile-phase2-regression.test.ts`

## Validation completed

- TypeScript/TSX syntax parsing: **12/12 changed source files passed**.
- Targeted Node regression suite: **21/21 tests passed**.
- New Phase 2 regression tests: **5/5 passed**.
- Project JSON validation: **passed**.
- React Native style-key validation: **passed**.
- Repository security scan: **passed**.
- Customer code search found no remaining `services[0]`/`services?.[0]` first-category assumptions.

## Validation still required in connected environment

The clean baseline intentionally contains no `node_modules`. This environment could not install dependencies from the npm registry. Therefore these checks are not claimed as complete:

- Full workspace `pnpm typecheck`
- Full workspace automated test command
- API/admin/mobile production builds
- Neon migration and connected database checks
- Render/Vercel deployment validation
- Android and iPhone runtime verification

These must be completed before production certification.

## Next phase

Phase 3 addresses push registration health, background/terminated delivery, separate job/message/general/call sounds, Android notification-channel versioning, canonical notification destinations, and real-device verification.

# Athoo Phase 6 — Admin Operations Completion

## Canonical input
`ATHOO_PHASE5_VOICE_CALL_FIXED.zip`

## Phase objective
Complete the operational bridge between customer/provider actions and the admin panel so every important request, notification, evidence file, count, permission, and review workflow reaches the correct admin destination with enough context to act safely.

## Completed remediation

### 1. Centralized admin notification delivery
- Added one `createAdminNotification` service for persistence and realtime delivery.
- Removed direct notification-table insertion from route handlers.
- Supports global admin notifications and notifications targeted to a specific administrator.
- Normalizes stored links to internal `/admin/...` destinations only.
- Rejects external, protocol-relative, script/data, multiline, and oversized links.

### 2. Exact notification destination routing
Admin notification links now resolve to the real admin-panel routes and consume the referenced entity ID instead of opening a generic page.

Covered destinations:
- Premium/subscription request
- Commission payment
- Support ticket/complaint
- Service-add request
- Account-deletion request
- User profile
- Provider profile
- Lead
- Booking
- Negotiation
- Refund
- Withdrawal
- Provider verification
- Rate-change request
- Reported issue
- Broadcast, finance, invoice, and plan areas

Focused entities are automatically opened or highlighted. A `focusOpened` guard prevents a closed modal from reopening repeatedly.

### 3. Premium/subscription review completion
- Subscription list/detail API now includes user name, phone, email, role, plan name, and plan audience.
- Admin review screen shows the user and selected plan instead of only raw IDs.
- Reference numbers and payment screenshots are visible in the review workflow.
- Private evidence opens through authenticated storage access.
- Query and sidebar counts refresh after approval/rejection.
- Pending status and notification focus parameters are respected.

### 4. Support and complaint evidence integrity
- Added `support_tickets.media_urls` to the database schema and migration.
- Support creation validates subject, message, priority, booking ownership, upload ownership, and evidence count.
- Evidence paths are persisted rather than silently discarded.
- Support list supports search, status, priority, and exact focus filtering.
- Admin assignment validates that the selected administrator is active.
- Resolution requires a meaningful note; reopening clears stale resolution state.
- User receives notification after admin updates or replies.
- Private screenshots/documents open through authenticated storage.

### 5. Service and deletion request operations
- Requests page separates service additions and account deletion requests.
- Notifications open the exact requested item with the correct tab/status/focus.
- Provider documents use authenticated storage access.
- Account deletion notification now points to the exact deletion request, not merely the user profile.
- Bulk review and queue counts refresh correctly.

### 6. Correct operational sidebar counts
- Requests badge now counts pending service-add requests plus pending deletion requests.
- Complaints badge now counts open and in-progress support tickets.
- Premium review navigation opens the pending subscriptions queue.
- Counts are invalidated after operational mutations.

### 7. Permission vocabulary alignment
Canonicalized legacy aliases:
- `operations` → `bookings`
- `providers` → `verification`
- `support` → `complaints`
- `broadcast` → `broadcasts`

The API accepts existing stored permission aliases while enforcing canonical permissions. The admin role editor now presents organized professional permission groups and presets.

### 8. Safer admin evidence and operational UX
- Private payment screenshots, complaint evidence, and provider request documents are no longer opened as unauthenticated raw object links.
- Review mutations expose real failure messages and refresh related data.
- Focused rows use a visible professional highlight.
- Loading, empty, error, and action states remain available across the remediated queues.

## Database migration
Apply before deploying the updated API:

`deploy/migrations/20260716_support_premium_admin_integrity.sql`

It adds:
- `support_tickets.media_urls JSONB NOT NULL DEFAULT []`
- support status/priority/created index
- support assignment/status index
- subscription status/created index
- service-request status/created index
- deletion-request status/created index

## Validation evidence
- Phase 6 targeted regression tests: **11/11 passed**.
- Complete API/source regression suite: **406/406 passed**.
- Changed TypeScript/TSX syntax validation: **30 files passed**.
- Project JSON validation: passed.
- Security scan: passed.
- React Native style validation: passed.
- Mobile release validation: passed.
- Expo workspace validation: passed, with expected warning that `EAS_PROJECT_ID` is not set in this isolated environment.
- Release configuration check: passed.
- Only the centralized helper inserts into `admin_notifications`.

## Deployment order
1. Back up Neon.
2. Run `20260716_support_premium_admin_integrity.sql` through the normal migration command.
3. Run database status, verification, and integrity checks.
4. Deploy the API to Render.
5. Deploy the admin panel to Vercel.
6. Sign in as super admin and test each notification destination.
7. Submit a premium request with reference and screenshot.
8. Submit a support ticket with evidence and verify authenticated admin access.
9. Submit service-add and account-deletion requests and verify exact notification routing/counts.

## Remaining connected acceptance
This source environment intentionally has no installed dependencies and no access to the user’s Neon, Render, Vercel, R2, or browser session. Therefore the following remain required before production certification:
- dependency-aware `pnpm typecheck` and production builds
- connected Neon migration/verification/integrity execution
- deployed Render/Vercel smoke testing
- authenticated browser end-to-end admin testing
- R2 evidence upload/download lifecycle testing
- Android/iPhone workflow confirmation for actions that create admin notifications

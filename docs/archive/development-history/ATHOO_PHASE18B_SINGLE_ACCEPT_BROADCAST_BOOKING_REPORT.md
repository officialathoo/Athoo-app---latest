# ATHOO Phase 18B — Single-Accept Broadcast Booking Report

Date: 2026-08-01
Input baseline: `ATHOO_PHASE18A3_REFUND_REQUEST_RELIABILITY_FIXED.zip`
Output candidate: `ATHOO_PHASE18B_SINGLE_ACCEPT_BROADCAST_BOOKING_FIXED.zip`
Latest migration: `20260801_single_accept_broadcast_booking.sql`

## Outcome

The duplicate provider acceptance in the broadcast workflow is removed.

- If a provider accepts the customer's advertised hourly rate and travel charge, the API creates an `accepted` booking immediately in the same transaction.
- If a provider counters and the customer accepts, the same finalization path creates an `accepted` booking immediately.
- The provider is never asked to accept that converted booking again.
- If competing providers or duplicate devices act simultaneously, only the first valid transaction can win.
- Once filled, the broadcast is removed from all provider feeds through realtime invalidation with foreground polling as reconciliation.
- A customer can reject one provider's counter while keeping the broadcast open. That provider is notified and may submit a changed revision within the configured limit.

The separate direct-negotiation workflow was audited during this phase. It already converts an agreed offer into an accepted booking; the defective `pending` conversion was in the broadcast selection route.

## Corrected state rules

| Action | Authoritative server result | Next available action |
|---|---|---|
| Provider accepts exact customer offer | Broadcast accepted and booking created with status `accepted` atomically | Both parties open the booking |
| Provider sends different hourly/travel amount | One pending counter revision is stored | Customer accepts or rejects |
| Customer accepts counter | Broadcast accepted and booking created with status `accepted` atomically | Both parties open the booking |
| Customer rejects counter | Only that response becomes `rejected_by_customer`; broadcast remains open | Provider may revise with a changed amount, subject to the revision limit |
| Another provider wins | Remaining pending responses become `not_selected` | Filled job disappears from provider feeds |
| Duplicate retry by winner | Existing booking is returned | No duplicate response or booking |
| Competing late acceptance | Safe `BROADCAST_FILLED` / unavailable response | Refresh feed |

## Root causes closed

1. Customer broadcast selection created a booking with `status: "pending"`, which deliberately routed it back through the normal provider-accept action.
2. Provider exact-price acceptance only stored a response; it did not finalize the booking.
3. Broadcast selection read `open` state without a broadcast-scoped transaction lock, allowing simultaneous conversions to race.
4. The database did not enforce one response per request/provider or one broadcast per booking.
5. Provider travel counters were sent by mobile but were not persisted by the API.
6. Customer rejection/revision was not a first-class broadcast state, and losing providers did not have a complete realtime reconciliation contract.

## Backend and database changes

- One shared `finalizeAcceptedBroadcast` transaction now serves provider exact acceptance and customer counter acceptance.
- A per-broadcast PostgreSQL advisory lock serializes competing actions.
- Ordered customer/provider active-work locks prevent two broadcasts from being converted concurrently for the same party.
- Account, role, verification, availability, service-area, active booking, and active negotiation conditions are rechecked inside the winning transaction.
- The request closes through a conditional `status = 'open'` update; the response must still be `pending`.
- Booking idempotency uses `broadcast:<request-id>` and the existing customer/request unique constraint.
- New uniqueness rules enforce one response per request/provider, one provider/client request ID, and one broadcast per booking.
- New foreign keys protect accepted response and booking links.
- `provider_travelling_charge`, `response_type`, `client_request_id`, `revision`, and `rejected_at` make the response contract explicit.
- `broadcast_offer_events` records response submission, revision, rejection, withdrawal, broadcast cancellation, and winning booking creation.
- Database integrity checks now detect duplicate/orphan responses, duplicate booking links, open broadcasts with booking links, and inconsistent accepted broadcasts.

## Migration behavior

The migration is additive and idempotent where PostgreSQL permits repeat execution. Before enforcing constraints, it:

- normalizes legacy response type, travel charge, revision, and status values;
- keeps the accepted or newest useful response when duplicate provider responses exist;
- clears only duplicate client idempotency keys from a partially applied prior attempt;
- clears invalid accepted-response or booking links;
- deduplicates booking links before creating the unique index;
- backfills deterministic booking request IDs when there is no conflict; and
- promotes only legacy `pending` bookings already linked to an accepted broadcast to `accepted`.

The last operation removes the historical second-accept state without changing unrelated pending bookings.

## Mobile behavior

Provider:

- **Accept Offer** calls the exact-accept action and opens the confirmed booking returned by the API.
- **Counter** collects a clearly labelled hourly labor/service rate and a separate travel charge.
- A rejected response shows **Accept Original** and **Revise Counter** only while another revision is allowed.
- Pending counters show their revision, hourly amount, travel amount, and withdraw action.
- Filled broadcasts disappear on realtime invalidation and on the existing foreground/poll refresh fallback.

Customer:

- Provider counters expose explicit **Accept Counter** and **Reject** actions.
- Acceptance immediately navigates to the returned booking.
- Direct provider acceptance updates the broadcast status and exposes **View Booking**.
- Rejection explains whether the provider may revise or has reached the limit.

Customer and provider support guidance was updated to explain the one-accept behavior.

## Abuse and input controls

- Broadcast writes have a dedicated 15-minute rate limit keyed by a digest of authorization, device, and IP context; the global API limiter continues to provide the separate per-IP boundary.
- `BROADCAST_ACTION_RATE_LIMIT_MAX` defaults to 40 and is environment-validated within 1–500.
- Response action, whole-rupee hourly amount, whole-rupee travel amount, message type/length, and client request ID format are validated.
- Provider/customer identities and roles always come from the validated session, not request-supplied user IDs.
- Public provider invalidation contains only the opaque broadcast request ID; private booking data is sent only to the two parties.
- Errors use safe codes/messages; audit metadata does not copy provider message contents.

## Verification completed

- Phase 18B regression suite: **6/6 passed**.
- Focused broadcast/refund/release regression set: **24/24 passed**.
- Full repository test gate: **477/477 passed**.
- Shared libraries, API server, admin panel, mobile app, and scripts TypeScript checks: **passed**.
- Project, release, operations, blueprint, security, Expo workspace, React Native style, and Metro configuration checks: **passed**.
- API production bundle and admin production bundle: **built successfully**.
- Full command: `pnpm release:verify:code` — **passed**.

## Deployment sequence

1. Create and verify a Neon/PostgreSQL restore point.
2. Deploy the exact Phase 18B source and run `pnpm db:migrate` before starting the new API.
3. Confirm `pnpm db:status`, `pnpm db:verify`, and `pnpm db:integrity` report `20260801_single_accept_broadcast_booking.sql` as current with zero integrity failures.
4. Deploy the mobile build from the same source revision. Older mobile clients remain compatible through the server's deterministic legacy response idempotency fallback.
5. Run the owner acceptance checklist below with two providers and one customer.
6. Monitor broadcast conflict codes, 429s, booking creation, notification delivery, and integrity alerts during rollout.

## Rollback

Keep the prior API/mobile artifacts and the pre-migration restore point.

- If only notification/UI behavior fails and database integrity is healthy, redeploy the prior clients/API only after stopping new broadcast writes; the old API would otherwise recreate the duplicate `pending` state.
- If conversion or migration integrity fails, stop broadcast writes, capture sanitized diagnostics, restore the pre-migration database snapshot, and redeploy the Phase 18A3 artifact.
- A database restore is required to reverse the legacy booking-status promotion exactly. Do not attempt to guess which accepted bookings should be changed back to pending.

## Connected acceptance still required

Code verification cannot replace these production/service checks:

- Apply and rehearse the migration on a recent production-shaped database copy.
- On two provider devices, tap exact accept nearly simultaneously and confirm one booking only.
- Retry the winning action after a simulated dropped response and confirm the same booking is returned.
- Send a counter, reject it, revise one amount, then accept it and confirm there is no provider re-accept screen.
- Confirm losing providers receive feed removal live and after app background/foreground recovery.
- Confirm customer/provider push notifications and deep links open the same booking.
- Repeat on a small Android device and an iPhone with slow/lost network transitions.

These connected checks remain release gates; they were not claimed as completed locally.

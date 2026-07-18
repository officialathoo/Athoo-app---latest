# RC2 Phase 8B3A — Nested Components and Finance Accessibility

## Baseline

This phase was applied directly to `ATHOO_RC2_PHASE_8B2_MAIN_TABS_THEME_LOCALIZATION.zip`.

## Migrated components

- `components/ui/BookingCard.tsx`
- `components/ui/OtpModal.tsx`
- `components/ui/SuccessModal.tsx`
- `services/storage.ts` (`PrivateImage` accessibility metadata)

## Migrated finance routes

- Customer Billing & History
- Provider Wallet
- Provider Earnings

## Functional improvements

- Runtime light/dark theme colors now drive all migrated surfaces.
- Urdu RTL direction, localized dates, localized numbers and localized currency are used throughout the migrated routes.
- Booking status colors use semantic light/dark soft surfaces.
- Finance filters use stable internal values while displaying localized labels.
- Minimum interactive target sizes were raised to 44–48 px for primary controls.
- Cards, tabs, progress indicators, charts, modals and action buttons now expose accessibility roles, labels, state and values.
- OTP inputs support one-time-code autofill and multi-digit paste into the first field.
- OTP resend can invoke a real optional `onResend` callback and communicates disabled/busy state.
- Wallet loading failures now expose a professional retry state instead of silently hiding the failure.
- Negative remaining commission limits are clamped to zero.
- `PrivateImage` can now expose an accessibility label without changing existing call sites.

## Compatibility

- Existing booking routes and persisted booking statuses were not changed.
- Existing OTP verify behavior remains compatible; `onResend` is optional.
- Existing storage object paths and image loading behavior were not changed.
- No database migration is required.
- No API contract is changed.

## Remaining Phase 8B3 work

The transaction-entry and document-heavy finance screens still require the same migration treatment:

- Customer invoices
- Customer refund requests
- Customer subscription
- Provider invoices
- Provider pay commission
- Provider withdrawal requests
- Provider subscription

These remain assigned to Phase 8B3B rather than being falsely marked complete.

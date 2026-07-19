# Phase 24.3 — Mobile UX and biometric security polish

## Scope

This phase continues from the Phase 24.2 communication-reliability baseline and addresses the remaining confirmed mobile UX/security defects:

- Biometric login was not visible or configurable.
- Availability time selectors overlapped on narrow screens.
- Customer/provider bottom navigation did not reserve enough safe-area height.
- Provider availability changes had weak visual feedback.
- Customer invoices displayed an unnecessary zero-tax row.

## Implemented changes

- Added an authenticated biometric-preference API workflow with current-password confirmation for password-based accounts.
- Stored biometric metadata through the existing Keychain/Keystore-backed secure-storage adapter.
- Added a reusable customer/provider Security setting for Face ID, Touch ID, fingerprint, face unlock, or iris where supported.
- Kept normal password/OTP as fallback and invalidated biometric preference after password changes and logout.
- Replaced clipped inline availability dropdowns with responsive modal time selectors and end-after-start validation.
- Increased customer/provider tab-bar content height and bottom safe-area padding for gesture navigation and iPhone home indicators.
- Added optimistic provider availability feedback with animated status and rollback on API failure.
- Removed the zero-tax line from invoice UI, PDF output, and translations. No GST, VAT, or tax calculation was added.

## Verification completed in the packaging environment

- 22 focused regression tests passed across Phases 7, 24.1, 24.2, and 24.3.
- React Native style-key validation passed.
- Project JSON/configuration validation passed.
- Repository security scan passed.
- TypeScript syntax parsing passed for all changed TypeScript/TSX files.

`pnpm run release:verify:code` could not be executed in the packaging environment because the pinned pnpm package and project dependencies were not locally installed and external registry access was unavailable. It remains mandatory on a dependency-complete workstation before deployment. Connected service verification and real-device biometric/layout testing remain separate deployment checks.

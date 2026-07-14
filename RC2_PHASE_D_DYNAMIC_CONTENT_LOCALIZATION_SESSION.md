# RC2 Phase D — Dynamic Content, Localization and Session Stability

## Baseline
ATHOO_RC2_RUNTIME_PHASE_B_03(1).zip

## Changes
- Removed built-in promotional banner and emergency-contact display records from Customer Home.
- Home now restores the last successful admin-managed configuration, banners, providers, statistics and emergency contacts from local cache while refreshing from the API.
- Category discovery now starts from cached/API admin data instead of displaying the static service catalog as live content.
- Static category metadata remains only as icon/color/Urdu fallback for legacy database rows.
- Customer and provider FAQ screens now use cached admin-managed API content and no longer restore embedded FAQ lists.
- Customer and provider Profile menus now use runtime English/Urdu translations for primary sections and actions.
- Logout now clears local UI/session state and navigates immediately, while server token revocation and push-token cleanup run as a bounded background best-effort task.
- Removed the remaining Replit handoff document from the portable package.

## Verification
- Project validation passed.
- Focused regression tests: 3 passed, 0 failed.

## Remaining scope
- Full-app localization still requires converting remaining legacy screens that contain direct English strings.
- About/legal/chatbot narrative content remains product copy rather than admin-managed home configuration.
- Real-device validation is required for slow-network logout and offline cached content behavior.

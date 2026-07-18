# Athoo Phase 4 — Chat & Negotiation Reliability

## Baseline
ATHOO_PHASE3_NOTIFICATIONS_BROADCAST_FIXED.zip

## Completed
- Fixed negotiation submission failure caused by missing latitude/longitude.
- Current-location selection now stores coordinates, not only the display address.
- Typed addresses are resolved through the configured backend geocoding abstraction before submission.
- Added clear validation when an address cannot be resolved.
- Added client request IDs for negotiation creation.
- Added safe mobile retry using the same request ID after network/timeout failures.
- Added server-side duplicate recovery for negotiation submissions.
- Added database uniqueness for customer negotiation request IDs.
- Added unread-message query support index.
- Added live message delivery acknowledgement (`chat:delivered`).
- Sender message state now advances from sent to delivered when the recipient has a live connection.
- Incoming messages in the currently open conversation are immediately marked read on the API.
- Fixed stale realtime listener closure by binding activeChatId to the listener lifecycle.
- Existing polling and app-resume recovery remain as fallback paths.

## Migration
`deploy/migrations/20260716_chat_negotiation_reliability.sql`

## Validation
- Full API/source suite: 391/391 passed.
- Project JSON validation passed.
- Security scan passed.
- React Native style validation passed.
- Mobile release validation passed.
- Expo workspace validation passed.
- Release check passed.

## Connected validation still required
- Run the new migration on Neon.
- Redeploy API.
- Build/install new mobile binaries if testing together with Phase 3 native sound changes.
- Test message sent/delivered/read transitions on Android and iPhone.
- Test chat while recipient is foreground, background, terminated and temporarily offline.
- Test negotiation using current location and typed addresses.
- Simulate a lost response/retry and confirm only one negotiation row exists.

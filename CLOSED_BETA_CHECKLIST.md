# ATHOO Closed Beta Checklist

## Release identity
- Record Git commit, ZIP SHA-256, database migration count, API version, admin build, Android build, and iOS build.
- Confirm staging and production credentials are separate.

## Critical user journeys
- Customer registration/login/logout/password reset/session refresh.
- Provider registration, verification, availability, job response, start PIN, completion PIN.
- Customer booking, negotiation, cancellation, chat, call, completion, rating, invoice, manual refund request.
- Provider earnings, commission proof, withdrawal request and status tracking.
- Admin verification, booking management, manual finance review, refund/withdrawal decisions, support and audit review.

## Reliability and security
- Revoked devices lose API, WebSocket, and private-file access.
- Two providers cannot accept one booking; duplicate PIN/payment/refund/withdrawal actions are rejected.
- Push notification tap works from foreground, background, and terminated state.
- Private identity/payment files are inaccessible to unrelated accounts.
- Database backup is created and restored into an isolated database.
- Graceful deployment does not lose durable jobs.

## Beta exit
- No unresolved critical/high-severity defect.
- Crash-free sessions and API error rates meet the agreed target.
- Support, incident, rollback, backup, and on-call ownership are assigned.

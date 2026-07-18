# RC2 Phase 5 — Mobile Runtime Stabilization

This phase is cumulative on Phase 4 and focuses on app lifecycle, network efficiency, professional errors, and theme safety.

## Changes

- Incoming calls now use the authenticated realtime event channel as the primary delivery mechanism.
- The previous two-second `/api/calls/incoming` loop was replaced with an immediate foreground check and a 30-second recovery poll.
- Chat list/message polling pauses while the app is backgrounded and prevents overlapping requests.
- Chat state remains visible during transient network failures and refreshes on foreground resume.
- TanStack Query uses offline-first reads with bounded mutation behavior.
- Authentication failures are converted to user-safe messages rather than returning raw API diagnostics.
- Semantic white remains true white in dark mode so brand gradients, icons, and button text remain visible.

## Certification boundary

Source-level checks and focused regression tests are included. Full device certification still requires Android hardware/emulator testing for calls, background/foreground transitions, offline recovery, theme rendering, and push notifications.

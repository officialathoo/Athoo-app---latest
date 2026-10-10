# Athoo Phase 30 — Previous Backlog Recovery Audit

## Certified starting point

- Branch: `phase30-backlog-recovery`
- Baseline commit: `a5d60bc566f3870dada8b9d4c7e6fe440d9835f9`
- App and native runtime: `1.1.0`
- Legacy installed APK runtime: `1.0.0`
- Development mode: local-first
- Payment policy: manual only

## Purpose

Phase 30 recovers all incomplete work carried from previous Athoo phases and
turns it into one controlled execution backlog.

Automated source verification is not treated as physical-device, connected
production or product-design certification.

## Source work already present

The current source includes:

- single-device session protection;
- customer and provider booking workflows;
- chat delivery, read state and live participant identity hydration;
- notification routing and Android channel support;
- Cloudflare TURN and portable call configuration;
- manual premium, commission, refund and withdrawal workflows;
- private evidence and configurable storage;
- admin operational queues and permissions;
- policy, localization and accessibility foundations;
- nationwide location, routing and native MapLibre integration;
- runtime isolation between native runtime 1.1.0 and legacy runtime 1.0.0.

These implementations remain subject to connected and physical-device
verification.

## Remaining product work

### Performance and interaction feedback

- audit slow screen rendering and repeated API requests;
- remove unnecessary blocking and duplicated fetching;
- add consistent skeleton, loading, retry and progress feedback;
- verify pagination and bounded lists;
- verify weak-network and offline behavior.

### Shared professional design

- standardize typography, spacing, cards, buttons, inputs and dialogs;
- finish light and dark themes;
- verify English LTR and Urdu RTL layouts;
- verify keyboard, safe-area and accessibility behavior;
- keep customer and provider presentation consistent.

### Customer and provider applications

Every screen must be audited for design, loading, navigation, empty states,
error handling, backend wiring and responsive behavior.

### Communication

Chat, push notifications, notification sounds, exact deep links, background
delivery, killed-state delivery and two-way calls require connected cross-device
evidence.

### Uploads and storage

Camera, gallery, video, documents, premium evidence, refund evidence, support
evidence and administrator review require R2-connected and physical-device
verification.

### Finance

Manual premium, commission, withdrawals, refunds, invoices, reconciliation,
duplicate protection and audit trails require complete cross-role verification.

No live payment gateway is approved in this phase.

### Admin and CMS

All dashboards, queues, counters, filters, bulk actions, permissions, policies,
FAQ, banners, categories, cities, areas and payment configuration require a
page-by-page operational audit.

### Release and infrastructure

Render, Vercel, Neon, R2, Cloudflare TURN, push receipts, queues, maps, email,
OTP, Android and iPhone evidence remain release gates.

## Execution order

1. Performance, loading feedback and shared design foundation
2. Customer application completion
3. Provider application completion
4. Communication and notifications
5. Uploads, storage and finance
6. Admin panel
7. CMS, localization and configuration
8. Full local and connected regression
9. Android/iPhone builds and physical certification

## Current decision

`NO-GO-PENDING-PRODUCT-CONNECTED-AND-DEVICE-CERTIFICATION`

No EAS build, OTA update, deployment or production infrastructure mutation is
part of this audit phase.
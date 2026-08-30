# Athoo App V2 Source Completion

## Baseline

Athoo App V2 is built only from `ATHOO_PHASE25_UNIFIED_SECURITY_FLOW_DEVICE_READY.zip`. No older branch replaces Phase 25 behavior.

## Completed V2 source work

1. Added one canonical location snapshot across direct bookings, broadcasts, negotiations and saved addresses.
2. Required city, area, ISO country code, coordinates, source, accuracy and recent user confirmation.
3. Added configurable country boundaries and active service-area authorization.
4. Added nationwide Pakistan province/territory seed coverage with runtime admin control and common province aliases.
5. Persisted canonical location metadata into bookings, negotiations, broadcasts, saved addresses and invoice summaries.
6. Added stable booking cursor pagination, bounded delta refresh, load-more UI and sanitized stale-while-revalidate cache hydration.
7. Preserved Phase 25 upload quarantine, malware-scanner contract, account step-up, persistent sessions, single acceptance, scheduling, geofence, refunds, maps, calls, notifications and signed invoice verification.
8. Updated V2 release identity, migration order, deployment runbooks, evidence templates and physical-device acceptance cases.

## Latest migration

`20260802_athoo_v2_location_pagination_integrity.sql`

The migration is additive and retry-safe. Legacy location records remain readable; all newly created V2 work requires verified canonical location metadata.

## Certification boundary

The source plan is complete. Production certification still requires external evidence from dependency-backed builds, Neon, object storage, the independent malware scanner, Android, iPhone, load testing, recovery testing and deployment provenance.

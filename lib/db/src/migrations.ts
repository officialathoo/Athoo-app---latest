/**
 * Authoritative latest database migration identifier.
 *
 * Keep this value in the shared database package so the API startup guard and
 * operational integrity tooling cannot drift independently.
 * Previous release: 20260802_phase19_security_flow_performance.sql
 */
export const LATEST_DATABASE_MIGRATION =
  "20260805_refund_booking_public_id_contract.sql" as const;

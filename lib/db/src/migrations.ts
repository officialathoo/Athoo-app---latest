/**
 * Authoritative latest database migration identifier.
 *
 * Keep this value in the shared database package so the API startup guard and
 * operational integrity tooling cannot drift independently.
 * Previous release: 20260802_athoo_v2_location_pagination_integrity.sql
 */
export const LATEST_DATABASE_MIGRATION =
  "20260802_phase19_security_flow_performance.sql" as const;

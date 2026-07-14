/**
 * Authoritative latest database migration identifier.
 *
 * Keep this value in the shared database package so the API startup guard and
 * operational integrity tooling cannot drift independently.
 */
export const LATEST_DATABASE_MIGRATION =
  "20260714_service_areas_pakistan_location_system.sql" as const;

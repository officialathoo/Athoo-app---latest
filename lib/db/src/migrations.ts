/**
 * Authoritative latest database migration identifier.
 *
 * Keep this value in the shared database package so the API startup guard and
 * operational integrity tooling cannot drift independently.
 */
export const LATEST_DATABASE_MIGRATION =
  "20260720_release_phase28_professional_workflow_integrity.sql" as const;

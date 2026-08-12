/**
 * Authoritative latest database migration identifier.
 *
 * Keep this value in the shared database package so the API startup guard and
 * operational integrity tooling cannot drift independently.
 * Previous release: 20260805_refund_booking_public_id_contract.sql
 */
export const LATEST_DATABASE_MIGRATION =
  "20260812_booking_bound_promotions.sql" as const;

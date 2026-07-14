-- Adds broadcast_requests.travelling_charge, which is declared in the
-- Drizzle schema and written/read by POST /api/broadcast and the active
-- work-block lookup (getCustomerActiveWorkBlock), but was never migrated
-- into the database. Its absence caused every full-column SELECT against
-- broadcast_requests (including the pre-create active-block check) to fail
-- with Postgres 42703 (undefined column), turning broadcast creation into
-- an HTTP 500 for every customer.
ALTER TABLE broadcast_requests
  ADD COLUMN IF NOT EXISTS travelling_charge INTEGER DEFAULT 0;

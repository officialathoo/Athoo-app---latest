-- bookings.rate_per_hour is defined on the Drizzle schema but was never
-- added by a migration, causing bookingSweeper's `select()` queries to fail
-- with Postgres 42703 (undefined column).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS rate_per_hour INTEGER;

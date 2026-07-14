-- Adds columns present in the Drizzle schema (and actively read/written by
-- api-server routes) that were missing from the migrated database, causing
-- bookingSweeper to fail with Postgres 42703 (undefined column) on every run.
--
-- bookings.video_url: written by POST /bookings and /broadcast (video
--   attachment on a request); never had a corresponding migration.
-- negotiations.client_request_id / address / latitude / longitude /
--   scheduled_date / scheduled_time: written by POST /negotiations when a
--   customer submits an offer; never had a corresponding migration.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE negotiations
  ADD COLUMN IF NOT EXISTS client_request_id TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS latitude REAL,
  ADD COLUMN IF NOT EXISTS longitude REAL,
  ADD COLUMN IF NOT EXISTS scheduled_date TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_time TEXT;

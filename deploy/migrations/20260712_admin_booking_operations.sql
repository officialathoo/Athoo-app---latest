CREATE TABLE IF NOT EXISTS booking_operations (
  id text PRIMARY KEY,
  booking_id text NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  admin_id text NOT NULL REFERENCES users(id),
  admin_name text NOT NULL,
  action text NOT NULL,
  reason text NOT NULL,
  from_provider_id text REFERENCES users(id),
  to_provider_id text REFERENCES users(id),
  previous_status text,
  next_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now()
);

ALTER TABLE booking_operations DROP CONSTRAINT IF EXISTS booking_operations_action_check;
ALTER TABLE booking_operations ADD CONSTRAINT booking_operations_action_check CHECK (action IN ('cancelled', 'reassigned'));
CREATE INDEX IF NOT EXISTS booking_operations_booking_created_idx ON booking_operations (booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_operations_admin_created_idx ON booking_operations (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_admin_schedule_status_idx ON bookings (scheduled_date DESC, status, created_at DESC);

-- Provider dashboard aggregation and operational availability indexes.
CREATE INDEX IF NOT EXISTS bookings_provider_status_updated_idx
  ON bookings (provider_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS bookings_provider_completed_at_idx
  ON bookings (provider_id, job_completed_at DESC)
  WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS negotiations_provider_status_updated_idx
  ON negotiations (provider_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_created_idx
  ON notifications (user_id, created_at DESC)
  WHERE is_read = false;

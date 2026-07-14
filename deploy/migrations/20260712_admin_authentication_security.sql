ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_failed_login_count integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_locked_until timestamptz;
CREATE INDEX IF NOT EXISTS users_admin_lock_idx ON users (admin_locked_until) WHERE role = 'admin' AND admin_locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS login_history_admin_security_idx ON login_history (user_id, created_at DESC) WHERE role = 'admin';

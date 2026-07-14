-- Premium Subscription Lifecycle fixes:
-- 1) Cancellation must not immediately strip already-paid Premium. Add a
--    'cancellation_scheduled' status so /subscriptions/cancel can schedule
--    deactivation at the existing expiry date instead of revoking it now.
-- 2) Add a dedupe timestamp so the expiry-reminder sweep (runs every ~60s)
--    sends the "Premium expiring soon" notification at most once per cycle
--    instead of once per sweep tick for up to 3 days.
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;
ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IN ('pending','active','expired','cancelled','rejected','cancellation_scheduled'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_reminder_sent_at TIMESTAMPTZ;

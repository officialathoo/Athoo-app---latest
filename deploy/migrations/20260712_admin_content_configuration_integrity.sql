-- Stage 3 Admin Content & Configuration integrity controls.

-- Service areas: retain historical rows, deactivate case-insensitive duplicates.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY lower(trim(name)), lower(trim(coalesce(province, '')))
    ORDER BY is_active DESC, created_at ASC, id ASC
  ) AS rn
  FROM service_areas
)
UPDATE service_areas s SET is_active = false, updated_at = now()
FROM ranked r WHERE s.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS service_areas_name_province_ci_uidx
  ON service_areas (lower(trim(name)), lower(trim(coalesce(province, ''))));
CREATE INDEX IF NOT EXISTS service_areas_active_sort_idx
  ON service_areas (is_active, sort_order, name);
ALTER TABLE service_areas DROP CONSTRAINT IF EXISTS service_areas_name_length_check;
ALTER TABLE service_areas ADD CONSTRAINT service_areas_name_length_check CHECK (char_length(trim(name)) BETWEEN 2 AND 80);
ALTER TABLE service_areas DROP CONSTRAINT IF EXISTS service_areas_sort_order_check;
ALTER TABLE service_areas ADD CONSTRAINT service_areas_sort_order_check CHECK (sort_order BETWEEN -10000 AND 10000);

-- Category pricing and presentation bounds.
ALTER TABLE service_categories DROP CONSTRAINT IF EXISTS service_categories_visit_charge_check;
ALTER TABLE service_categories ADD CONSTRAINT service_categories_visit_charge_check CHECK (visit_charge BETWEEN 0 AND 100000);
ALTER TABLE service_categories DROP CONSTRAINT IF EXISTS service_categories_rate_range_check;
ALTER TABLE service_categories ADD CONSTRAINT service_categories_rate_range_check CHECK (
  (min_hourly_rate IS NULL OR min_hourly_rate BETWEEN 0 AND 1000000)
  AND (max_hourly_rate IS NULL OR max_hourly_rate BETWEEN 0 AND 1000000)
  AND (min_hourly_rate IS NULL OR max_hourly_rate IS NULL OR max_hourly_rate >= min_hourly_rate)
);
ALTER TABLE service_categories DROP CONSTRAINT IF EXISTS service_categories_color_check;
ALTER TABLE service_categories ADD CONSTRAINT service_categories_color_check CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

-- Marketing content validation.
ALTER TABLE marketing_banners DROP CONSTRAINT IF EXISTS marketing_banners_audience_check;
ALTER TABLE marketing_banners ADD CONSTRAINT marketing_banners_audience_check CHECK (target_audience IN ('all','customer','provider'));
ALTER TABLE marketing_banners DROP CONSTRAINT IF EXISTS marketing_banners_link_type_check;
ALTER TABLE marketing_banners ADD CONSTRAINT marketing_banners_link_type_check CHECK (link_type IN ('none','category','url','booking'));
ALTER TABLE app_announcements DROP CONSTRAINT IF EXISTS app_announcements_audience_check;
ALTER TABLE app_announcements ADD CONSTRAINT app_announcements_audience_check CHECK (target_audience IN ('all','customer','provider'));
ALTER TABLE faqs DROP CONSTRAINT IF EXISTS faqs_audience_check;
ALTER TABLE faqs ADD CONSTRAINT faqs_audience_check CHECK (target_audience IN ('all','customer','provider'));

-- Notification templates remain historical through deactivation.
ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_channel_check;
ALTER TABLE notification_templates ADD CONSTRAINT notification_templates_channel_check CHECK (channel IN ('push','sms','email'));
ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_audience_check;
ALTER TABLE notification_templates ADD CONSTRAINT notification_templates_audience_check CHECK (target_audience IN ('all','customer','provider'));
ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_body_length_check;
ALTER TABLE notification_templates ADD CONSTRAINT notification_templates_body_length_check CHECK (char_length(trim(body)) BETWEEN 1 AND 2000);

-- Subscription plan and payment-review integrity.
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS client_request_id text;
WITH duplicate_pending AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
  FROM user_subscriptions WHERE status = 'pending'
)
UPDATE user_subscriptions u SET status = 'cancelled', rejection_note = 'Closed during integrity migration: duplicate pending request', updated_at = now()
FROM duplicate_pending d WHERE u.id = d.id AND d.rn > 1;
CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_user_request_uidx
  ON user_subscriptions (user_id, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_one_pending_uidx
  ON user_subscriptions (user_id) WHERE status = 'pending';
WITH duplicate_active AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY coalesce(started_at, created_at) DESC, id DESC) AS rn
  FROM user_subscriptions WHERE status = 'active'
)
UPDATE user_subscriptions u SET status = 'expired', updated_at = now()
FROM duplicate_active d WHERE u.id = d.id AND d.rn > 1;
CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_one_active_uidx
  ON user_subscriptions (user_id) WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_name_ci_uidx
  ON subscription_plans (lower(trim(name)));
ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_audience_check;
ALTER TABLE subscription_plans ADD CONSTRAINT subscription_plans_audience_check CHECK (audience IN ('provider','customer','both'));
ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_price_check;
ALTER TABLE subscription_plans ADD CONSTRAINT subscription_plans_price_check CHECK (
  price_monthly BETWEEN 0 AND 10000000 AND price_yearly BETWEEN 0 AND 100000000
  AND (price_yearly = 0 OR price_monthly = 0 OR price_yearly >= price_monthly)
);
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;
ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_status_check CHECK (status IN ('pending','active','expired','cancelled','rejected'));
CREATE INDEX IF NOT EXISTS user_subscriptions_review_queue_idx
  ON user_subscriptions (status, created_at DESC);

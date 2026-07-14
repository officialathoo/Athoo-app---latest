-- ============================================================
-- ATHOO PRODUCTION SQL PATCH — Safe Schema Upgrade
-- Version: 1.0.0  |  Generated: 2026
-- ============================================================
-- Run this on an existing Neon/PostgreSQL database to safely
-- add any columns or indexes that may be missing.
-- All statements use IF NOT EXISTS / DO NOTHING to be idempotent.
-- ============================================================

-- ─── USERS — ensure all new columns exist ────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS father_name            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cnic_number            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cnic_expiry            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dob                    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count         INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_travel_distance_km INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS language               TEXT DEFAULT 'en';
ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_enabled      BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified         BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude               TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude              TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_at  TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_commission_payment_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS no_show_count          INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cooldown_until         TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role             TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_permissions      JSONB DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium             BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_plan_id        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at     TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_limit       INTEGER DEFAULT 5000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_commission       INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status         TEXT DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_note      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deactivated         BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_color          TEXT DEFAULT '#1A6EE0';

-- ─── USERS — ensure indexes ───────────────────────────────────
CREATE INDEX IF NOT EXISTS users_role_idx                ON users(role);
CREATE INDEX IF NOT EXISTS users_phone_idx               ON users(phone);
CREATE INDEX IF NOT EXISTS users_email_idx               ON users(email);
CREATE INDEX IF NOT EXISTS users_verification_status_idx ON users(verification_status);
CREATE INDEX IF NOT EXISTS users_is_available_idx        ON users(is_available);
CREATE INDEX IF NOT EXISTS users_is_blocked_idx          ON users(is_blocked);
CREATE INDEX IF NOT EXISTS users_account_status_idx      ON users(account_status);
CREATE INDEX IF NOT EXISTS users_referral_code_idx       ON users(referral_code);

-- ─── BOOKINGS — ensure all new columns exist ─────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS public_id               TEXT UNIQUE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS commission_amount       INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_amount         INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS commission_rate         INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS visit_charge            INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS category_slug           TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status          TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at                 TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS received_at             TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rating_reminder_sent_at TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pre_job_reminder_sent_at TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS job_started_at          TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS picked_lat              REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS picked_lng              REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_lat            REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_lng            REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_lat            REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_lng            REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_accuracy       REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_updated_at     TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_arrived_at     TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_pin               TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_pin_expires_at    TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS complete_pin            TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS complete_pin_expires_at TIMESTAMP;

-- ─── BOOKINGS — ensure indexes ────────────────────────────────
CREATE INDEX IF NOT EXISTS bookings_customer_id_idx ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS bookings_provider_id_idx ON bookings(provider_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx      ON bookings(status);
CREATE INDEX IF NOT EXISTS bookings_created_at_idx  ON bookings(created_at);

-- ─── SERVICE_CATEGORIES — ensure all columns ─────────────────
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS name_ur               TEXT;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS commission_pct        REAL DEFAULT 10;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS platform_fee_pct      REAL DEFAULT 5;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS min_hourly_rate       INTEGER;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS max_hourly_rate       INTEGER;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS estimated_duration_hrs REAL;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS sort_order            INTEGER DEFAULT 0;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS created_by            TEXT;
CREATE INDEX IF NOT EXISTS service_categories_is_active_idx ON service_categories(is_active);

-- ─── COMMISSION PAYMENTS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_payments (
  id              TEXT PRIMARY KEY,
  provider_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL,
  account_id      TEXT,
  reference       TEXT,
  screenshot_url  TEXT,
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMP,
  rejection_note  TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS commission_payments_provider_id_idx ON commission_payments(provider_id);
CREATE INDEX IF NOT EXISTS commission_payments_status_idx      ON commission_payments(status);

-- ─── PAYMENT ACCOUNTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_accounts (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  bank_name       TEXT,
  account_title   TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  iban            TEXT,
  instructions    TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─── SUBSCRIPTION PLANS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  audience        TEXT NOT NULL DEFAULT 'provider',
  price_monthly   INTEGER DEFAULT 0,
  price_yearly    INTEGER DEFAULT 0,
  features        JSONB DEFAULT '[]',
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─── USER SUBSCRIPTIONS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id           TEXT NOT NULL,
  billing_period    TEXT NOT NULL DEFAULT 'monthly',
  status            TEXT NOT NULL DEFAULT 'pending',
  amount            INTEGER NOT NULL,
  payment_reference TEXT,
  screenshot_url    TEXT,
  started_at        TIMESTAMP,
  expires_at        TIMESTAMP,
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMP,
  rejection_note    TEXT,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_subscriptions_user_id_idx ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS user_subscriptions_status_idx  ON user_subscriptions(status);

-- ─── ADMIN NOTIFICATIONS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_notifications (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  message           TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'info',
  link              TEXT,
  target_admin_id   TEXT,
  read_by_admin_ids JSONB DEFAULT '[]',
  created_at        TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx ON admin_notifications(created_at);

-- ─── AUDIT LOG ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL,
  admin_name  TEXT NOT NULL,
  admin_role  TEXT,
  action      TEXT NOT NULL,
  target      TEXT,
  target_id   TEXT,
  details     JSONB,
  ip          TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_log_admin_id_idx   ON audit_log(admin_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at);

-- ─── PROVIDER DOCUMENTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_documents (
  id              TEXT PRIMARY KEY,
  provider_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  label           TEXT,
  url             TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  rejection_note  TEXT,
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS provider_documents_provider_id_idx ON provider_documents(provider_id);

-- ─── NOTIFICATIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'info',
  link        TEXT,
  data        JSONB,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications(is_read);

-- ─── BROADCAST TABLES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_requests (
  id                   TEXT PRIMARY KEY,
  customer_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_name        TEXT NOT NULL,
  service              TEXT NOT NULL,
  service_label        TEXT NOT NULL,
  service_icon         TEXT DEFAULT 'tool',
  description          TEXT,
  video_url            TEXT,
  address              TEXT NOT NULL,
  latitude             REAL,
  longitude            REAL,
  scheduled_date       TEXT NOT NULL,
  scheduled_time       TEXT NOT NULL,
  customer_offer       INTEGER,
  status               TEXT NOT NULL DEFAULT 'open',
  accepted_response_id TEXT,
  booking_id           TEXT,
  expires_at           TIMESTAMP NOT NULL,
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS broadcast_requests_status_idx      ON broadcast_requests(status);
CREATE INDEX IF NOT EXISTS broadcast_requests_customer_id_idx ON broadcast_requests(customer_id);
CREATE INDEX IF NOT EXISTS broadcast_requests_expires_at_idx  ON broadcast_requests(expires_at);

CREATE TABLE IF NOT EXISTS broadcast_responses (
  id             TEXT PRIMARY KEY,
  request_id     TEXT NOT NULL REFERENCES broadcast_requests(id) ON DELETE CASCADE,
  provider_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name  TEXT NOT NULL,
  provider_offer INTEGER,
  message        TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- ─── SUPPORT TABLES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  user_name        TEXT NOT NULL,
  user_phone       TEXT NOT NULL,
  user_role        TEXT NOT NULL,
  subject          TEXT NOT NULL,
  message          TEXT NOT NULL,
  booking_id       TEXT,
  status           TEXT NOT NULL DEFAULT 'open',
  priority         TEXT NOT NULL DEFAULT 'normal',
  admin_notes      TEXT,
  resolution_note  TEXT,
  assigned_to      TEXT,
  resolved_by      TEXT,
  resolved_at      TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx  ON support_tickets(status);

CREATE TABLE IF NOT EXISTS ticket_notes (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES support_tickets(id),
  admin_id    TEXT NOT NULL,
  admin_name  TEXT NOT NULL,
  note        TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── MARKETING / CONTENT TABLES ───────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_banners (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  subtitle         TEXT,
  image_url        TEXT,
  bg_color_from    TEXT DEFAULT '#1A6EE0',
  bg_color_to      TEXT DEFAULT '#0D4BA0',
  icon_name        TEXT DEFAULT 'star',
  link_type        TEXT DEFAULT 'none',
  link_target      TEXT,
  target_audience  TEXT DEFAULT 'all',
  is_active        BOOLEAN DEFAULT TRUE,
  sort_order       INTEGER DEFAULT 0,
  expires_at       TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_announcements (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  message          TEXT NOT NULL,
  button_text      TEXT DEFAULT 'Got it',
  button_link      TEXT,
  image_url        TEXT,
  target_audience  TEXT DEFAULT 'all',
  is_active        BOOLEAN DEFAULT TRUE,
  show_once        BOOLEAN DEFAULT TRUE,
  priority         INTEGER DEFAULT 0,
  expires_at       TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faqs (
  id               TEXT PRIMARY KEY,
  question         TEXT NOT NULL,
  answer           TEXT NOT NULL,
  category         TEXT DEFAULT 'general',
  target_audience  TEXT DEFAULT 'all',
  sort_order       INTEGER DEFAULT 0,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

-- ─── REMAINING TABLES (idempotent) ────────────────────────────
CREATE TABLE IF NOT EXISTS service_areas (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  province    TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  number      TEXT NOT NULL,
  description TEXT,
  icon        TEXT DEFAULT 'phone-call',
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_blacklist (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  value       TEXT NOT NULL,
  reason      TEXT,
  added_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_blacklist_type_value_idx
  ON admin_blacklist(type, value) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS notification_templates (
  id               TEXT PRIMARY KEY,
  key              TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  channel          TEXT NOT NULL,
  target_audience  TEXT DEFAULT 'all',
  subject          TEXT,
  body             TEXT NOT NULL,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS login_history (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  phone       TEXT,
  email       TEXT,
  role        TEXT,
  method      TEXT NOT NULL,
  success     BOOLEAN NOT NULL,
  fail_reason TEXT,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS login_history_user_id_idx    ON login_history(user_id);
CREATE INDEX IF NOT EXISTS login_history_created_at_idx ON login_history(created_at);

CREATE TABLE IF NOT EXISTS promotions (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  description       TEXT,
  discount_type     TEXT NOT NULL DEFAULT 'percentage',
  discount_value    INTEGER NOT NULL,
  max_uses          INTEGER,
  used_count        INTEGER DEFAULT 0,
  min_booking_value INTEGER,
  valid_from        TIMESTAMP,
  valid_until       TIMESTAMP,
  is_active         BOOLEAN DEFAULT TRUE,
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_providers (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS saved_providers_unique_idx
  ON saved_providers(user_id, provider_id);

CREATE TABLE IF NOT EXISTS reviews (
  id                   TEXT PRIMARY KEY,
  booking_id           TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reviewer_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_name        TEXT NOT NULL,
  reviewed_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_name        TEXT NOT NULL,
  rating               INTEGER NOT NULL,
  review               TEXT,
  is_disputed          BOOLEAN DEFAULT FALSE,
  dispute_note         TEXT,
  dispute_resolved_at  TIMESTAMP,
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reviews_reviewed_id_idx ON reviews(reviewed_id);

CREATE TABLE IF NOT EXISTS refund_requests (
  id               TEXT PRIMARY KEY,
  booking_id       TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason           TEXT NOT NULL,
  amount_requested INTEGER NOT NULL,
  evidence_url     TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  resolution_note  TEXT,
  resolved_by      TEXT,
  resolved_at      TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id                TEXT PRIMARY KEY,
  provider_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount            INTEGER NOT NULL,
  bank_name         TEXT,
  account_title     TEXT NOT NULL,
  account_number    TEXT NOT NULL,
  iban              TEXT,
  note              TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMP,
  rejection_note    TEXT,
  paid_at           TIMESTAMP,
  payment_reference TEXT,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS withdrawal_requests_provider_id_idx ON withdrawal_requests(provider_id);

CREATE TABLE IF NOT EXISTS report_issues (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  reporter_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reporter_name TEXT NOT NULL,
  reporter_role TEXT NOT NULL,
  reported_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  reported_name TEXT,
  category      TEXT NOT NULL,
  description   TEXT NOT NULL,
  status        TEXT DEFAULT 'open',
  admin_note    TEXT,
  resolved_by   TEXT,
  resolved_at   TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hourly_rate_requests (
  id              TEXT PRIMARY KEY,
  provider_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name   TEXT NOT NULL,
  service         TEXT NOT NULL,
  current_rate    INTEGER,
  requested_rate  INTEGER NOT NULL,
  reason          TEXT,
  status          TEXT DEFAULT 'pending',
  reviewed_by     TEXT,
  review_note     TEXT,
  reviewed_at     TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id              TEXT PRIMARY KEY,
  invoice_number  TEXT NOT NULL UNIQUE,
  booking_id      TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_name   TEXT NOT NULL,
  provider_name   TEXT NOT NULL,
  service         TEXT NOT NULL,
  address         TEXT NOT NULL,
  scheduled_date  TEXT NOT NULL,
  scheduled_time  TEXT NOT NULL,
  subtotal        INTEGER NOT NULL,
  visit_charge    INTEGER DEFAULT 0,
  platform_fee    INTEGER DEFAULT 0,
  discount_amount INTEGER DEFAULT 0,
  total_amount    INTEGER NOT NULL,
  commission_amount INTEGER DEFAULT 0,
  provider_amount INTEGER NOT NULL,
  pdf_url         TEXT,
  status          TEXT DEFAULT 'issued',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason               TEXT,
  requested_at         TIMESTAMP DEFAULT NOW(),
  scheduled_delete_at  TIMESTAMP NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  cancelled_at         TIMESTAMP,
  completed_at         TIMESTAMP,
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otps (
  id          TEXT PRIMARY KEY,
  phone       TEXT NOT NULL,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMP NOT NULL,
  used        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS otps_phone_idx        ON otps(phone);
CREATE INDEX IF NOT EXISTS otps_used_expires_idx ON otps(used, expires_at);

-- ─── SEED DEFAULTS IF EMPTY ───────────────────────────────────
-- Insert default platform settings if not already present
INSERT INTO app_settings (key, value, updated_at)
SELECT 'platform',
  '{"commissionRate":10,"defaultCommissionLimit":5000,"platformName":"Athoo","supportPhone":"+92 339 0051068","supportEmail":"support@athoo.pk","maintenanceMode":false,"defaultVisitCharge":200,"maxBookingsPerDay":10,"appVersion":"1.0.0","minBookingNoticeHours":1,"allowGuestBrowsing":true,"providerAutoApprove":false,"bookingCancellationWindowHours":1,"broadcastTTLMinutes":30}',
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'platform');

-- ─── v4.4 PERFORMANCE INDEXES (added 2026-05-12) ──────────────
-- Backfill indexes for hot ORDER BY / WHERE columns surfaced by
-- query audit. All idempotent. Safe to re-run.
CREATE INDEX IF NOT EXISTS users_updated_at_idx ON users (updated_at);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at);
CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx ON support_tickets (created_at);
CREATE INDEX IF NOT EXISTS negotiations_created_at_idx ON negotiations (created_at);
CREATE INDEX IF NOT EXISTS commission_payments_created_at_idx ON commission_payments (created_at);
CREATE INDEX IF NOT EXISTS withdrawal_requests_created_at_idx ON withdrawal_requests (created_at);
CREATE INDEX IF NOT EXISTS refund_requests_created_at_idx ON refund_requests (created_at);
CREATE INDEX IF NOT EXISTS service_categories_sort_order_idx ON service_categories (sort_order);
CREATE INDEX IF NOT EXISTS refund_requests_customer_id_idx ON refund_requests (customer_id);
CREATE INDEX IF NOT EXISTS refund_requests_provider_id_idx ON refund_requests (provider_id);
CREATE INDEX IF NOT EXISTS bookings_public_id_idx ON bookings (public_id);
CREATE INDEX IF NOT EXISTS messages_chat_id_idx ON messages (chat_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages (sender_id);

-- ─── v4.4 Legal acceptance columns ─────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at   TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_version       TEXT;

DO $$ BEGIN RAISE NOTICE 'ATHOO production patch complete. All tables and indexes are up to date.'; END $$;


-- ---------------------------------------------------------------------------
-- High-load performance indexes (safe, idempotent)
-- ---------------------------------------------------------------------------
-- ATHOO production performance indexes
-- Safe to run multiple times. Designed for high-traffic booking/broadcast/admin screens.

CREATE INDEX IF NOT EXISTS users_provider_discovery_idx
  ON users (role, verification_status, is_blocked, is_deactivated, account_status);

CREATE INDEX IF NOT EXISTS users_provider_geo_idx
  ON users (role, latitude, longitude)
  WHERE role = 'provider';

CREATE INDEX IF NOT EXISTS bookings_customer_status_created_idx
  ON bookings (customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS bookings_provider_status_created_idx
  ON bookings (provider_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS bookings_payment_status_idx
  ON bookings (payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS negotiations_customer_status_created_idx
  ON negotiations (customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS negotiations_provider_status_created_idx
  ON negotiations (provider_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS chats_participant1_updated_idx
  ON chats (participant1_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS chats_participant2_updated_idx
  ON chats (participant2_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS messages_chat_created_idx
  ON messages (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx
  ON notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS broadcast_requests_open_service_expiry_idx
  ON broadcast_requests (status, service, expires_at, created_at DESC);

CREATE INDEX IF NOT EXISTS broadcast_requests_customer_created_idx
  ON broadcast_requests (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS broadcast_responses_request_provider_unique_idx
  ON broadcast_responses (request_id, provider_id);

CREATE INDEX IF NOT EXISTS broadcast_responses_provider_created_idx
  ON broadcast_responses (provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS provider_documents_user_status_idx
  ON provider_documents (user_id, status, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_admin_created_idx
  ON audit_log (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_tickets_user_status_created_idx
  ON support_tickets (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS invoices_customer_created_idx
  ON invoices (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS invoices_provider_created_idx
  ON invoices (provider_id, created_at DESC);

-- ─── Leads / Waitlist table (added June 2026) ──────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,               -- 'customer' | 'provider' | 'contact'
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT,
  message         TEXT,
  service         TEXT,
  city            TEXT,
  source          TEXT NOT NULL DEFAULT 'website',
  status          TEXT NOT NULL DEFAULT 'new', -- new | contacted | converted | not_interested | duplicate | archived
  contacted_at    TIMESTAMP,
  notes           TEXT,
  assigned_to     TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_duplicate    BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);
CREATE INDEX IF NOT EXISTS leads_type_idx ON leads (type);
CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads (phone);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);

-- ─── Calls table performance indexes (added June 2026) ─────────────────────
-- The incoming-call poll hits /api/calls/incoming every 2s for every user.
-- Without indexes this is a full table scan. These fix that.
CREATE INDEX IF NOT EXISTS calls_receiver_status_idx ON calls (receiver_id, status);
CREATE INDEX IF NOT EXISTS calls_caller_status_idx ON calls (caller_id, status);

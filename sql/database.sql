-- ============================================================
-- ATHOO — Full Database Schema (Idempotent)
-- Generated from live schema — matches Drizzle ORM definitions
-- in lib/db/src/schema/index.ts exactly.
--
-- Run this on a fresh PostgreSQL database to create all tables.
-- All statements use CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
-- so re-running is safe on an existing database.
--
-- For upgrading an existing production database, use:
--   sql/production_sql_patch.sql  (safe ALTER TABLE ADD COLUMN IF NOT EXISTS)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── USERS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                         TEXT PRIMARY KEY,
  name                       TEXT NOT NULL,
  phone                      TEXT NOT NULL UNIQUE,
  role                       TEXT NOT NULL,
  email                      TEXT,
  profile_image              TEXT,
  profile_color              TEXT DEFAULT '#1A6EE0',
  bio                        TEXT,
  experience                 TEXT,
  services                   TEXT[] DEFAULT '{}',
  location                   TEXT,
  password                   TEXT,
  is_verified                BOOLEAN DEFAULT FALSE,
  is_available               BOOLEAN DEFAULT TRUE,
  rating                     INTEGER DEFAULT 0,
  rating_count               INTEGER DEFAULT 0,
  total_jobs                 INTEGER DEFAULT 0,
  rate_per_hour              INTEGER,
  is_deactivated             BOOLEAN DEFAULT FALSE,
  pending_commission         INTEGER DEFAULT 0,
  total_commission           INTEGER DEFAULT 0,
  commission_limit           INTEGER DEFAULT 5000,
  is_blocked                 BOOLEAN DEFAULT FALSE,
  blocked_reason             TEXT,
  admin_notes                TEXT,
  verification_status        TEXT DEFAULT 'pending',
  verification_note          TEXT,
  expo_push_token            TEXT,
  last_commission_payment_at TIMESTAMP,
  admin_role                 TEXT,
  admin_permissions          JSONB DEFAULT '[]',
  father_name                TEXT,
  cnic_number                TEXT,
  cnic_expiry                TEXT,
  dob                        TEXT,
  account_status             TEXT DEFAULT 'active',
  deletion_scheduled_at      TIMESTAMP,
  language                   TEXT DEFAULT 'en',
  biometric_enabled          BOOLEAN DEFAULT FALSE,
  is_premium                 BOOLEAN DEFAULT FALSE,
  premium_plan_id            TEXT,
  premium_expires_at         TIMESTAMP,
  no_show_count              INTEGER DEFAULT 0,
  cooldown_until             TIMESTAMP,
  email_verified             BOOLEAN DEFAULT FALSE,
  latitude                   TEXT,
  longitude                  TEXT,
  referral_code              TEXT,
  referred_by                TEXT,
  referral_count             INTEGER DEFAULT 0,
  max_travel_distance_km     INTEGER,
  terms_accepted_at          TIMESTAMP,
  privacy_accepted_at        TIMESTAMP,
  legal_version              TEXT,
  joined_at                  TIMESTAMP DEFAULT NOW(),
  updated_at                 TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_role_idx                ON users(role);
CREATE INDEX IF NOT EXISTS users_email_idx               ON users(email);
CREATE INDEX IF NOT EXISTS users_verification_status_idx ON users(verification_status);
CREATE INDEX IF NOT EXISTS users_is_available_idx        ON users(is_available);
CREATE INDEX IF NOT EXISTS users_is_blocked_idx          ON users(is_blocked);
CREATE INDEX IF NOT EXISTS users_referral_code_idx       ON users(referral_code);
CREATE INDEX IF NOT EXISTS users_account_status_idx      ON users(account_status);

-- ─── OTPs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otps (
  id         TEXT PRIMARY KEY,
  phone      TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS otps_phone_idx        ON otps(phone);
CREATE INDEX IF NOT EXISTS otps_used_expires_idx ON otps(used, expires_at);

-- ─── SERVICE CATEGORIES ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_categories (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  name_ur                TEXT,
  slug                   TEXT NOT NULL UNIQUE,
  icon                   TEXT DEFAULT 'tool',
  color                  TEXT DEFAULT '#1A6EE0',
  visit_charge           INTEGER DEFAULT 0,
  description            TEXT,
  commission_pct         REAL DEFAULT 10,
  platform_fee_pct       REAL DEFAULT 5,
  min_hourly_rate        INTEGER,
  max_hourly_rate        INTEGER,
  estimated_duration_hrs REAL,
  is_active              BOOLEAN DEFAULT TRUE,
  sort_order             INTEGER DEFAULT 0,
  created_by             TEXT,
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

-- ─── PAYMENT ACCOUNTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_accounts (
  id             TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  bank_name      TEXT,
  account_title  TEXT NOT NULL,
  account_number TEXT NOT NULL,
  iban           TEXT,
  instructions   TEXT,
  is_active      BOOLEAN DEFAULT TRUE,
  sort_order     INTEGER DEFAULT 0,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- ─── SUBSCRIPTION PLANS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  audience      TEXT NOT NULL DEFAULT 'provider',
  price_monthly INTEGER DEFAULT 0,
  price_yearly  INTEGER DEFAULT 0,
  features      JSONB DEFAULT '[]',
  is_active     BOOLEAN DEFAULT TRUE,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ─── BOOKINGS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                       TEXT PRIMARY KEY,
  public_id                TEXT UNIQUE,
  customer_id              TEXT NOT NULL REFERENCES users(id),
  customer_name            TEXT NOT NULL,
  customer_phone           TEXT NOT NULL,
  provider_id              TEXT NOT NULL REFERENCES users(id),
  provider_name            TEXT NOT NULL,
  provider_phone           TEXT NOT NULL,
  service                  TEXT NOT NULL,
  service_icon             TEXT NOT NULL DEFAULT 'tool',
  description              TEXT,
  attachment               TEXT,
  address                  TEXT NOT NULL,
  scheduled_date           TEXT NOT NULL,
  scheduled_time           TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'pending',
  price                    INTEGER,
  commission_amount        INTEGER DEFAULT 0,
  provider_amount          INTEGER DEFAULT 0,
  commission_rate          INTEGER DEFAULT 0,
  picked_lat               REAL,
  picked_lng               REAL,
  customer_lat             REAL,
  customer_lng             REAL,
  provider_lat             REAL,
  provider_lng             REAL,
  provider_accuracy        REAL,
  provider_updated_at      TIMESTAMP,
  provider_arrived_at      TIMESTAMP,
  start_pin                TEXT,
  start_pin_expires_at     TIMESTAMP,
  complete_pin             TEXT,
  complete_pin_expires_at  TIMESTAMP,
  rating_reminder_sent_at  TIMESTAMP,
  pre_job_reminder_sent_at TIMESTAMP,
  job_started_at           TIMESTAMP,
  visit_charge             INTEGER DEFAULT 0,
  category_slug            TEXT,
  payment_status           TEXT NOT NULL DEFAULT 'pending',
  paid_at                  TIMESTAMP,
  received_at              TIMESTAMP,
  rating                   INTEGER,
  review                   TEXT,
  created_at               TIMESTAMP DEFAULT NOW(),
  updated_at               TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bookings_customer_id_idx ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS bookings_provider_id_idx ON bookings(provider_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx      ON bookings(status);
CREATE INDEX IF NOT EXISTS bookings_created_at_idx  ON bookings(created_at);

-- ─── NEGOTIATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS negotiations (
  id               TEXT PRIMARY KEY,
  customer_id      TEXT NOT NULL,
  customer_name    TEXT NOT NULL,
  provider_id      TEXT NOT NULL,
  provider_name    TEXT NOT NULL,
  service          TEXT NOT NULL,
  customer_offer   INTEGER NOT NULL,
  provider_counter INTEGER,
  final_price      INTEGER,
  status           TEXT NOT NULL DEFAULT 'customer_offer',
  expires_at       TIMESTAMP,
  messages         JSONB DEFAULT '[]',
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

-- ─── CHATS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chats (
  id                TEXT PRIMARY KEY,
  participant1_id   TEXT NOT NULL,
  participant2_id   TEXT NOT NULL,
  participant1_name TEXT NOT NULL,
  participant2_name TEXT NOT NULL,
  booking_id        TEXT,
  service           TEXT,
  participant1_hidden_at TIMESTAMP,
  participant2_hidden_at TIMESTAMP,
  is_locked         BOOLEAN NOT NULL DEFAULT FALSE,
  locked_reason     TEXT,
  locked_by         TEXT,
  locked_at         TIMESTAMP,
  last_message      TEXT,
  last_message_at   TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- ─── MESSAGES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  chat_id     TEXT NOT NULL,
  sender_id   TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  text        TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_chat_id_idx   ON messages(chat_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages(sender_id);

-- ─── CALLS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calls (
  id                TEXT PRIMARY KEY,
  caller_id         TEXT NOT NULL,
  caller_name       TEXT NOT NULL,
  receiver_id       TEXT NOT NULL,
  caller_initials   TEXT NOT NULL DEFAULT '??',
  caller_color      TEXT DEFAULT '#1A6EE0',
  service           TEXT,
  status            TEXT NOT NULL DEFAULT 'ringing',
  offer             TEXT,
  answer            TEXT,
  caller_candidates TEXT DEFAULT '[]',
  callee_candidates TEXT DEFAULT '[]',
  started_at        TIMESTAMP,
  ended_at          TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW()
);

-- ─── APP SETTINGS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ─── ADMIN BROADCASTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  audience        TEXT NOT NULL DEFAULT 'all',
  created_by      TEXT NOT NULL,
  created_by_name TEXT,
  sent_count      INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ─── SAVED ADDRESSES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_addresses (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  label      TEXT NOT NULL,
  address    TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT 'map-pin',
  is_default BOOLEAN DEFAULT FALSE,
  latitude   REAL,
  longitude  REAL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ─── SUPPORT TICKETS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  user_name       TEXT NOT NULL,
  user_phone      TEXT NOT NULL,
  user_role       TEXT NOT NULL,
  subject         TEXT NOT NULL,
  message         TEXT NOT NULL,
  booking_id      TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  priority        TEXT NOT NULL DEFAULT 'normal',
  admin_notes     TEXT,
  resolution_note TEXT,
  assigned_to     TEXT,
  resolved_by     TEXT,
  resolved_at     TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx  ON support_tickets(status);

-- ─── TICKET NOTES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_notes (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES support_tickets(id),
  admin_id    TEXT NOT NULL,
  admin_name  TEXT NOT NULL,
  note        TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── AUDIT LOG ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  admin_id   TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  admin_role TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  target_id  TEXT,
  details    JSONB,
  ip         TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

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

-- ─── PROVIDER DOCUMENTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_documents (
  id             TEXT PRIMARY KEY,
  provider_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  label          TEXT,
  url            TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  rejection_note TEXT,
  reviewed_by    TEXT,
  reviewed_at    TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- ─── SAVED PROVIDERS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_providers (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS saved_providers_user_provider_uq
  ON saved_providers(user_id, provider_id);
CREATE INDEX IF NOT EXISTS saved_providers_user_created_idx
  ON saved_providers(user_id, created_at DESC);

-- ─── IN-APP NOTIFICATIONS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'info',
  link       TEXT,
  data       JSONB,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications(is_read);

-- ─── PROMOTIONS ───────────────────────────────────────────────
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

-- ─── REFUND REQUESTS ──────────────────────────────────────────
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

-- ─── WITHDRAWAL REQUESTS ──────────────────────────────────────
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

-- ─── COMMISSION PAYMENTS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_payments (
  id             TEXT PRIMARY KEY,
  provider_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL,
  account_id     TEXT,
  reference      TEXT,
  screenshot_url TEXT,
  note           TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  reviewed_by    TEXT,
  reviewed_at    TIMESTAMP,
  rejection_note TEXT,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- ─── SERVICE ADD REQUESTS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_add_requests (
  id                  TEXT PRIMARY KEY,
  provider_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_category_id TEXT,
  service_name        TEXT NOT NULL,
  documents           JSONB DEFAULT '[]',
  note                TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMP,
  rejection_note      TEXT,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- ─── USER SUBSCRIPTIONS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id           TEXT NOT NULL REFERENCES subscription_plans(id),
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

-- ─── ACCOUNT DELETION REQUESTS ────────────────────────────────
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason              TEXT,
  requested_at        TIMESTAMP DEFAULT NOW(),
  scheduled_delete_at TIMESTAMP NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  cancelled_at        TIMESTAMP,
  completed_at        TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- ─── EMAIL CHANGE REQUESTS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_change_requests (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email  TEXT NOT NULL,
  otp_code   TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified   BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─── PHONE CHANGE REQUESTS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS phone_change_requests (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_phone  TEXT NOT NULL,
  otp_code   TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified   BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─── BROADCAST REQUESTS ───────────────────────────────────────
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

-- ─── BROADCAST RESPONSES ──────────────────────────────────────
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

-- ─── MARKETING BANNERS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_banners (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  image_url       TEXT,
  bg_color_from   TEXT DEFAULT '#1A6EE0',
  bg_color_to     TEXT DEFAULT '#0D4BA0',
  icon_name       TEXT DEFAULT 'star',
  link_type       TEXT DEFAULT 'none',
  link_target     TEXT,
  target_audience TEXT DEFAULT 'all',
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INTEGER DEFAULT 0,
  expires_at      TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─── APP ANNOUNCEMENTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_announcements (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  button_text     TEXT DEFAULT 'Got it',
  button_link     TEXT,
  image_url       TEXT,
  target_audience TEXT DEFAULT 'all',
  is_active       BOOLEAN DEFAULT TRUE,
  show_once       BOOLEAN DEFAULT TRUE,
  priority        INTEGER DEFAULT 0,
  expires_at      TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─── FAQs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS faqs (
  id              TEXT PRIMARY KEY,
  question        TEXT NOT NULL,
  answer          TEXT NOT NULL,
  category        TEXT DEFAULT 'general',
  target_audience TEXT DEFAULT 'all',
  sort_order      INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─── SERVICE AREAS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_areas (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  province   TEXT,
  is_active  BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ─── REVIEWS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id                  TEXT PRIMARY KEY,
  booking_id          TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reviewer_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_name       TEXT NOT NULL,
  reviewed_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_name       TEXT NOT NULL,
  rating              INTEGER NOT NULL,
  review              TEXT,
  is_disputed         BOOLEAN DEFAULT FALSE,
  dispute_note        TEXT,
  dispute_resolved_at TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reviews_reviewed_id_idx ON reviews(reviewed_id);

-- ─── INVOICES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                TEXT PRIMARY KEY,
  invoice_number    TEXT NOT NULL UNIQUE,
  booking_id        TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_name     TEXT NOT NULL,
  provider_name     TEXT NOT NULL,
  service           TEXT NOT NULL,
  address           TEXT NOT NULL,
  scheduled_date    TEXT NOT NULL,
  scheduled_time    TEXT NOT NULL,
  subtotal          INTEGER NOT NULL,
  visit_charge      INTEGER DEFAULT 0,
  platform_fee      INTEGER DEFAULT 0,
  discount_amount   INTEGER DEFAULT 0,
  total_amount      INTEGER NOT NULL,
  commission_amount INTEGER DEFAULT 0,
  provider_amount   INTEGER NOT NULL,
  pdf_url           TEXT,
  status            TEXT DEFAULT 'issued',
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- ─── REPORT ISSUES ────────────────────────────────────────────
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

-- ─── HOURLY RATE REQUESTS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS hourly_rate_requests (
  id             TEXT PRIMARY KEY,
  provider_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name  TEXT NOT NULL,
  service        TEXT NOT NULL,
  current_rate   INTEGER,
  requested_rate INTEGER NOT NULL,
  reason         TEXT,
  status         TEXT DEFAULT 'pending',
  reviewed_by    TEXT,
  review_note    TEXT,
  reviewed_at    TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- ─── NOTIFICATION TEMPLATES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_templates (
  id              TEXT PRIMARY KEY,
  key             TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  channel         TEXT NOT NULL,
  target_audience TEXT DEFAULT 'all',
  subject         TEXT,
  body            TEXT NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─── LOGIN HISTORY ────────────────────────────────────────────
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

-- ─── USER BLOCKS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_blocks (
  id         TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason     TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─── ADMIN BLACKLIST ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_blacklist (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  value      TEXT NOT NULL,
  reason     TEXT,
  added_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_blacklist_type_value_idx
  ON admin_blacklist(type, value) WHERE is_active = TRUE;

-- ─── EMERGENCY CONTACTS ───────────────────────────────────────
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

-- ─── DEFAULT PLATFORM SETTINGS ───────────────────────────────
INSERT INTO app_settings (key, value, updated_at)
SELECT
  'platform',
  '{
    "commissionRate": 10,
    "defaultCommissionLimit": 5000,
    "platformName": "Athoo",
    "supportPhone": "+92 339 0051068",
    "supportEmail": "support@athoo.pk",
    "maintenanceMode": false,
    "defaultVisitCharge": 200,
    "maxBookingsPerDay": 10,
    "appVersion": "1.0.0",
    "minBookingNoticeHours": 1,
    "allowGuestBrowsing": true,
    "providerAutoApprove": false,
    "bookingCancellationWindowHours": 1,
    "broadcastTTLMinutes": 30
  }',
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'platform');

-- ─── v4.4 Drizzle-schema parity indexes ──────────────────────
-- Ensures fresh-DB bootstrap matches lib/db/src/schema/index.ts exactly.
-- All idempotent (CREATE INDEX IF NOT EXISTS), safe to re-run.
CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone);
CREATE INDEX IF NOT EXISTS users_updated_at_idx ON users (updated_at);
CREATE INDEX IF NOT EXISTS bookings_public_id_idx ON bookings (public_id);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at);
CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx ON support_tickets (created_at);
CREATE INDEX IF NOT EXISTS negotiations_created_at_idx ON negotiations (created_at);
CREATE INDEX IF NOT EXISTS commission_payments_provider_id_idx ON commission_payments (provider_id);
CREATE INDEX IF NOT EXISTS commission_payments_created_at_idx ON commission_payments (created_at);
CREATE INDEX IF NOT EXISTS commission_payments_status_idx ON commission_payments (status);
CREATE INDEX IF NOT EXISTS withdrawal_requests_created_at_idx ON withdrawal_requests (created_at);
CREATE INDEX IF NOT EXISTS refund_requests_created_at_idx ON refund_requests (created_at);
CREATE INDEX IF NOT EXISTS refund_requests_customer_id_idx ON refund_requests (customer_id);
CREATE INDEX IF NOT EXISTS refund_requests_provider_id_idx ON refund_requests (provider_id);
CREATE INDEX IF NOT EXISTS provider_documents_provider_id_idx ON provider_documents (provider_id);
CREATE INDEX IF NOT EXISTS service_categories_sort_order_idx ON service_categories (sort_order);
CREATE INDEX IF NOT EXISTS service_categories_is_active_idx ON service_categories (is_active);
CREATE INDEX IF NOT EXISTS user_subscriptions_user_id_idx ON user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS user_subscriptions_status_idx ON user_subscriptions (status);
CREATE INDEX IF NOT EXISTS audit_log_admin_id_idx ON audit_log (admin_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx ON admin_notifications (created_at);
CREATE INDEX IF NOT EXISTS reviews_reviewed_id_idx ON reviews (reviewed_id);

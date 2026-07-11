-- ============================================================
-- ATHOO SEED DATA — Demo Accounts + Default Configuration
-- ============================================================
-- Passwords below are bcrypt-hashed.
-- Plaintext credentials are shown in comments.
--   admin@athoo.com   / 03000000001  / Admin@123
--   customer (demo)   / 03000000002  / Demo@123
--   provider (demo)   / 03000000004  / Demo@123
-- ============================================================

-- ─── SERVICE CATEGORIES ──────────────────────────────────────────────────────
INSERT INTO service_categories (id, name, name_ur, slug, icon, color, visit_charge, commission_pct, min_hourly_rate, max_hourly_rate, is_active, sort_order, created_at, updated_at)
VALUES
  ('cat-electrician', 'Electrician',     'الیکٹریشن',    'electrician',  'zap',         '#F59E0B', 200, 10, 500,  2000, TRUE, 1,  NOW(), NOW()),
  ('cat-plumber',     'Plumber',         'پلمبر',         'plumber',      'droplets',    '#3B82F6', 200, 10, 500,  2000, TRUE, 2,  NOW(), NOW()),
  ('cat-carpenter',   'Carpenter',       'ترکھان',        'carpenter',    'hammer',      '#92400E', 200, 10, 600,  2500, TRUE, 3,  NOW(), NOW()),
  ('cat-painter',     'Painter',         'رنگ ساز',       'painter',      'paint-bucket','#EF4444', 150, 10, 400,  1500, TRUE, 4,  NOW(), NOW()),
  ('cat-ac-repair',   'AC Repair',       'اے سی مرمت',   'ac-repair',    'wind',        '#06B6D4', 300, 12, 800,  3000, TRUE, 5,  NOW(), NOW()),
  ('cat-cleaning',    'Cleaning',        'صفائی',         'cleaning',     'sparkles',    '#10B981', 150, 10, 300,  1200, TRUE, 6,  NOW(), NOW()),
  ('cat-pest',        'Pest Control',    'کیڑے مار',      'pest-control', 'bug',         '#84CC16', 200, 12, 600,  2000, TRUE, 7,  NOW(), NOW()),
  ('cat-gas',         'Gas Repair',      'گیس مرمت',      'gas-repair',   'flame',       '#F97316', 200, 10, 500,  2000, TRUE, 8,  NOW(), NOW()),
  ('cat-cctv',        'CCTV & Security', 'سیکیورٹی',      'cctv',         'camera',      '#6366F1', 300, 12, 800,  3000, TRUE, 9,  NOW(), NOW()),
  ('cat-appliance',   'Appliance Repair','آلات مرمت',     'appliance',    'tv',          '#8B5CF6', 200, 10, 500,  2000, TRUE, 10, NOW(), NOW()),
  ('cat-shifting',    'House Shifting',  'گھر شفٹنگ',     'shifting',     'truck',       '#64748B', 500, 10, 1000, 5000, TRUE, 11, NOW(), NOW()),
  ('cat-gardening',   'Gardening',       'باغبانی',        'gardening',    'leaf',        '#22C55E', 150, 10, 400,  1500, TRUE, 12, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- ─── SERVICE AREAS ───────────────────────────────────────────────────────────
INSERT INTO service_areas (id, name, province, is_active, sort_order, created_at, updated_at)
VALUES
  ('area-lahore',     'Lahore',     'Punjab',       TRUE, 1,  NOW(), NOW()),
  ('area-karachi',    'Karachi',    'Sindh',        TRUE, 2,  NOW(), NOW()),
  ('area-islamabad',  'Islamabad',  'ICT',          TRUE, 3,  NOW(), NOW()),
  ('area-rwp',        'Rawalpindi', 'Punjab',       TRUE, 4,  NOW(), NOW()),
  ('area-faisalabad', 'Faisalabad', 'Punjab',       TRUE, 5,  NOW(), NOW()),
  ('area-multan',     'Multan',     'Punjab',       TRUE, 6,  NOW(), NOW()),
  ('area-peshawar',   'Peshawar',   'KPK',          TRUE, 7,  NOW(), NOW()),
  ('area-quetta',     'Quetta',     'Balochistan',  TRUE, 8,  NOW(), NOW()),
  ('area-gujranwala', 'Gujranwala', 'Punjab',       TRUE, 9,  NOW(), NOW()),
  ('area-sialkot',    'Sialkot',    'Punjab',       TRUE, 10, NOW(), NOW()),
  ('area-hyderabad',  'Hyderabad',  'Sindh',        TRUE, 11, NOW(), NOW()),
  ('area-bahawalpur', 'Bahawalpur', 'Punjab',       TRUE, 12, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── PAYMENT ACCOUNTS ────────────────────────────────────────────────────────
INSERT INTO payment_accounts (id, label, bank_name, account_title, account_number, iban, instructions, is_active, sort_order)
VALUES
  ('pac-hbl',       'HBL Main Account',       'Habib Bank Limited', 'ATHOO Technologies',  '01234567890123',   'PK36HABB0000000123456701', 'Transfer exact amount. Use your phone number as reference.', TRUE, 1),
  ('pac-jazz',      'JazzCash',               NULL,                 'ATHOO Technologies',  '03XX-XXXXXXX',     NULL,                       'Send to mobile account. Screenshot required.',               TRUE, 2),
  ('pac-easypaisa', 'Easypaisa',              NULL,                 'ATHOO Technologies',  '03XX-XXXXXXX',     NULL,                       'Send to mobile account. Screenshot required.',               TRUE, 3)
ON CONFLICT (id) DO NOTHING;

-- ─── EMERGENCY CONTACTS ──────────────────────────────────────────────────────
INSERT INTO emergency_contacts (id, name, number, description, icon, sort_order, is_active)
VALUES
  ('ec-police',    'Police',             '15',       'Emergency police helpline',              'shield',      1, TRUE),
  ('ec-fire',      'Fire Brigade',       '16',       'Fire emergency services',                'flame',       2, TRUE),
  ('ec-ambulance', 'Ambulance',          '1122',     'Emergency ambulance service',            'activity',    3, TRUE),
  ('ec-womenhelpline', 'Women Helpline', '1099',     'Women safety and support helpline',      'heart',       4, TRUE),
  ('ec-rescue',    'Rescue 1122',        '1122',     'Punjab emergency rescue service',        'phone-call',  5, TRUE),
  ('ec-athoo',     'ATHOO Support',      '+923390051068', 'ATHOO platform customer support',  'headphones',  6, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ─── SUBSCRIPTION PLANS ──────────────────────────────────────────────────────
INSERT INTO subscription_plans (id, name, description, audience, price_monthly, price_yearly, features, is_active, sort_order)
VALUES
  ('plan-basic',
   'Basic',
   'Get started on ATHOO with essential features.',
   'provider', 0, 0,
   '["Profile listing","Customer messaging","Standard support"]',
   TRUE, 1),
  ('plan-pro',
   'Pro Provider',
   'Priority listing and reduced commission for serious professionals.',
   'provider', 999, 9999,
   '["Priority search ranking","Pro badge on profile","10% commission discount","Dedicated support","Analytics dashboard"]',
   TRUE, 2),
  ('plan-elite',
   'Elite Provider',
   'Maximum visibility and lowest commission for top providers.',
   'provider', 1999, 19999,
   '["Top search ranking","Elite badge","20% commission discount","Priority broadcast responses","Featured on home screen","24/7 support"]',
   TRUE, 3)
ON CONFLICT (id) DO NOTHING;

-- ─── PLATFORM SETTINGS ───────────────────────────────────────────────────────
INSERT INTO app_settings (key, value, updated_at)
VALUES (
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
    "broadcastTTLMinutes": 30,
    "broadcastExpandIntervalMinutes": 5,
    "defaultServiceRadiusKm": 15,
    "maxNegotiationRounds": 3,
    "premiumProfileBadgeEnabled": true,
    "customerCancellationFee": 0,
    "providerCancellationPenalty": 0,
    "premiumCommissionDiscountPercent": 10
  }',
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- ─── NOTIFICATION TEMPLATES ───────────────────────────────────────────────────
INSERT INTO notification_templates (id, key, name, channel, target_audience, subject, body, is_active)
VALUES
  ('nt-1', 'booking_confirmed',    'Booking Confirmed',        'push', 'customer', NULL, 'Your booking with {{providerName}} has been confirmed for {{date}} at {{time}}.', TRUE),
  ('nt-2', 'booking_accepted',     'Booking Accepted',         'push', 'customer', NULL, '{{providerName}} accepted your booking! They will arrive on {{date}} at {{time}}.', TRUE),
  ('nt-3', 'booking_started',      'Provider On The Way',      'push', 'customer', NULL, '{{providerName}} has started the job and is on their way to you.', TRUE),
  ('nt-4', 'booking_completed',    'Job Completed',            'push', 'customer', NULL, 'Your job with {{providerName}} is complete. Please rate your experience.', TRUE),
  ('nt-5', 'booking_cancelled',    'Booking Cancelled',        'push', 'all',      NULL, 'Booking #{{bookingId}} has been cancelled.', TRUE),
  ('nt-6', 'new_booking_request',  'New Booking Request',      'push', 'provider', NULL, 'You have a new booking request from {{customerName}} for {{service}}.', TRUE),
  ('nt-7', 'commission_due',       'Commission Payment Due',   'push', 'provider', NULL, 'Your pending commission has reached PKR {{amount}}. Please clear dues to continue accepting bookings.', TRUE),
  ('nt-8', 'commission_approved',  'Commission Payment Approved', 'push', 'provider', NULL, 'Your commission payment of PKR {{amount}} has been approved. You can now accept new bookings.', TRUE),
  ('nt-9', 'broadcast_response',  'Provider Responded',       'push', 'customer', NULL, '{{providerName}} responded to your broadcast request with PKR {{amount}}.', TRUE)
ON CONFLICT (key) DO NOTHING;

-- ─── DEMO USERS ──────────────────────────────────────────────────────────────
-- NOTE: Passwords are bcrypt hashed. Run scripts/src/seed.ts for proper hashing,
-- or use the API /auth/login endpoint. These INSERT stmts are for reference only —
-- the actual seed runs via: pnpm db:seed
--
-- Super Admin:   phone=03000000001  password=Admin@123
-- Demo Customer: phone=03000000002  password=Demo@123
-- Demo Provider: phone=03000000004  password=Demo@123

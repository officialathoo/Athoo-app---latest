-- ============================================================
-- ATHOO REFERENCE SEED — Non-sensitive default configuration only
-- ============================================================
-- This file does not create users, credentials, or payment destinations.
-- Use scripts/src/seed.ts only with ALLOW_DEVELOPMENT_SEED=1 on an isolated
-- development database. Create production administrators through the secure
-- bootstrap command and payment destinations through the admin panel.
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
  ('area-islamabad',  'Islamabad',  'Islamabad Capital Territory', TRUE, 3,  NOW(), NOW()),
  ('area-rwp',        'Rawalpindi', 'Punjab',       TRUE, 4,  NOW(), NOW()),
  ('area-faisalabad', 'Faisalabad', 'Punjab',       TRUE, 5,  NOW(), NOW()),
  ('area-multan',     'Multan',     'Punjab',       TRUE, 6,  NOW(), NOW()),
  ('area-peshawar',   'Peshawar',   'Khyber Pakhtunkhwa', TRUE, 7,  NOW(), NOW()),
  ('area-quetta',     'Quetta',     'Balochistan',  TRUE, 8,  NOW(), NOW()),
  ('area-gujranwala', 'Gujranwala', 'Punjab',       TRUE, 9,  NOW(), NOW()),
  ('area-sialkot',    'Sialkot',    'Punjab',       TRUE, 10, NOW(), NOW()),
  ('area-hyderabad',  'Hyderabad',  'Sindh',        TRUE, 11, NOW(), NOW()),
  ('area-bahawalpur', 'Bahawalpur', 'Punjab',       TRUE, 12, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── PAYMENT ACCOUNTS ────────────────────────────────────────────────────────
-- Intentionally empty. Never place sample bank/mobile-wallet details in an
-- active payment table. Configure verified destinations in the admin panel.

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
    "broadcastInitialRadiusKm": 30,
    "broadcastExpansionRadiusKm": 50,
    "broadcastExpandAfterMinutes": 5,
    "defaultServiceRadiusKm": 25,
    "maxNegotiationRounds": 3,
    "premiumProfileBadgeEnabled": true,
    "premiumPriorityBoost": true,
    "customerCancellationFee": 0,
    "providerCancellationPenalty": 0,
    "premiumCommissionDiscountPercent": 0,
    "inactivityLifecycleEnabled": true,
    "inactivityWarningDays": 60,
    "inactivityRestrictionDays": 90,
    "inactivityReviewDays": 180,
    "mapRuntimeConfigurationEnabled": false,
    "mapPrimaryProvider": "environment",
    "mapTileProvider": "environment",
    "mapSearchProvider": "environment",
    "mapReverseProvider": "environment",
    "mapDirectionsProvider": "environment",
    "mapProviderFallbackEnabled": false,
    "mapSearchFallbackProvider": "environment",
    "mapReverseFallbackProvider": "environment",
    "mapDirectionsFallbackProvider": "environment",
    "communicationRuntimeConfigurationEnabled": false,
    "emailProvider": "environment",
    "pushProvider": "environment"
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

-- ─── USERS ────────────────────────────────────────────────────────────────────
-- Intentionally empty. No credential-bearing accounts are stored in SQL seed
-- material. Use the secure bootstrap command for the first administrator.

CREATE TABLE IF NOT EXISTS customer_home_settings (
  id text PRIMARY KEY DEFAULT 'default',
  location_label text NOT NULL DEFAULT 'Pakistan',
  show_broadcast_cta boolean NOT NULL DEFAULT true,
  show_platform_stats boolean NOT NULL DEFAULT true,
  show_top_providers boolean NOT NULL DEFAULT true,
  show_emergency_contacts boolean NOT NULL DEFAULT true,
  max_categories integer NOT NULL DEFAULT 12 CHECK (max_categories BETWEEN 1 AND 30),
  max_providers integer NOT NULL DEFAULT 4 CHECK (max_providers BETWEEN 1 AND 12),
  updated_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO customer_home_settings (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

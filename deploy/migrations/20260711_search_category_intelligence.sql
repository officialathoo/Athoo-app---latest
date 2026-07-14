BEGIN;

ALTER TABLE service_categories
  ADD COLUMN IF NOT EXISTS search_keywords text DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS service_categories_featured_sort_idx
  ON service_categories (is_featured DESC, sort_order ASC)
  WHERE is_active = true;

COMMIT;

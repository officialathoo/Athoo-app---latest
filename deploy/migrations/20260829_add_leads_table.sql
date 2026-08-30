-- Adds the leads table referenced by lib/db/src/schema (leadsTable) but absent
-- from the applied migration history. This table tracks inbound customer,
-- provider, and contact leads (website/app/manual sources) so the admin panel
-- can work them through to conversion.
--
-- The schema already declares leadsTable; this migration makes the physical
-- table match so the app and admin panel can read/write leads.

CREATE TABLE IF NOT EXISTS leads (
  id text PRIMARY KEY,
  type text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  message text,
  service text,
  city text,
  source text DEFAULT 'website',
  status text NOT NULL DEFAULT 'new',
  contacted_at timestamp,
  notes text,
  assigned_to text REFERENCES users(id) ON DELETE SET NULL,
  is_duplicate boolean DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX leads_status_idx ON leads (status);
CREATE INDEX leads_type_idx ON leads (type);
CREATE INDEX leads_phone_idx ON leads (phone);
CREATE INDEX leads_created_at_idx ON leads (created_at);

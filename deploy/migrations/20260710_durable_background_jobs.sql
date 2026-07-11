CREATE TABLE IF NOT EXISTS background_jobs (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT background_jobs_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT background_jobs_attempts_check CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 20)
);

CREATE UNIQUE INDEX IF NOT EXISTS background_jobs_dedupe_key_unique
  ON background_jobs (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS background_jobs_claim_idx
  ON background_jobs (available_at, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS background_jobs_failed_idx
  ON background_jobs (failed_at DESC) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS background_jobs_completed_cleanup_idx
  ON background_jobs (completed_at) WHERE status = 'completed';

-- Recover jobs abandoned by a terminated worker. A later worker can safely retry them.
UPDATE background_jobs
SET status = 'pending', locked_at = NULL, locked_by = NULL, updated_at = now()
WHERE status = 'processing' AND locked_at < now() - interval '15 minutes';

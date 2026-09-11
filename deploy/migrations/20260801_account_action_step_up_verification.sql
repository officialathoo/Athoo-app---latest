BEGIN;

-- Account deactivation and deletion use distinct, action-bound email OTP
-- purposes. Replacing this constraint is safe because all historical purposes
-- remain accepted.
ALTER TABLE email_verification_challenges
  DROP CONSTRAINT IF EXISTS email_challenges_purpose_check;
ALTER TABLE email_verification_challenges
  ADD CONSTRAINT email_challenges_purpose_check
  CHECK (purpose IN ('verify_email', 'login', 'email_change', 'account_deactivate', 'account_delete'));

-- Historical deployments did not enforce one pending deletion request per
-- account. Preserve the newest request and safely cancel older duplicates
-- before adding the race-proof partial unique index.
WITH ranked_pending AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id
           ORDER BY created_at DESC NULLS LAST, requested_at DESC NULLS LAST, id DESC
         ) AS pending_rank
  FROM account_deletion_requests
  WHERE status = 'pending'
)
UPDATE account_deletion_requests AS request
SET status = 'cancelled',
    cancelled_at = COALESCE(request.cancelled_at, now()),
    updated_at = now()
FROM ranked_pending
WHERE request.id = ranked_pending.id
  AND ranked_pending.pending_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_one_pending_uidx
  ON account_deletion_requests(user_id)
  WHERE status = 'pending';

COMMIT;

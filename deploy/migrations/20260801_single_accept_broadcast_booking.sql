BEGIN;

ALTER TABLE broadcast_responses
  ADD COLUMN IF NOT EXISTS provider_travelling_charge integer,
  ADD COLUMN IF NOT EXISTS response_type text,
  ADD COLUMN IF NOT EXISTS client_request_id text,
  ADD COLUMN IF NOT EXISTS revision integer,
  ADD COLUMN IF NOT EXISTS rejected_at timestamp;

UPDATE broadcast_responses AS response
SET
  response_type = CASE WHEN response.provider_offer IS NULL OR response.provider_offer <= 0 THEN 'accept' ELSE 'counter' END,
  provider_offer = CASE WHEN response.provider_offer IS NULL OR response.provider_offer <= 0 THEN NULL ELSE response.provider_offer END,
  provider_travelling_charge = GREATEST(0, COALESCE(response.provider_travelling_charge, request.travelling_charge, 0)),
  revision = GREATEST(1, COALESCE(response.revision, 1)),
  status = CASE
    WHEN response.status IN ('pending', 'accepted_by_customer', 'rejected_by_customer', 'not_selected', 'withdrawn')
      THEN response.status
    ELSE 'withdrawn'
  END
FROM broadcast_requests AS request
WHERE request.id = response.request_id;

ALTER TABLE broadcast_responses
  ALTER COLUMN response_type SET DEFAULT 'counter',
  ALTER COLUMN response_type SET NOT NULL,
  ALTER COLUMN provider_travelling_charge SET DEFAULT 0,
  ALTER COLUMN provider_travelling_charge SET NOT NULL,
  ALTER COLUMN revision SET DEFAULT 1,
  ALTER COLUMN revision SET NOT NULL,
  DROP CONSTRAINT IF EXISTS broadcast_responses_response_type_check,
  ADD CONSTRAINT broadcast_responses_response_type_check CHECK (response_type IN ('accept', 'counter')),
  DROP CONSTRAINT IF EXISTS broadcast_responses_status_check,
  ADD CONSTRAINT broadcast_responses_status_check CHECK (status IN ('pending', 'accepted_by_customer', 'rejected_by_customer', 'not_selected', 'withdrawn')),
  DROP CONSTRAINT IF EXISTS broadcast_responses_revision_check,
  ADD CONSTRAINT broadcast_responses_revision_check CHECK (revision >= 1),
  DROP CONSTRAINT IF EXISTS broadcast_responses_offer_check,
  ADD CONSTRAINT broadcast_responses_offer_check CHECK (
    (response_type = 'accept' AND provider_offer IS NULL)
    OR (response_type = 'counter' AND provider_offer IS NOT NULL AND provider_offer > 0)
  ),
  DROP CONSTRAINT IF EXISTS broadcast_responses_travel_check,
  ADD CONSTRAINT broadcast_responses_travel_check CHECK (provider_travelling_charge >= 0);

-- Keep the response already referenced by the accepted broadcast. Otherwise,
-- retain the accepted/pending response before older closed duplicates.
WITH ranked_responses AS (
  SELECT
    response.id,
    row_number() OVER (
      PARTITION BY response.request_id, response.provider_id
      ORDER BY
        CASE WHEN request.accepted_response_id = response.id THEN 0 ELSE 1 END,
        CASE response.status WHEN 'accepted_by_customer' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        response.updated_at DESC NULLS LAST,
        response.created_at DESC NULLS LAST,
        response.id DESC
    ) AS position
  FROM broadcast_responses AS response
  INNER JOIN broadcast_requests AS request ON request.id = response.request_id
)
DELETE FROM broadcast_responses AS response
USING ranked_responses AS ranked
WHERE response.id = ranked.id
  AND ranked.position > 1;

-- A partially applied earlier attempt could have written duplicate request IDs.
-- Preserve the newest use and clear only the duplicate idempotency key; the
-- provider/request uniqueness rule above still preserves the actual response.
WITH ranked_client_requests AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY provider_id, client_request_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS position
  FROM broadcast_responses
  WHERE client_request_id IS NOT NULL
)
UPDATE broadcast_responses AS response
SET client_request_id = NULL
FROM ranked_client_requests AS ranked
WHERE response.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS broadcast_responses_request_provider_uidx
  ON broadcast_responses (request_id, provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS broadcast_responses_provider_request_id_uidx
  ON broadcast_responses (provider_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS broadcast_responses_request_status_idx
  ON broadcast_responses (request_id, status);

UPDATE broadcast_requests AS request
SET accepted_response_id = NULL
WHERE accepted_response_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM broadcast_responses AS response
    WHERE response.id = request.accepted_response_id
      AND response.request_id = request.id
  );

UPDATE broadcast_requests AS request
SET booking_id = NULL
WHERE booking_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM bookings AS booking WHERE booking.id = request.booking_id);

WITH ranked_booking_links AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY booking_id
      ORDER BY CASE WHEN status = 'accepted' THEN 0 ELSE 1 END, updated_at DESC NULLS LAST, id DESC
    ) AS position
  FROM broadcast_requests
  WHERE booking_id IS NOT NULL
)
UPDATE broadcast_requests AS request
SET booking_id = NULL
FROM ranked_booking_links AS ranked
WHERE request.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS broadcast_requests_booking_uidx
  ON broadcast_requests (booking_id)
  WHERE booking_id IS NOT NULL;

ALTER TABLE broadcast_requests
  DROP CONSTRAINT IF EXISTS broadcast_requests_booking_id_fkey,
  ADD CONSTRAINT broadcast_requests_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL NOT VALID,
  DROP CONSTRAINT IF EXISTS broadcast_requests_accepted_response_id_fkey,
  ADD CONSTRAINT broadcast_requests_accepted_response_id_fkey
    FOREIGN KEY (accepted_response_id) REFERENCES broadcast_responses(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE broadcast_requests VALIDATE CONSTRAINT broadcast_requests_booking_id_fkey;
ALTER TABLE broadcast_requests VALIDATE CONSTRAINT broadcast_requests_accepted_response_id_fkey;

UPDATE bookings AS booking
SET client_request_id = 'broadcast:' || request.id
FROM broadcast_requests AS request
WHERE request.booking_id = booking.id
  AND booking.client_request_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM bookings AS conflict
    WHERE conflict.customer_id = booking.customer_id
      AND conflict.client_request_id = 'broadcast:' || request.id
  );

-- Legacy broadcast selection created a pending booking and required the
-- provider to accept a second time. Promote only bookings already linked to an
-- accepted broadcast; all other pending booking flows remain untouched.
UPDATE bookings AS booking
SET status = 'accepted', updated_at = now()
FROM broadcast_requests AS request
WHERE request.booking_id = booking.id
  AND request.status = 'accepted'
  AND request.accepted_response_id IS NOT NULL
  AND booking.status = 'pending';

CREATE TABLE IF NOT EXISTS broadcast_offer_events (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES broadcast_requests(id) ON DELETE CASCADE,
  response_id text REFERENCES broadcast_responses(id) ON DELETE SET NULL,
  booking_id text REFERENCES bookings(id) ON DELETE SET NULL,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  actor_role text NOT NULL,
  event_type text NOT NULL,
  revision integer,
  amount integer,
  travelling_charge integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT broadcast_offer_events_actor_role_check CHECK (actor_role IN ('customer', 'provider', 'system', 'admin')),
  CONSTRAINT broadcast_offer_events_event_type_check CHECK (event_type IN (
    'response_submitted', 'response_revised', 'response_rejected', 'response_withdrawn',
    'booking_created', 'broadcast_cancelled'
  )),
  CONSTRAINT broadcast_offer_events_revision_check CHECK (revision IS NULL OR revision >= 1),
  CONSTRAINT broadcast_offer_events_amount_check CHECK (amount IS NULL OR amount > 0),
  CONSTRAINT broadcast_offer_events_travel_check CHECK (travelling_charge IS NULL OR travelling_charge >= 0)
);
CREATE INDEX IF NOT EXISTS broadcast_offer_events_request_created_idx
  ON broadcast_offer_events (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS broadcast_offer_events_response_created_idx
  ON broadcast_offer_events (response_id, created_at DESC);
CREATE INDEX IF NOT EXISTS broadcast_offer_events_actor_created_idx
  ON broadcast_offer_events (actor_id, created_at DESC);

COMMIT;

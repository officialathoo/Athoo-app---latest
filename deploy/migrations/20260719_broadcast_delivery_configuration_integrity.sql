-- Phase 24.7: repair broadcast lifecycle settings that can make provider
-- expansion impossible. The historical API fallback stored TTL=3 while the
-- default expansion delay was 5 minutes, so requests expired before the
-- expansion worker could run.
--
-- This migration is idempotent and only rewrites the two broadcast timing keys
-- when they are missing, malformed, out of range, or internally inconsistent.

WITH platform AS (
  SELECT
    key,
    value,
    CASE
      WHEN COALESCE(value ->> 'broadcastTTLMinutes', '') ~ '^[0-9]+$'
        THEN (value ->> 'broadcastTTLMinutes')::integer
      ELSE NULL
    END AS raw_ttl,
    CASE
      WHEN COALESCE(value ->> 'broadcastExpandAfterMinutes', '') ~ '^[0-9]+$'
        THEN (value ->> 'broadcastExpandAfterMinutes')::integer
      ELSE NULL
    END AS raw_expand
  FROM app_settings
  WHERE key = 'platform'
), normalized AS (
  SELECT
    key,
    value,
    CASE
      WHEN raw_ttl BETWEEN 2 AND 60 THEN raw_ttl
      ELSE 30
    END AS base_ttl,
    CASE
      WHEN raw_expand BETWEEN 1 AND 59 THEN raw_expand
      ELSE 5
    END AS base_expand
  FROM platform
), repaired AS (
  SELECT
    key,
    value,
    CASE
      WHEN base_expand >= base_ttl AND base_ttl < 30 THEN 30
      ELSE base_ttl
    END AS final_ttl,
    base_expand
  FROM normalized
), final_values AS (
  SELECT
    key,
    value,
    final_ttl,
    CASE
      WHEN base_expand >= final_ttl THEN GREATEST(1, LEAST(5, final_ttl - 1))
      ELSE base_expand
    END AS final_expand
  FROM repaired
)
UPDATE app_settings AS settings
SET
  value = jsonb_set(
    jsonb_set(settings.value, '{broadcastTTLMinutes}', to_jsonb(final_values.final_ttl), true),
    '{broadcastExpandAfterMinutes}',
    to_jsonb(final_values.final_expand),
    true
  ),
  updated_at = NOW()
FROM final_values
WHERE settings.key = final_values.key
  AND (
    settings.value ->> 'broadcastTTLMinutes' IS DISTINCT FROM final_values.final_ttl::text
    OR settings.value ->> 'broadcastExpandAfterMinutes' IS DISTINCT FROM final_values.final_expand::text
  );

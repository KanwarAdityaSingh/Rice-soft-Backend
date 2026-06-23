-- Backfill is_verified for drivers that already have a Surepass verification snapshot

UPDATE drivers
SET is_verified = true,
    verified_at = COALESCE(verified_at, updated_at, created_at, CURRENT_TIMESTAMP)
WHERE is_verified = false
  AND verification_details IS NOT NULL
  AND verification_details->>'provider' = 'surepass'
  AND COALESCE(
        verification_details->'mapped'->>'full_name',
        verification_details->'mapped'->>'name',
        ''
      ) <> '';

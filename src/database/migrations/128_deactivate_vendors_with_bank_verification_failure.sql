-- Align existing rows with policy: vendors with a recorded bank verification failure are inactive.

UPDATE vendors
SET is_active = false,
    updated_at = CURRENT_TIMESTAMP
WHERE bank_verification_error IS NOT NULL
  AND is_active = true;

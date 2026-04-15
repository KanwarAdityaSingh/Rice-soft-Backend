-- Purchasers (vendors on saudas) with bank on file but never verified cannot remain active.
UPDATE vendors v
SET is_active = false,
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM saudas s WHERE s.purchaser_id = v.id)
  AND v.bank_details IS NOT NULL
  AND v.bank_details_verified_at IS NULL
  AND v.is_active = true;

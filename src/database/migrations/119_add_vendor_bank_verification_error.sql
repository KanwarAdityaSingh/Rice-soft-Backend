-- Last bank verification failure message (Surepass / name match), for display and audit.
-- Cleared when bank_details are updated or verification succeeds.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS bank_verification_error TEXT;

COMMENT ON COLUMN vendors.bank_verification_error IS 'Last failed bank verification message; NULL if never failed or after success / bank_details change';

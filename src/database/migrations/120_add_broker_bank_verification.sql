-- Persist bank verification for brokers (Surepass), aligned with vendors.

ALTER TABLE brokers
  ADD COLUMN IF NOT EXISTS bank_details_verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS bank_details_verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_verification_error TEXT;

CREATE INDEX IF NOT EXISTS idx_brokers_bank_verified_at
  ON brokers (bank_details_verified_at)
  WHERE bank_details_verified_at IS NOT NULL;

COMMENT ON COLUMN brokers.bank_details_verified_at IS 'Set when stored bank_details are confirmed via Surepass for this broker';
COMMENT ON COLUMN brokers.bank_details_verified_by IS 'User who ran confirm-bank-verification; cleared when bank_details change';
COMMENT ON COLUMN brokers.bank_verification_error IS 'Last failed verify_bank / confirm attempt; cleared on success or bank_details update';

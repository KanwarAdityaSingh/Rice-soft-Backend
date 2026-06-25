-- Bank verification metadata for transporters (same pattern as vendors/brokers)

ALTER TABLE transporters
  ADD COLUMN IF NOT EXISTS bank_details_verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS bank_details_verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_verification_error TEXT;

CREATE INDEX IF NOT EXISTS idx_transporters_bank_verified_at
  ON transporters (bank_details_verified_at)
  WHERE bank_details_verified_at IS NOT NULL;

COMMENT ON COLUMN transporters.bank_details_verified_at IS 'Set when stored bank_details are confirmed via Surepass for this transporter';
COMMENT ON COLUMN transporters.bank_details_verified_by IS 'User who ran confirm-bank-verification or verify_bank on create/update; cleared when bank_details change';
COMMENT ON COLUMN transporters.bank_verification_error IS 'Last failed verify_bank / confirm attempt; cleared on success or bank_details update';

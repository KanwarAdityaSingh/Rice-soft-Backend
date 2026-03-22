-- Persist bank verification for vendors (Surepass) for filtering and display.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS bank_details_verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS bank_details_verified_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vendors_bank_verified_at
  ON vendors (bank_details_verified_at)
  WHERE bank_details_verified_at IS NOT NULL;

COMMENT ON COLUMN vendors.bank_details_verified_at IS 'Set when stored bank_details are confirmed via Surepass for this vendor';
COMMENT ON COLUMN vendors.bank_details_verified_by IS 'User who ran confirm-bank-verification; cleared when bank_details change';

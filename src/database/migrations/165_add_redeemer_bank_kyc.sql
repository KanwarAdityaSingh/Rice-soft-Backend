-- Bank KYC verification metadata for coupon redeemers (Surepass snapshot pattern)

ALTER TABLE redeemers
  ADD COLUMN IF NOT EXISTS kyc_verification_details JSONB,
  ADD COLUMN IF NOT EXISTS bank_details_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bank_verification_error TEXT;

CREATE INDEX IF NOT EXISTS idx_redeemers_bank_verified_at
  ON redeemers (bank_details_verified_at)
  WHERE bank_details_verified_at IS NOT NULL;

COMMENT ON COLUMN redeemers.kyc_verification_details IS 'Surepass snapshots; bank from GET /coupons/public/verifyBankAccount';
COMMENT ON COLUMN redeemers.bank_details_verified_at IS 'Set when bank details match a Surepass snapshot at redeem';
COMMENT ON COLUMN redeemers.bank_verification_error IS 'Last failed bank verification at redeem; cleared on success or bank change';

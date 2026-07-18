-- Snapshot bank name on redemption (same as redeemer at redeem time)

ALTER TABLE redemptions
  ADD COLUMN IF NOT EXISTS payout_bank_name VARCHAR(255);

COMMENT ON COLUMN redemptions.payout_bank_name IS 'Bank name at time of redeem (payout snapshot)';

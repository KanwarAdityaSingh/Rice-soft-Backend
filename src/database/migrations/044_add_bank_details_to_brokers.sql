-- Migration: Add bank_details to brokers table
-- Description: Adds bank_details JSONB column to store bank account information for brokers

-- 1. Add bank_details column (nullable, JSONB)
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS bank_details JSONB DEFAULT '{}';

-- 2. Create index for performance (if needed for searches)
CREATE INDEX IF NOT EXISTS idx_brokers_bank_details ON brokers USING GIN (bank_details) WHERE bank_details IS NOT NULL;

-- 3. Update comments
COMMENT ON COLUMN brokers.bank_details IS 'Bank details stored as JSONB with account_holder_name, account_number, ifsc_code, bank_name, branch';


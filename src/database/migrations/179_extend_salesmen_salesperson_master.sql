-- Migration: Expand salesmen into Salesperson Master
-- - Auto code, personal details, identity + KYC, address, bank verification
-- - Current salary on salesmen + full salary history with effective_from

-- =====================================================
-- 1. Email optional (Email ID is optional in master)
-- =====================================================
ALTER TABLE salesmen ALTER COLUMN email DROP NOT NULL;

DROP INDEX IF EXISTS idx_salesmen_email;
ALTER TABLE salesmen DROP CONSTRAINT IF EXISTS salesmen_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS salesmen_email_unique_idx
  ON salesmen(email)
  WHERE email IS NOT NULL AND TRIM(email) <> '';

CREATE INDEX IF NOT EXISTS idx_salesmen_email
  ON salesmen(email)
  WHERE email IS NOT NULL;

-- =====================================================
-- 2. Auto-generated salesperson code (SP-0001)
-- =====================================================
CREATE SEQUENCE IF NOT EXISTS salesman_code_seq START 1;

ALTER TABLE salesmen
  ADD COLUMN IF NOT EXISTS salesperson_code VARCHAR(20);

-- Backfill existing rows in created_at order
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS seq
  FROM salesmen
  WHERE salesperson_code IS NULL
)
UPDATE salesmen s
SET salesperson_code = 'SP-' || LPAD(numbered.seq::text, 4, '0')
FROM numbered
WHERE s.id = numbered.id;

ALTER TABLE salesmen
  ALTER COLUMN salesperson_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS salesmen_salesperson_code_unique_idx
  ON salesmen(salesperson_code);

-- Align sequence with highest backfilled code (next nextval = max+1; empty → first code SP-0001)
DO $$
DECLARE
  max_n INTEGER;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(REGEXP_REPLACE(salesperson_code, '[^0-9]', '', 'g'), '')::INTEGER),
    0
  )
  INTO max_n
  FROM salesmen;

  IF max_n > 0 THEN
    PERFORM SETVAL('salesman_code_seq', max_n, true);
  ELSE
    PERFORM SETVAL('salesman_code_seq', 1, false);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION generate_salesman_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.salesperson_code IS NULL OR TRIM(NEW.salesperson_code) = '' THEN
    NEW.salesperson_code := 'SP-' || LPAD(NEXTVAL('salesman_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_salesmen_generate_code ON salesmen;
CREATE TRIGGER trg_salesmen_generate_code
  BEFORE INSERT ON salesmen
  FOR EACH ROW
  EXECUTE FUNCTION generate_salesman_code();

-- =====================================================
-- 3. Personal / identity / address / bank / salary columns
-- =====================================================
ALTER TABLE salesmen
  ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS date_of_joining DATE,
  ADD COLUMN IF NOT EXISTS designation VARCHAR(100),
  ADD COLUMN IF NOT EXISTS aadhar_number VARCHAR(12),
  ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10),
  ADD COLUMN IF NOT EXISTS address JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bank_details JSONB,
  ADD COLUMN IF NOT EXISTS bank_details_verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS bank_details_verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_verification_error TEXT,
  ADD COLUMN IF NOT EXISTS kyc_verification_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS salary_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS basic_salary NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS salary_effective_from DATE;

DO $$ BEGIN
  ALTER TABLE salesmen ADD CONSTRAINT salesmen_aadhar_number_check
    CHECK (aadhar_number IS NULL OR (LENGTH(aadhar_number) = 12 AND aadhar_number ~ '^[0-9]{12}$'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE salesmen ADD CONSTRAINT salesmen_pan_number_check
    CHECK (pan_number IS NULL OR (LENGTH(pan_number) = 10 AND pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE salesmen ADD CONSTRAINT salesmen_salary_type_check
    CHECK (salary_type IS NULL OR salary_type IN ('monthly'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE salesmen ADD CONSTRAINT salesmen_basic_salary_check
    CHECK (basic_salary IS NULL OR basic_salary >= 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS salesmen_aadhar_number_unique_idx
  ON salesmen(aadhar_number)
  WHERE aadhar_number IS NOT NULL AND aadhar_number <> '';

CREATE UNIQUE INDEX IF NOT EXISTS salesmen_pan_number_unique_idx
  ON salesmen(pan_number)
  WHERE pan_number IS NOT NULL AND pan_number <> '';

CREATE INDEX IF NOT EXISTS idx_salesmen_is_verified ON salesmen(is_verified);
CREATE INDEX IF NOT EXISTS idx_salesmen_date_of_joining ON salesmen(date_of_joining)
  WHERE date_of_joining IS NOT NULL;

COMMENT ON COLUMN salesmen.salesperson_code IS 'Auto-generated salesperson code (SP-0001)';
COMMENT ON COLUMN salesmen.alternate_phone IS 'Optional alternate mobile number';
COMMENT ON COLUMN salesmen.kyc_verification_details IS 'Surepass snapshots: pan, aadhaar, bank, etc.';
COMMENT ON COLUMN salesmen.is_verified IS 'True when PAN or Aadhaar KYC snapshot is present';
COMMENT ON COLUMN salesmen.salary_type IS 'Current salary type (monthly). History in salesman_salary_history.';
COMMENT ON COLUMN salesmen.basic_salary IS 'Current basic salary amount';
COMMENT ON COLUMN salesmen.salary_effective_from IS 'Effective date of current salary on the master row';

-- =====================================================
-- 4. Salary history (mirrors product_rate_history pattern)
-- =====================================================
CREATE TABLE IF NOT EXISTS salesman_salary_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  salesman_id UUID NOT NULL REFERENCES salesmen(id) ON DELETE CASCADE,
  salary_type VARCHAR(20) NOT NULL CHECK (salary_type IN ('monthly')),
  basic_salary NUMERIC(14, 2) NOT NULL CHECK (basic_salary >= 0),
  effective_from DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_salesman_salary_history_salesman_effective
  ON salesman_salary_history (salesman_id, effective_from);

CREATE INDEX IF NOT EXISTS idx_salesman_salary_history_salesman_eff
  ON salesman_salary_history (salesman_id, effective_from DESC);

COMMENT ON TABLE salesman_salary_history IS
  'Salary change history per salesman; one row per effective_from date';
COMMENT ON COLUMN salesman_salary_history.effective_from IS
  'Business date from which this salary applies';

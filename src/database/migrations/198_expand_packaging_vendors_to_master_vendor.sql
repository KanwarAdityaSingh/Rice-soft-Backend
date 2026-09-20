-- Migration: Expand packaging_vendors into Master Vendor (sales-party-like KYC + enhancements)
-- Does NOT touch the purchase vendors table.
-- Table name stays packaging_vendors so packaging.packaging_vendor_id FKs keep working.

-- =====================================================
-- STEP 1: Add master-vendor columns
-- =====================================================

ALTER TABLE packaging_vendors
  ADD COLUMN IF NOT EXISTS business_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS business_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bank_details JSONB,
  ADD COLUMN IF NOT EXISTS registration_type VARCHAR(20) NOT NULL DEFAULT 'consumer',
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS kyc_verification_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS credit_period_days INTEGER,
  ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS address_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_location_link TEXT;

-- =====================================================
-- STEP 2: Backfill from legacy columns
-- =====================================================

UPDATE packaging_vendors
SET business_name = name
WHERE business_name IS NULL OR TRIM(business_name) = '';

ALTER TABLE packaging_vendors
  ALTER COLUMN business_name SET NOT NULL;

-- Move top-level gst_number into business_details when present
UPDATE packaging_vendors
SET business_details = jsonb_set(
  COALESCE(business_details, '{}'::jsonb),
  '{gst_number}',
  to_jsonb(gst_number)
)
WHERE gst_number IS NOT NULL
  AND TRIM(gst_number) <> ''
  AND (
    business_details->>'gst_number' IS NULL
    OR TRIM(COALESCE(business_details->>'gst_number', '')) = ''
  );

-- Infer registration_type: had GST → registered, else consumer (legacy rows had no PAN flow)
UPDATE packaging_vendors
SET registration_type = CASE
  WHEN business_details->>'gst_number' IS NOT NULL
       AND TRIM(business_details->>'gst_number') <> ''
    THEN 'registered'
  ELSE 'consumer'
END
WHERE registration_type = 'consumer'
  OR registration_type IS NULL;

-- =====================================================
-- STEP 3: Constraints
-- =====================================================

DO $$ BEGIN
  ALTER TABLE packaging_vendors
    ADD CONSTRAINT packaging_vendors_registration_type_check
    CHECK (registration_type IN ('registered', 'unregistered', 'consumer'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE packaging_vendors
    ADD CONSTRAINT packaging_vendors_status_check
    CHECK (status IN ('active', 'inactive', 'blacklisted'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE packaging_vendors
    ADD CONSTRAINT packaging_vendors_credit_period_days_check
    CHECK (credit_period_days IS NULL OR credit_period_days >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE packaging_vendors
    ADD CONSTRAINT packaging_vendors_credit_limit_check
    CHECK (credit_limit IS NULL OR credit_limit >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Keep is_active aligned with status for simple filters
UPDATE packaging_vendors
SET is_active = (status = 'active');

-- =====================================================
-- STEP 4: Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_packaging_vendors_business_name
  ON packaging_vendors (business_name);

CREATE UNIQUE INDEX IF NOT EXISTS packaging_vendors_business_name_unique_ci
  ON packaging_vendors (LOWER(TRIM(business_name)));

CREATE INDEX IF NOT EXISTS idx_packaging_vendors_registration_type
  ON packaging_vendors (registration_type);

CREATE INDEX IF NOT EXISTS idx_packaging_vendors_status
  ON packaging_vendors (status);

CREATE INDEX IF NOT EXISTS idx_packaging_vendors_is_active
  ON packaging_vendors (is_active);

CREATE INDEX IF NOT EXISTS idx_packaging_vendors_is_verified
  ON packaging_vendors (is_verified);

CREATE INDEX IF NOT EXISTS idx_packaging_vendors_gst
  ON packaging_vendors ((business_details->>'gst_number'))
  WHERE business_details->>'gst_number' IS NOT NULL
    AND business_details->>'gst_number' != '';

CREATE INDEX IF NOT EXISTS idx_packaging_vendors_pan
  ON packaging_vendors ((business_details->>'pan_number'))
  WHERE business_details->>'pan_number' IS NOT NULL
    AND business_details->>'pan_number' != '';

CREATE UNIQUE INDEX IF NOT EXISTS packaging_vendors_gst_unique_idx
  ON packaging_vendors ((business_details->>'gst_number'))
  WHERE business_details->>'gst_number' IS NOT NULL
    AND TRIM(business_details->>'gst_number') != '';

CREATE UNIQUE INDEX IF NOT EXISTS packaging_vendors_pan_unique_idx
  ON packaging_vendors ((business_details->>'pan_number'))
  WHERE business_details->>'pan_number' IS NOT NULL
    AND TRIM(business_details->>'pan_number') != '';

COMMENT ON TABLE packaging_vendors IS
  'Master Vendor (packaging suppliers). Sales-party-like KYC; not the purchase vendors module.';
COMMENT ON COLUMN packaging_vendors.business_name IS 'Master Vendor Name';
COMMENT ON COLUMN packaging_vendors.name IS 'Legacy mirror of business_name (kept for older readers)';
COMMENT ON COLUMN packaging_vendors.registration_type IS
  'registered | unregistered | consumer — business type for KYC rules';
COMMENT ON COLUMN packaging_vendors.status IS
  'active | inactive | blacklisted — soft lifecycle; prefer over hard delete';
COMMENT ON COLUMN packaging_vendors.kyc_verification_details IS
  'Surepass snapshots: pan, gst_advanced, bank, email, etc. (same shape as sales_parties)';
COMMENT ON COLUMN packaging_vendors.address_locked IS
  'True after GST verification populates address; unlock only via force_address_update';

-- Keep name ↔ business_name in sync for legacy seed/SQL writers
CREATE OR REPLACE FUNCTION sync_packaging_vendor_master_name()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.business_name IS NULL OR TRIM(NEW.business_name) = '') AND NEW.name IS NOT NULL THEN
    NEW.business_name := NEW.name;
  END IF;
  IF (NEW.name IS NULL OR TRIM(NEW.name) = '') AND NEW.business_name IS NOT NULL THEN
    NEW.name := NEW.business_name;
  END IF;
  IF NEW.business_name IS NOT NULL AND TRIM(NEW.business_name) <> '' THEN
    NEW.name := NEW.business_name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_packaging_vendor_master_name ON packaging_vendors;
CREATE TRIGGER trg_sync_packaging_vendor_master_name
  BEFORE INSERT OR UPDATE ON packaging_vendors
  FOR EACH ROW
  EXECUTE FUNCTION sync_packaging_vendor_master_name();

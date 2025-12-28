-- Migration: Update packaging_vendors to use contact_persons array and Address object
-- Description: Converts contact_person, phone, email to contact_persons JSONB array and address TEXT to Address JSONB object

-- =====================================================
-- STEP 1: Add new columns
-- =====================================================

-- Add contact_persons column as JSONB
ALTER TABLE packaging_vendors ADD COLUMN IF NOT EXISTS contact_persons JSONB;

-- Add new address column as JSONB (we'll migrate data and then drop old one)
ALTER TABLE packaging_vendors ADD COLUMN IF NOT EXISTS address_new JSONB;

-- =====================================================
-- STEP 2: Migrate existing data
-- =====================================================

-- Migrate contact_person, phone, email to contact_persons array
UPDATE packaging_vendors
SET contact_persons = CASE
  WHEN contact_person IS NOT NULL AND phone IS NOT NULL THEN
    jsonb_build_array(jsonb_build_object(
      'name', contact_person,
      'phones', jsonb_build_array(phone),
      'emails', CASE 
        WHEN email IS NOT NULL THEN jsonb_build_array(email)
        ELSE '[]'::jsonb
      END
    ))
  WHEN contact_person IS NOT NULL THEN
    jsonb_build_array(jsonb_build_object(
      'name', contact_person,
      'phones', '[]'::jsonb,
      'emails', CASE 
        WHEN email IS NOT NULL THEN jsonb_build_array(email)
        ELSE '[]'::jsonb
      END
    ))
  ELSE
    '[]'::jsonb
END
WHERE contact_persons IS NULL;

-- Migrate address from TEXT to JSONB Address object
-- If address is a JSON string, parse it; otherwise create a default structure
UPDATE packaging_vendors
SET address_new = CASE
  WHEN address IS NOT NULL THEN
    -- Try to parse as JSON first
    CASE
      WHEN address::text ~ '^\{.*\}$' THEN
        -- Looks like JSON, try to parse
        CASE
          WHEN jsonb_typeof(address::jsonb) = 'object' THEN address::jsonb
          ELSE jsonb_build_object(
            'street', address,
            'city', '',
            'state', '',
            'pincode', '',
            'country', 'India'
          )
        END
      ELSE
        -- Plain text, create Address object with street set to the text
        jsonb_build_object(
          'street', address,
          'city', '',
          'state', '',
          'pincode', '',
          'country', 'India'
        )
    END
  ELSE
    -- No address, create empty Address object
    jsonb_build_object(
      'street', '',
      'city', '',
      'state', '',
      'pincode', '',
      'country', 'India'
    )
END
WHERE address_new IS NULL;

-- =====================================================
-- STEP 3: Make new columns NOT NULL (after migration)
-- =====================================================

ALTER TABLE packaging_vendors ALTER COLUMN contact_persons SET NOT NULL;
ALTER TABLE packaging_vendors ALTER COLUMN address_new SET NOT NULL;

-- =====================================================
-- STEP 4: Drop old columns
-- =====================================================

ALTER TABLE packaging_vendors DROP COLUMN IF EXISTS contact_person;
ALTER TABLE packaging_vendors DROP COLUMN IF EXISTS phone;
ALTER TABLE packaging_vendors DROP COLUMN IF EXISTS email;
ALTER TABLE packaging_vendors DROP COLUMN IF EXISTS address;

-- =====================================================
-- STEP 5: Rename new address column to address
-- =====================================================

ALTER TABLE packaging_vendors RENAME COLUMN address_new TO address;

-- =====================================================
-- STEP 6: Create indexes
-- =====================================================

-- Create GIN index for JSONB queries on contact_persons
CREATE INDEX IF NOT EXISTS idx_packaging_vendors_contact_persons ON packaging_vendors USING GIN (contact_persons);

-- Create GIN index for JSONB queries on address
CREATE INDEX IF NOT EXISTS idx_packaging_vendors_address ON packaging_vendors USING GIN (address);

-- =====================================================
-- STEP 7: Update comments
-- =====================================================

COMMENT ON COLUMN packaging_vendors.contact_persons IS 'Array of contact persons with name, phones array, and optional emails array, stored as JSONB. Format: [{"name": "John Doe", "phones": ["123", "456"], "emails": ["john@example.com"]}]';
COMMENT ON COLUMN packaging_vendors.address IS 'Address object stored as JSONB. Format: {"street": "...", "city": "...", "state": "...", "pincode": "...", "country": "..."}';


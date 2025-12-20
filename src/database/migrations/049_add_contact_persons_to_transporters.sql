-- Migration: Change transporters to use contact_persons array like vendors/brokers/leads
-- This adds contact_persons JSONB column and migrates existing data

-- 1. Add contact_persons column (with default empty array)
ALTER TABLE transporters ADD COLUMN IF NOT EXISTS contact_persons JSONB DEFAULT '[]';

-- 2. Migrate existing data from contact_person, email, phone to contact_persons
UPDATE transporters
SET contact_persons = jsonb_build_array(
  jsonb_build_object(
    'name', COALESCE(contact_person, 'Unknown'),
    'phones', CASE WHEN phone IS NOT NULL AND phone != '' THEN jsonb_build_array(phone) ELSE '[]'::jsonb END,
    'emails', CASE WHEN email IS NOT NULL AND email != '' THEN jsonb_build_array(email) ELSE '[]'::jsonb END
  )
)
WHERE contact_persons = '[]' OR contact_persons IS NULL;

-- 3. Make contact_persons NOT NULL after migration
ALTER TABLE transporters ALTER COLUMN contact_persons SET NOT NULL;

-- 4. Create GIN index for contact_persons searches
CREATE INDEX IF NOT EXISTS idx_transporters_contact_persons ON transporters USING GIN (contact_persons);

-- 5. Add comment
COMMENT ON COLUMN transporters.contact_persons IS 'Array of contact persons with name, phones[], and emails[] - matches vendor/broker/lead structure';

-- Note: We keep contact_person, email, phone columns for backward compatibility
-- They can be dropped in a future migration after frontend is updated


-- Migration: Change contact_person to contact_persons (VARCHAR to JSONB)
-- Description: Converts single contact_person field to contact_persons array stored as JSONB

-- 1. Add new column contact_persons as JSONB
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_persons JSONB;

-- 2. Migrate existing data: Convert old contact_person string to new format
-- For existing leads, create an array with one contact person (name from contact_person, phone from phone field)
UPDATE leads
SET contact_persons = CASE
  WHEN contact_person IS NOT NULL AND phone IS NOT NULL THEN
    jsonb_build_array(jsonb_build_object('name', contact_person, 'phone', phone))
  WHEN contact_person IS NOT NULL THEN
    jsonb_build_array(jsonb_build_object('name', contact_person, 'phone', ''))
  ELSE
    '[]'::jsonb
END
WHERE contact_persons IS NULL;

-- 3. Make contact_persons NOT NULL (after migration)
ALTER TABLE leads ALTER COLUMN contact_persons SET NOT NULL;

-- 4. Drop the old contact_person column (optional - we can keep it for backward compatibility)
-- ALTER TABLE leads DROP COLUMN IF EXISTS contact_person;

-- 5. Create index for JSONB queries (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_leads_contact_persons ON leads USING GIN (contact_persons);

-- 6. Update comments
COMMENT ON COLUMN leads.contact_persons IS 'Array of contact persons with name and phone, stored as JSONB';




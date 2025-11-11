-- Migration: Change contact_person to contact_persons (VARCHAR to JSONB) for brokers
-- Description: Converts single contact_person field to contact_persons array stored as JSONB

-- 1. Add new column contact_persons as JSONB
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS contact_persons JSONB;

-- 2. Migrate existing data: Convert old contact_person string to new format
-- For existing brokers, create an array with one contact person (name from contact_person, phones from phone field)
UPDATE brokers
SET contact_persons = CASE
  WHEN contact_person IS NOT NULL AND phone IS NOT NULL THEN
    jsonb_build_array(jsonb_build_object('name', contact_person, 'phones', jsonb_build_array(phone)))
  WHEN contact_person IS NOT NULL THEN
    jsonb_build_array(jsonb_build_object('name', contact_person, 'phones', jsonb_build_array()))
  ELSE
    '[]'::jsonb
END
WHERE contact_persons IS NULL;

-- 3. Make contact_persons NOT NULL (after migration)
ALTER TABLE brokers ALTER COLUMN contact_persons SET NOT NULL;

-- 4. Create index for JSONB queries (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_brokers_contact_persons ON brokers USING GIN (contact_persons);

-- 5. Update comments
COMMENT ON COLUMN brokers.contact_persons IS 'Array of contact persons with name and phones array, stored as JSONB. Format: [{"name": "John Doe", "phones": ["123", "456"]}]';


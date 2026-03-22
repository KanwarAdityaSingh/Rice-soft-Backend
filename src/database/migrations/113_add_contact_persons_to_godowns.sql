-- Godown contact persons (same shape as vendors: name, phones[], optional emails[])

ALTER TABLE godowns ADD COLUMN IF NOT EXISTS contact_persons JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE godowns
SET contact_persons = jsonb_build_array(
  jsonb_build_object(
    'name', 'Primary contact',
    'phones', jsonb_build_array(trim(contact_number))
  )
)
WHERE contact_number IS NOT NULL
  AND trim(contact_number) <> ''
  AND contact_persons = '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_godowns_contact_persons ON godowns USING GIN (contact_persons);

COMMENT ON COLUMN godowns.contact_persons IS 'Array of contact persons: [{"name": "...", "phones": ["..."], "emails": ["..."]}]';

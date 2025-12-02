-- Migration: Add emails field to contact_persons structure
-- Description: Updates schema comments to reflect new optional emails array field in ContactPerson

-- Note: The emails field is optional, so no data migration is needed.
-- The DAO layer will handle the new field automatically when reading/writing data.
-- Existing records without emails will continue to work (emails will be undefined/null).

-- Update comment for leads.contact_persons to include emails
COMMENT ON COLUMN leads.contact_persons IS 'Array of contact persons with name, phones array, and optional emails array, stored as JSONB. Format: [{"name": "John Doe", "phones": ["123", "456"], "emails": ["john@example.com"]}]';

-- Update comment for brokers.contact_persons to include emails
COMMENT ON COLUMN brokers.contact_persons IS 'Array of contact persons with name, phones array, and optional emails array, stored as JSONB. Format: [{"name": "John Doe", "phones": ["123", "456"], "emails": ["john@example.com"]}]';


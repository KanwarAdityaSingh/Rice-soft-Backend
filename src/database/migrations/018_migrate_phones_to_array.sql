-- Migration: Update contact_persons structure to support phones array
-- Description: Updates schema comment. Data migration is handled by DAO transformation layer.

-- Note: The DAO layer automatically transforms old format {name, phone} to new format {name, phones[]}
-- when reading data, so no database-level migration is needed. New inserts will use the new format.

-- Update comment to reflect new structure
COMMENT ON COLUMN leads.contact_persons IS 'Array of contact persons with name and phones array, stored as JSONB. Format: [{"name": "John Doe", "phones": ["123", "456"]}]';


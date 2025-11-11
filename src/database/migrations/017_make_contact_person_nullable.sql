-- Migration: Make contact_person nullable or drop it
-- Description: Since we've migrated to contact_persons, we need to handle the old contact_person column

-- Option 1: Make contact_person nullable (safer, allows backward compatibility)
-- ALTER TABLE leads ALTER COLUMN contact_person DROP NOT NULL;

-- Option 2: Drop the column entirely (uncomment if you want to remove it completely)
ALTER TABLE leads DROP COLUMN IF EXISTS contact_person;




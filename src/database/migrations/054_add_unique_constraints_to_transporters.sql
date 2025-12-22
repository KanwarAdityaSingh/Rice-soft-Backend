-- Migration: Add unique constraints to transporters GST, PAN, and Aadhaar numbers
-- Description: Prevent duplicate GST, PAN, and Aadhaar numbers in transporters table
-- This ensures data integrity and consistency with vendors/brokers behavior

-- IMPORTANT: This migration will identify duplicate entries but will NOT automatically delete them.
-- If duplicates exist, the migration will fail and you'll need to manually resolve them first.

-- Step 1: Identify duplicate GST numbers (for manual review)
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT gst_number, COUNT(*) as cnt
        FROM transporters
        WHERE gst_number IS NOT NULL AND gst_number != ''
        GROUP BY gst_number
        HAVING COUNT(*) > 1
    ) duplicates;
    
    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Found % duplicate GST number(s) in transporters table', duplicate_count;
        RAISE NOTICE 'Please review and manually resolve duplicates before applying unique constraints';
        RAISE NOTICE 'Query to find duplicates: SELECT gst_number, COUNT(*) FROM transporters WHERE gst_number IS NOT NULL GROUP BY gst_number HAVING COUNT(*) > 1;';
    END IF;
END $$;

-- Step 2: Identify duplicate PAN numbers (for manual review)
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT pan_number, COUNT(*) as cnt
        FROM transporters
        WHERE pan_number IS NOT NULL AND pan_number != ''
        GROUP BY pan_number
        HAVING COUNT(*) > 1
    ) duplicates;
    
    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Found % duplicate PAN number(s) in transporters table', duplicate_count;
    END IF;
END $$;

-- Step 3: Identify duplicate Aadhaar numbers (for manual review)
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT aadhar_number, COUNT(*) as cnt
        FROM transporters
        WHERE aadhar_number IS NOT NULL AND aadhar_number != ''
        GROUP BY aadhar_number
        HAVING COUNT(*) > 1
    ) duplicates;
    
    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Found % duplicate Aadhaar number(s) in transporters table', duplicate_count;
    END IF;
END $$;

-- Step 4: Create unique index for GST number (allows NULL, but enforces uniqueness for non-NULL values)
-- This will fail if duplicates exist
CREATE UNIQUE INDEX IF NOT EXISTS transporters_gst_number_unique_idx 
ON transporters(gst_number) 
WHERE gst_number IS NOT NULL AND gst_number != '';

-- Step 5: Create unique index for PAN number (allows NULL, but enforces uniqueness for non-NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS transporters_pan_number_unique_idx 
ON transporters(pan_number) 
WHERE pan_number IS NOT NULL AND pan_number != '';

-- Step 6: Create unique index for Aadhaar number (allows NULL, but enforces uniqueness for non-NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS transporters_aadhar_number_unique_idx 
ON transporters(aadhar_number) 
WHERE aadhar_number IS NOT NULL AND aadhar_number != '';

-- Step 7: Add comments for documentation
COMMENT ON INDEX transporters_gst_number_unique_idx IS 'Ensures GST numbers are unique across transporters (NULL values allowed)';
COMMENT ON INDEX transporters_pan_number_unique_idx IS 'Ensures PAN numbers are unique across transporters (NULL values allowed)';
COMMENT ON INDEX transporters_aadhar_number_unique_idx IS 'Ensures Aadhaar numbers are unique across transporters (NULL values allowed)';


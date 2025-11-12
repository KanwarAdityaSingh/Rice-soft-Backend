-- Migration: Add Google Maps location link support
-- Description: Adds google_location_link field to leads and vendors tables for storing Google Maps links/Plus Codes
-- The backend will automatically extract lat/long from these links

-- 1. Add google_location_link column to leads table (nullable, TEXT to support long URLs)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS google_location_link TEXT;

-- 2. Add google_location_link column to vendors table
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS google_location_link TEXT;

-- 3. Add comments
COMMENT ON COLUMN leads.google_location_link IS 'Google Maps link or Plus Code - coordinates will be extracted automatically';
COMMENT ON COLUMN vendors.google_location_link IS 'Google Maps link or Plus Code - coordinates will be extracted automatically';


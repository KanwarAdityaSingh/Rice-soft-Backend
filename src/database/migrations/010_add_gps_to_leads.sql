-- Migration: Add GPS location tracking to leads
-- Description: Adds salesman_latitude and salesman_longitude columns to leads table for field activity tracking

-- 1. Add salesman_latitude column (nullable)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS salesman_latitude DECIMAL(10, 8);

-- 2. Add salesman_longitude column (nullable)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS salesman_longitude DECIMAL(11, 8);

-- 3. Create indexes for location-based queries (optional but useful for route optimization)
CREATE INDEX IF NOT EXISTS idx_leads_salesman_latitude ON leads(salesman_latitude);
CREATE INDEX IF NOT EXISTS idx_leads_salesman_longitude ON leads(salesman_longitude);

-- 4. Add composite index for location queries (useful for distance calculations)
CREATE INDEX IF NOT EXISTS idx_leads_salesman_location ON leads(salesman_latitude, salesman_longitude) 
WHERE salesman_latitude IS NOT NULL AND salesman_longitude IS NOT NULL;

-- 5. Add comments
COMMENT ON COLUMN leads.salesman_latitude IS 'GPS latitude of salesman location when creating/updating lead (for field activity tracking)';
COMMENT ON COLUMN leads.salesman_longitude IS 'GPS longitude of salesman location when creating/updating lead (for field activity tracking)';


-- Add lead_id column to vendors table for direct lead-to-vendor reference

ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_vendors_lead_id ON vendors(lead_id) WHERE lead_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN vendors.lead_id IS 'ID of the lead that was converted to create this vendor';


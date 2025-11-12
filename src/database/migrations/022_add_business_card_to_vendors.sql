-- Add business_card_url column to vendors table

ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS business_card_url VARCHAR(500);

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_vendors_business_card ON vendors(business_card_url) WHERE business_card_url IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN vendors.business_card_url IS 'S3 URL of the uploaded business card image';


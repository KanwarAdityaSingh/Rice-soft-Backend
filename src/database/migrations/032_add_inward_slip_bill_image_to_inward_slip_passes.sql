-- Migration: Add inward_slip_bill_image_url to inward_slip_passes table
-- Description: Adds column to store the URL of the inward slip bill image

ALTER TABLE inward_slip_passes
ADD COLUMN IF NOT EXISTS inward_slip_bill_image_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN inward_slip_passes.inward_slip_bill_image_url IS 'URL of the uploaded inward slip bill image';


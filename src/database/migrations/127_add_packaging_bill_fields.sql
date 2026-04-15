-- Migration: Add packaging vendor bill fields to packaging
-- Description: bill_number, bill_date (user-entered), packaging_bill_url (uploaded document URL)

ALTER TABLE packaging
  ADD COLUMN IF NOT EXISTS bill_number VARCHAR(255),
  ADD COLUMN IF NOT EXISTS bill_date DATE,
  ADD COLUMN IF NOT EXISTS packaging_bill_url TEXT;

CREATE INDEX IF NOT EXISTS idx_packaging_bill_number ON packaging(bill_number) WHERE bill_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_packaging_bill_date ON packaging(bill_date) WHERE bill_date IS NOT NULL;

COMMENT ON COLUMN packaging.bill_number IS 'Vendor bill number for empty bags / packaging material';
COMMENT ON COLUMN packaging.bill_date IS 'Vendor bill date';
COMMENT ON COLUMN packaging.packaging_bill_url IS 'S3 URL of uploaded packaging bill (PDF or image)';

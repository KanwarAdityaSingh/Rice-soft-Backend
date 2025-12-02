-- Migration: Move bill fields from purchases to inward_slip_passes
-- Description: Moves transportation_bill_image_url, bill_pdf_url, bilti_image_url, bilti_pdf_url, eway_bill_number, eway_bill_url from purchases table to inward_slip_passes table

-- Add columns to inward_slip_passes table
ALTER TABLE inward_slip_passes
ADD COLUMN IF NOT EXISTS transportation_bill_image_url TEXT,
ADD COLUMN IF NOT EXISTS bill_pdf_url TEXT,
ADD COLUMN IF NOT EXISTS bilti_image_url TEXT,
ADD COLUMN IF NOT EXISTS bilti_pdf_url TEXT,
ADD COLUMN IF NOT EXISTS eway_bill_number VARCHAR(255),
ADD COLUMN IF NOT EXISTS eway_bill_url TEXT;

-- Add comments for documentation
COMMENT ON COLUMN inward_slip_passes.transportation_bill_image_url IS 'URL of the transportation bill image';
COMMENT ON COLUMN inward_slip_passes.bill_pdf_url IS 'URL of the purchase bill PDF';
COMMENT ON COLUMN inward_slip_passes.bilti_image_url IS 'URL of the bilti (delivery challan) image';
COMMENT ON COLUMN inward_slip_passes.bilti_pdf_url IS 'URL of the bilti (delivery challan) PDF';
COMMENT ON COLUMN inward_slip_passes.eway_bill_number IS 'E-way bill number';
COMMENT ON COLUMN inward_slip_passes.eway_bill_url IS 'URL of the e-way bill document';

-- Remove columns from purchases table
ALTER TABLE purchases
DROP COLUMN IF EXISTS transportation_bill_image_url,
DROP COLUMN IF EXISTS bill_pdf_url,
DROP COLUMN IF EXISTS bilti_image_url,
DROP COLUMN IF EXISTS bilti_pdf_url,
DROP COLUMN IF EXISTS eway_bill_number,
DROP COLUMN IF EXISTS eway_bill_url;


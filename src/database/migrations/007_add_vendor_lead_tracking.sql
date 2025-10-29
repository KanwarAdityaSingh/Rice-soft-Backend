-- Migration: Add vendor-lead tracking and revenue fields
-- Description: Adds revenue to leads, last_enquiry_date to vendors, and creates lead_vendor_mapping table

-- 1. Add revenue field to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS revenue DECIMAL(15,2) DEFAULT 0;

-- 2. Add last_enquiry_date to vendors table
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS last_enquiry_date TIMESTAMP WITH TIME ZONE;

-- 3. Create junction table to track which leads generated this vendor
CREATE TABLE IF NOT EXISTS lead_vendor_mapping (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    converted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    conversion_value DECIMAL(15,2),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(lead_id, vendor_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lead_vendor_mapping_vendor_id ON lead_vendor_mapping(vendor_id);
CREATE INDEX IF NOT EXISTS idx_lead_vendor_mapping_lead_id ON lead_vendor_mapping(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_vendor_mapping_converted_at ON lead_vendor_mapping(converted_at DESC);

-- Add comments
COMMENT ON COLUMN leads.revenue IS 'Actual revenue generated from this lead after conversion';
COMMENT ON COLUMN vendors.last_enquiry_date IS 'Date of the last enquiry/order made by this vendor';
COMMENT ON TABLE lead_vendor_mapping IS 'Tracks which leads were converted to this vendor';


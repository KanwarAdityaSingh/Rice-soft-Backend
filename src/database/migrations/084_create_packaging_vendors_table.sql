-- Migration: Create packaging_vendors table
-- Description: Creates packaging_vendors table with detailed vendor information

CREATE TABLE IF NOT EXISTS packaging_vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    gst_number VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_packaging_vendors_name ON packaging_vendors(name);
CREATE INDEX IF NOT EXISTS idx_packaging_vendors_gst_number ON packaging_vendors(gst_number) WHERE gst_number IS NOT NULL;

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_packaging_vendors_updated_at 
    BEFORE UPDATE ON packaging_vendors
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE packaging_vendors IS 'Stores packaging vendor information';
COMMENT ON COLUMN packaging_vendors.name IS 'Vendor company name';
COMMENT ON COLUMN packaging_vendors.contact_person IS 'Primary contact person name';
COMMENT ON COLUMN packaging_vendors.phone IS 'Contact phone number';
COMMENT ON COLUMN packaging_vendors.email IS 'Contact email address';
COMMENT ON COLUMN packaging_vendors.address IS 'Vendor address';
COMMENT ON COLUMN packaging_vendors.gst_number IS 'GST registration number';


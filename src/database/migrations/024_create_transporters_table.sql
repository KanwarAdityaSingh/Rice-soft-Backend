-- Migration: Create transporters table
-- Description: Creates transporters table for storing transporter/transport company information

-- Create transporters table
CREATE TABLE IF NOT EXISTS transporters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    address JSONB NOT NULL DEFAULT '{}',
    gst_number VARCHAR(15),
    pan_number VARCHAR(10),
    vehicle_numbers JSONB DEFAULT '[]',
    bank_details JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transporters_business_name ON transporters(business_name);
CREATE INDEX IF NOT EXISTS idx_transporters_email ON transporters(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transporters_is_active ON transporters(is_active);
CREATE INDEX IF NOT EXISTS idx_transporters_gst ON transporters(gst_number) WHERE gst_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transporters_pan ON transporters(pan_number) WHERE pan_number IS NOT NULL;

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_transporters_updated_at 
    BEFORE UPDATE ON transporters
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE transporters IS 'Stores transporter/transport company information';
COMMENT ON COLUMN transporters.business_name IS 'Name of the transport company';
COMMENT ON COLUMN transporters.address IS 'Address stored as JSONB with street, city, state, pincode, country';
COMMENT ON COLUMN transporters.vehicle_numbers IS 'Array of vehicle numbers stored as JSONB';
COMMENT ON COLUMN transporters.bank_details IS 'Bank details stored as JSONB with bank_name, ifsc_code, account_number, branch';


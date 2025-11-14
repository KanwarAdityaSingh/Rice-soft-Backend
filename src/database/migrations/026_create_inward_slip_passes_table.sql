-- Migration: Create inward_slip_passes table
-- Description: Creates inward_slip_passes table for storing inward slip documentation

-- Create inward_slip_status enum
DO $$ BEGIN
    CREATE TYPE inward_slip_status_enum AS ENUM ('pending', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create inward_slip_passes table
CREATE TABLE IF NOT EXISTS inward_slip_passes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sauda_id UUID NOT NULL REFERENCES saudas(id) ON DELETE RESTRICT,
    slip_number VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    vehicle_number VARCHAR(50) NOT NULL,
    party_name VARCHAR(255) NOT NULL,
    party_address TEXT,
    party_gst_number VARCHAR(15),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inward_slip_passes_sauda_id ON inward_slip_passes(sauda_id);
CREATE INDEX IF NOT EXISTS idx_inward_slip_passes_slip_number ON inward_slip_passes(slip_number);
CREATE INDEX IF NOT EXISTS idx_inward_slip_passes_status ON inward_slip_passes(status);
CREATE INDEX IF NOT EXISTS idx_inward_slip_passes_date ON inward_slip_passes(date);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_inward_slip_passes_updated_at 
    BEFORE UPDATE ON inward_slip_passes
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE inward_slip_passes IS 'Stores inward slip pass documentation';
COMMENT ON COLUMN inward_slip_passes.slip_number IS 'Slip number (e.g., P3236)';
COMMENT ON COLUMN inward_slip_passes.status IS 'Status of inward slip: pending, completed';


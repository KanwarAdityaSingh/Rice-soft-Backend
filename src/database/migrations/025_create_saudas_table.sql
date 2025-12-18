-- Migration: Create saudas table
-- Description: Creates saudas table for storing purchase agreements/contracts

-- Create sauda_type enum
DO $$ BEGIN
    CREATE TYPE sauda_type_enum AS ENUM ('exgodown', 'for');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create sauda_status enum
DO $$ BEGIN
    CREATE TYPE sauda_status_enum AS ENUM ('draft', 'active', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create saudas table
CREATE TABLE IF NOT EXISTS saudas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sauda_type VARCHAR(20) NOT NULL CHECK (sauda_type IN ('exgodown', 'for')),
    rice_quality VARCHAR(255) NOT NULL,
    rice_code_id UUID REFERENCES rice_codes(rice_code_id) ON DELETE SET NULL,
    rate DECIMAL(10,2) NOT NULL,
    broker_id UUID REFERENCES brokers(id) ON DELETE SET NULL,
    broker_commission DECIMAL(5,2),
    quantity DECIMAL(10,2),
    transporter_id UUID REFERENCES transporters(id) ON DELETE SET NULL,
    transportation_cost DECIMAL(10,2),
    cash_discount DECIMAL(5,2),
    estimated_delivery_time INTEGER,
    purchaser_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    cooked_rice_image_url TEXT,
    uncooked_rice_image_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_saudas_sauda_type ON saudas(sauda_type);
CREATE INDEX IF NOT EXISTS idx_saudas_status ON saudas(status);
CREATE INDEX IF NOT EXISTS idx_saudas_purchaser_id ON saudas(purchaser_id);
CREATE INDEX IF NOT EXISTS idx_saudas_broker_id ON saudas(broker_id) WHERE broker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_saudas_transporter_id ON saudas(transporter_id) WHERE transporter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_saudas_rice_code_id ON saudas(rice_code_id) WHERE rice_code_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_saudas_created_at ON saudas(created_at);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_saudas_updated_at 
    BEFORE UPDATE ON saudas
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE saudas IS 'Stores purchase agreements/contracts (saudas)';
COMMENT ON COLUMN saudas.sauda_type IS 'Type of sauda: exgodown (ex-godown/from warehouse) or for (Free on Rail/Road)';
COMMENT ON COLUMN saudas.status IS 'Status of sauda: draft, active, completed, cancelled';
COMMENT ON COLUMN saudas.transportation_cost IS 'Transportation cost - only applicable for exgodown type';
COMMENT ON COLUMN saudas.cash_discount IS 'Cash discount percentage based on estimated_delivery_time';


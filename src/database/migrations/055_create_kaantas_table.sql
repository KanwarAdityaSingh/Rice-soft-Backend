-- Migration: Create kaantas table
-- Description: Creates kaantas table for storing weighbridge measurements and removes weight fields from inward_slip_passes

-- Create bag_type enum
DO $$ BEGIN
    CREATE TYPE bag_type_enum AS ENUM ('jute', 'pp');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create kaantas table
CREATE TABLE IF NOT EXISTS kaantas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kaanta_id VARCHAR(255) NOT NULL UNIQUE,
    sauda_id UUID NOT NULL REFERENCES saudas(id) ON DELETE RESTRICT,
    inward_slip_pass_id UUID NOT NULL REFERENCES inward_slip_passes(id) ON DELETE CASCADE,
    full_truck_weight DECIMAL(10,2) NOT NULL,
    empty_truck_weight DECIMAL(10,2) NOT NULL,
    kaanta_weight DECIMAL(10,2),
    bag_weight DECIMAL(10,2) NOT NULL,
    no_of_bags INTEGER NOT NULL CHECK (no_of_bags > 0),
    bag_type VARCHAR(20) NOT NULL CHECK (bag_type IN ('jute', 'pp')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_kaantas_sauda_id ON kaantas(sauda_id);
CREATE INDEX IF NOT EXISTS idx_kaantas_inward_slip_pass_id ON kaantas(inward_slip_pass_id);
CREATE INDEX IF NOT EXISTS idx_kaantas_kaanta_id ON kaantas(kaanta_id);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_kaantas_updated_at 
    BEFORE UPDATE ON kaantas
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger to auto-calculate kaanta_weight
CREATE OR REPLACE FUNCTION calculate_kaanta_weight()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate kaanta_weight = full_truck_weight - empty_truck_weight
    IF NEW.full_truck_weight IS NOT NULL AND NEW.empty_truck_weight IS NOT NULL THEN
        NEW.kaanta_weight := NEW.full_truck_weight - NEW.empty_truck_weight;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_kaanta_weight_trigger
    BEFORE INSERT OR UPDATE ON kaantas
    FOR EACH ROW
    EXECUTE FUNCTION calculate_kaanta_weight();

-- Create function to generate kaanta_id
CREATE OR REPLACE FUNCTION generate_kaanta_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.kaanta_id IS NULL OR NEW.kaanta_id = '' THEN
        NEW.kaanta_id := 'KAANTA-' || REPLACE(NEW.id::text, '-', '');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_kaanta_id_trigger
    BEFORE INSERT ON kaantas
    FOR EACH ROW
    EXECUTE FUNCTION generate_kaanta_id();

-- Remove weight fields from inward_slip_passes table
ALTER TABLE inward_slip_passes DROP COLUMN IF EXISTS full_truck_weight;
ALTER TABLE inward_slip_passes DROP COLUMN IF EXISTS empty_truck_weight;
ALTER TABLE inward_slip_passes DROP COLUMN IF EXISTS kaanta_weight;

-- Add comments for documentation
COMMENT ON TABLE kaantas IS 'Stores weighbridge measurements for saudas within inward slip passes';
COMMENT ON COLUMN kaantas.kaanta_id IS 'Auto-generated unique identifier in format KAANTA-{uuid}';
COMMENT ON COLUMN kaantas.kaanta_weight IS 'Calculated: full_truck_weight - empty_truck_weight';
COMMENT ON COLUMN kaantas.bag_type IS 'Type of bags used: jute or pp (polypropylene)';


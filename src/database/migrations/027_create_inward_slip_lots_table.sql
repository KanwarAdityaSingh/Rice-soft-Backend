-- Migration: Create inward_slip_lots table
-- Description: Creates inward_slip_lots table for storing individual lots within inward slip passes

-- Create inward_slip_lots table
CREATE TABLE IF NOT EXISTS inward_slip_lots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inward_slip_pass_id UUID NOT NULL REFERENCES inward_slip_passes(id) ON DELETE CASCADE,
    lot_number VARCHAR(255) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    no_of_bags INTEGER NOT NULL,
    bag_weight DECIMAL(10,2),
    total_weight DECIMAL(10,2),
    bill_weight DECIMAL(10,2) NOT NULL,
    received_weight DECIMAL(10,2) NOT NULL,
    bardana VARCHAR(100),
    rate DECIMAL(10,2) NOT NULL,
    amount DECIMAL(15,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inward_slip_lots_inward_slip_pass_id ON inward_slip_lots(inward_slip_pass_id);
CREATE INDEX IF NOT EXISTS idx_inward_slip_lots_lot_number ON inward_slip_lots(lot_number);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_inward_slip_lots_updated_at 
    BEFORE UPDATE ON inward_slip_lots
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger to calculate total_weight and amount
CREATE OR REPLACE FUNCTION calculate_inward_slip_lot_values()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate total_weight = no_of_bags * bag_weight (if bag_weight is provided)
    IF NEW.bag_weight IS NOT NULL AND NEW.no_of_bags IS NOT NULL THEN
        NEW.total_weight := NEW.no_of_bags * NEW.bag_weight;
    END IF;
    
    -- Calculate amount = received_weight * rate
    IF NEW.received_weight IS NOT NULL AND NEW.rate IS NOT NULL THEN
        NEW.amount := NEW.received_weight * NEW.rate;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_inward_slip_lot_trigger
    BEFORE INSERT OR UPDATE ON inward_slip_lots
    FOR EACH ROW
    EXECUTE FUNCTION calculate_inward_slip_lot_values();

-- Add comments for documentation
COMMENT ON TABLE inward_slip_lots IS 'Stores individual lots within inward slip passes';
COMMENT ON COLUMN inward_slip_lots.total_weight IS 'Calculated: no_of_bags * bag_weight';
COMMENT ON COLUMN inward_slip_lots.amount IS 'Calculated: received_weight * rate';


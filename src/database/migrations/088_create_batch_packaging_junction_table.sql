-- Migration: Create batch_packaging junction table
-- Description: Creates many-to-many relationship between batches and packaging for stage 3 workflow

CREATE TABLE IF NOT EXISTS batch_packaging (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    packaging_id UUID NOT NULL REFERENCES packaging(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2) NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(batch_id, packaging_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_batch_packaging_batch_id ON batch_packaging(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_packaging_product_id ON batch_packaging(product_id);
CREATE INDEX IF NOT EXISTS idx_batch_packaging_packaging_id ON batch_packaging(packaging_id);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_batch_packaging_updated_at 
    BEFORE UPDATE ON batch_packaging
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add check constraint: packaging.product_id must match batch_packaging.product_id
-- This ensures packaging belongs to the product specified
CREATE OR REPLACE FUNCTION check_batch_packaging_product_match()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM packaging 
        WHERE id = NEW.packaging_id 
        AND product_id = NEW.product_id
    ) THEN
        RAISE EXCEPTION 'Packaging product_id (%) does not match specified product_id (%)', 
            (SELECT product_id FROM packaging WHERE id = NEW.packaging_id),
            NEW.product_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_batch_packaging_product_match_trigger
    BEFORE INSERT OR UPDATE ON batch_packaging
    FOR EACH ROW
    EXECUTE FUNCTION check_batch_packaging_product_match();

-- Add comments
COMMENT ON TABLE batch_packaging IS 'Junction table for many-to-many relationship between batches and packaging (stage 3)';
COMMENT ON COLUMN batch_packaging.batch_id IS 'Reference to batch';
COMMENT ON COLUMN batch_packaging.product_id IS 'Reference to product (for clarity and validation)';
COMMENT ON COLUMN batch_packaging.packaging_id IS 'Reference to packaging used in batch';
COMMENT ON COLUMN batch_packaging.quantity IS 'Quantity in kg of this packaging used in batch';


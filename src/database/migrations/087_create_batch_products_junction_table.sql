-- Migration: Create batch_products junction table
-- Description: Creates many-to-many relationship between batches and products for stage 2 workflow

CREATE TABLE IF NOT EXISTS batch_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(batch_id, product_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_batch_products_batch_id ON batch_products(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_products_product_id ON batch_products(product_id);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_batch_products_updated_at 
    BEFORE UPDATE ON batch_products
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE batch_products IS 'Junction table for many-to-many relationship between batches and products (stage 2)';
COMMENT ON COLUMN batch_products.batch_id IS 'Reference to batch';
COMMENT ON COLUMN batch_products.product_id IS 'Reference to product attached to batch';


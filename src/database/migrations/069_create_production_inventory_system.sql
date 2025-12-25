-- Migration: Create production inventory system
-- Description: Creates recipes, products, packaging, batches, and inventory tracking tables

-- =====================================================
-- STEP 1: Create recipes table
-- =====================================================

CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_name VARCHAR(255) NOT NULL UNIQUE,
    formula JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create index on recipe_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_recipes_recipe_name ON recipes(recipe_name);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_recipes_updated_at 
    BEFORE UPDATE ON recipes
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE recipes IS 'Stores recipe formulas that define how lots are mixed to create products';
COMMENT ON COLUMN recipes.formula IS 'JSONB array of {lot_id: UUID, percentage: DECIMAL(5,2)} where percentages sum to 100';

-- =====================================================
-- STEP 2: Create products table
-- =====================================================

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    brand VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create index on name for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_products_updated_at 
    BEFORE UPDATE ON products
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE products IS 'Stores product information that will be sold by the brand';

-- =====================================================
-- STEP 3: Create product_recipes junction table (many-to-many)
-- =====================================================

CREATE TABLE IF NOT EXISTS product_recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(product_id, recipe_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_recipes_product_id ON product_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_recipe_id ON product_recipes(recipe_id);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_product_recipes_updated_at 
    BEFORE UPDATE ON product_recipes
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE product_recipes IS 'Junction table for many-to-many relationship between products and recipes';

-- =====================================================
-- STEP 4: Create packaging table
-- =====================================================

CREATE TABLE IF NOT EXISTS packaging (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    holding_capacity DECIMAL(10,2) NOT NULL CHECK (holding_capacity > 0),
    packet_type VARCHAR(255) NOT NULL,
    source VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(holding_capacity, packet_type)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_packaging_holding_capacity ON packaging(holding_capacity);
CREATE INDEX IF NOT EXISTS idx_packaging_packet_type ON packaging(packet_type);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_packaging_updated_at 
    BEFORE UPDATE ON packaging
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE packaging IS 'Stores packaging specifications (source of truth for packet inventory aggregation)';
COMMENT ON COLUMN packaging.holding_capacity IS 'Weight capacity in kg per packet';

-- =====================================================
-- STEP 5: Create batches table
-- =====================================================

-- Create batch_status enum
DO $$ BEGIN
    CREATE TYPE batch_status_enum AS ENUM ('planned', 'in_progress', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_number VARCHAR(255) NOT NULL UNIQUE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
    packaging_id UUID NOT NULL REFERENCES packaging(id) ON DELETE RESTRICT,
    quantity DECIMAL(10,2) NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_batches_batch_number ON batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_batches_product_id ON batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_recipe_id ON batches(recipe_id);
CREATE INDEX IF NOT EXISTS idx_batches_packaging_id ON batches(packaging_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_batches_updated_at 
    BEFORE UPDATE ON batches
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to generate batch_number
CREATE OR REPLACE FUNCTION generate_batch_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.batch_number IS NULL OR NEW.batch_number = '' THEN
        NEW.batch_number := 'BATCH-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || SUBSTRING(REPLACE(NEW.id::text, '-', ''), 1, 8);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_batch_number_trigger
    BEFORE INSERT ON batches
    FOR EACH ROW
    EXECUTE FUNCTION generate_batch_number();

-- Add comments
COMMENT ON TABLE batches IS 'Stores batch execution records that apply recipe formulas to create products';
COMMENT ON COLUMN batches.quantity IS 'Total quantity in kg to produce in this batch';

-- =====================================================
-- STEP 6: Create batch_lot_usage table (lot-level tracking)
-- =====================================================

CREATE TABLE IF NOT EXISTS batch_lot_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    lot_id UUID NOT NULL REFERENCES inward_slip_lots(id) ON DELETE RESTRICT,
    quantity_used DECIMAL(10,2) NOT NULL CHECK (quantity_used >= 0),
    percentage_used DECIMAL(5,2) NOT NULL CHECK (percentage_used >= 0 AND percentage_used <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_batch_lot_usage_batch_id ON batch_lot_usage(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_lot_usage_lot_id ON batch_lot_usage(lot_id);
CREATE INDEX IF NOT EXISTS idx_batch_lot_usage_batch_lot ON batch_lot_usage(batch_id, lot_id);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_batch_lot_usage_updated_at 
    BEFORE UPDATE ON batch_lot_usage
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE batch_lot_usage IS 'Tracks which specific lots were used in each batch and how much quantity';

-- =====================================================
-- STEP 7: Create batch_rice_code_usage table (rice_code-level tracking)
-- =====================================================

CREATE TABLE IF NOT EXISTS batch_rice_code_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    rice_code_id UUID NOT NULL REFERENCES rice_codes(rice_code_id) ON DELETE RESTRICT,
    rice_type rice_type_enum,
    total_quantity_used DECIMAL(10,2) NOT NULL CHECK (total_quantity_used >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(batch_id, rice_code_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_batch_rice_code_usage_batch_id ON batch_rice_code_usage(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_rice_code_usage_rice_code_id ON batch_rice_code_usage(rice_code_id);
CREATE INDEX IF NOT EXISTS idx_batch_rice_code_usage_rice_type ON batch_rice_code_usage(rice_type) WHERE rice_type IS NOT NULL;

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_batch_rice_code_usage_updated_at 
    BEFORE UPDATE ON batch_rice_code_usage
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE batch_rice_code_usage IS 'Aggregate tracking of rice_code usage per batch (summarizes lot-level usage)';

-- =====================================================
-- STEP 8: Create finished_goods_inventory table
-- =====================================================

CREATE TABLE IF NOT EXISTS finished_goods_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
    packaging_id UUID NOT NULL REFERENCES packaging(id) ON DELETE RESTRICT,
    no_of_packets INTEGER NOT NULL CHECK (no_of_packets > 0),
    total_weight DECIMAL(10,2) NOT NULL CHECK (total_weight > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_finished_goods_product_id ON finished_goods_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_finished_goods_batch_id ON finished_goods_inventory(batch_id);
CREATE INDEX IF NOT EXISTS idx_finished_goods_product_batch ON finished_goods_inventory(product_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_finished_goods_packaging_id ON finished_goods_inventory(packaging_id);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_finished_goods_inventory_updated_at 
    BEFORE UPDATE ON finished_goods_inventory
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE finished_goods_inventory IS 'Tracks finished goods inventory: number of packets of each product from each batch';

-- =====================================================
-- STEP 9: Create packets_inventory table
-- =====================================================

CREATE TABLE IF NOT EXISTS packets_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    packaging_id UUID NOT NULL REFERENCES packaging(id) ON DELETE RESTRICT UNIQUE,
    available_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_packets_inventory_packaging_id ON packets_inventory(packaging_id);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_packets_inventory_updated_at 
    BEFORE UPDATE ON packets_inventory
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE packets_inventory IS 'Tracks available empty packets by packaging type (source of truth: holding_capacity + packet_type)';

-- =====================================================
-- STEP 10: Create lot_inventory table
-- =====================================================

CREATE TABLE IF NOT EXISTS lot_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lot_id UUID NOT NULL REFERENCES inward_slip_lots(id) ON DELETE CASCADE UNIQUE,
    available_quantity DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_lot_inventory_lot_id ON lot_inventory(lot_id);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_lot_inventory_updated_at 
    BEFORE UPDATE ON lot_inventory
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE lot_inventory IS 'Tracks remaining quantity in each lot (separate from inward_slip_lots to avoid modifying purchase flow)';

-- =====================================================
-- STEP 11: Create bags_inventory table
-- =====================================================

-- Ensure bag_type_enum exists (should already exist from migration 055)
DO $$ BEGIN
    CREATE TYPE bag_type_enum AS ENUM ('jute', 'pp');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS bags_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bag_type VARCHAR(20) NOT NULL CHECK (bag_type IN ('jute', 'pp')),
    bag_capacity DECIMAL(10,2) NOT NULL CHECK (bag_capacity > 0),
    filled_bags INTEGER NOT NULL DEFAULT 0 CHECK (filled_bags >= 0),
    empty_bags INTEGER NOT NULL DEFAULT 0 CHECK (empty_bags >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(bag_type, bag_capacity)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bags_inventory_bag_type ON bags_inventory(bag_type);
CREATE INDEX IF NOT EXISTS idx_bags_inventory_bag_capacity ON bags_inventory(bag_capacity);
CREATE INDEX IF NOT EXISTS idx_bags_inventory_type_capacity ON bags_inventory(bag_type, bag_capacity);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_bags_inventory_updated_at 
    BEFORE UPDATE ON bags_inventory
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE bags_inventory IS 'Tracks filled and empty bags by type and capacity (source of truth: bag_type + bag_capacity)';
COMMENT ON COLUMN bags_inventory.bag_capacity IS 'Weight capacity in kg per bag (from kaanta.bag_weight)';

-- =====================================================
-- STEP 12: Create trigger to initialize lot_inventory from inward_slip_lots
-- =====================================================

CREATE OR REPLACE FUNCTION initialize_lot_inventory()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert lot inventory record when a lot is created
    INSERT INTO lot_inventory (lot_id, available_quantity, created_by)
    VALUES (NEW.id, NEW.received_weight, NEW.created_by)
    ON CONFLICT (lot_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER initialize_lot_inventory_trigger
    AFTER INSERT ON inward_slip_lots
    FOR EACH ROW
    EXECUTE FUNCTION initialize_lot_inventory();

-- =====================================================
-- STEP 13: Create trigger to update bags_inventory when kaanta is created
-- =====================================================

CREATE OR REPLACE FUNCTION update_bags_inventory_on_kaanta_create()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert or update bags inventory when kaanta is created
    -- Increase filled_bags by no_of_bags
    INSERT INTO bags_inventory (bag_type, bag_capacity, filled_bags, created_by)
    VALUES (NEW.bag_type, NEW.bag_weight, NEW.no_of_bags, NEW.created_by)
    ON CONFLICT (bag_type, bag_capacity)
    DO UPDATE SET
        filled_bags = bags_inventory.filled_bags + NEW.no_of_bags,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = NEW.created_by;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bags_inventory_on_kaanta_create_trigger
    AFTER INSERT ON kaantas
    FOR EACH ROW
    EXECUTE FUNCTION update_bags_inventory_on_kaanta_create();

-- =====================================================
-- STEP 14: Migrate existing lot data to lot_inventory
-- =====================================================

-- Initialize lot_inventory for existing lots
INSERT INTO lot_inventory (lot_id, available_quantity)
SELECT id, received_weight
FROM inward_slip_lots
WHERE id NOT IN (SELECT lot_id FROM lot_inventory WHERE lot_id IS NOT NULL)
ON CONFLICT (lot_id) DO NOTHING;

-- =====================================================
-- STEP 15: Migrate existing kaanta data to bags_inventory
-- =====================================================

-- Initialize bags_inventory for existing kaantas
INSERT INTO bags_inventory (bag_type, bag_capacity, filled_bags)
SELECT bag_type, bag_weight, SUM(no_of_bags)
FROM kaantas
GROUP BY bag_type, bag_weight
ON CONFLICT (bag_type, bag_capacity)
DO UPDATE SET
    filled_bags = EXCLUDED.filled_bags;


-- Migration: Add godowns module and godown-aware inventory segmentation

-- =====================================================
-- STEP 1: Godowns master
-- =====================================================
CREATE TABLE IF NOT EXISTS godowns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    godown_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    gst_number VARCHAR(15),
    address JSONB NOT NULL DEFAULT '{}'::jsonb,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    contact_number VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_godowns_name ON godowns(name);
CREATE INDEX IF NOT EXISTS idx_godowns_is_active ON godowns(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_godowns_gst_number_unique
ON godowns(gst_number) WHERE gst_number IS NOT NULL AND gst_number <> '';

CREATE TRIGGER update_godowns_updated_at
    BEFORE UPDATE ON godowns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

INSERT INTO godowns (godown_code, name, address)
SELECT 'MAIN', 'Main Godown', '{"street":"","city":"","state":"","pincode":"","country":"India"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM godowns WHERE godown_code = 'MAIN');

-- =====================================================
-- STEP 2: Add godown_id to operational tables
-- =====================================================
ALTER TABLE sales_saudas ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;
ALTER TABLE invoice_dispatches ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;
ALTER TABLE finished_goods_inventory ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;
ALTER TABLE packets_inventory ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;
ALTER TABLE lot_inventory ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;
ALTER TABLE bags_inventory ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;
ALTER TABLE inventory_ledger ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;

ALTER TABLE saudas ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;
ALTER TABLE inward_slip_passes ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;
ALTER TABLE inward_slip_lots ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;
ALTER TABLE kaantas ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;

-- =====================================================
-- STEP 3: Backfill existing rows with MAIN godown
-- =====================================================
UPDATE sales_saudas SET godown_id = (SELECT id FROM godowns WHERE godown_code = 'MAIN') WHERE godown_id IS NULL;
UPDATE invoice_dispatches SET godown_id = (SELECT id FROM godowns WHERE godown_code = 'MAIN') WHERE godown_id IS NULL;
UPDATE finished_goods_inventory SET godown_id = (SELECT id FROM godowns WHERE godown_code = 'MAIN') WHERE godown_id IS NULL;
UPDATE packets_inventory SET godown_id = (SELECT id FROM godowns WHERE godown_code = 'MAIN') WHERE godown_id IS NULL;
UPDATE lot_inventory SET godown_id = (SELECT id FROM godowns WHERE godown_code = 'MAIN') WHERE godown_id IS NULL;
UPDATE bags_inventory SET godown_id = (SELECT id FROM godowns WHERE godown_code = 'MAIN') WHERE godown_id IS NULL;
UPDATE inventory_ledger SET godown_id = (SELECT id FROM godowns WHERE godown_code = 'MAIN') WHERE godown_id IS NULL;

UPDATE saudas SET godown_id = (SELECT id FROM godowns WHERE godown_code = 'MAIN') WHERE godown_id IS NULL;
UPDATE inward_slip_passes SET godown_id = (SELECT id FROM godowns WHERE godown_code = 'MAIN') WHERE godown_id IS NULL;
UPDATE inward_slip_lots SET godown_id = (SELECT id FROM godowns WHERE godown_code = 'MAIN') WHERE godown_id IS NULL;
UPDATE kaantas SET godown_id = (SELECT id FROM godowns WHERE godown_code = 'MAIN') WHERE godown_id IS NULL;
UPDATE batches SET godown_id = (SELECT id FROM godowns WHERE godown_code = 'MAIN') WHERE godown_id IS NULL;

-- =====================================================
-- STEP 4: Enforce non-null in core stock/sales tables
-- =====================================================
ALTER TABLE sales_saudas ALTER COLUMN godown_id SET NOT NULL;
ALTER TABLE invoice_dispatches ALTER COLUMN godown_id SET NOT NULL;
ALTER TABLE finished_goods_inventory ALTER COLUMN godown_id SET NOT NULL;
ALTER TABLE packets_inventory ALTER COLUMN godown_id SET NOT NULL;
ALTER TABLE lot_inventory ALTER COLUMN godown_id SET NOT NULL;
ALTER TABLE bags_inventory ALTER COLUMN godown_id SET NOT NULL;
ALTER TABLE inventory_ledger ALTER COLUMN godown_id SET NOT NULL;
ALTER TABLE saudas ALTER COLUMN godown_id SET NOT NULL;
ALTER TABLE inward_slip_passes ALTER COLUMN godown_id SET NOT NULL;
ALTER TABLE inward_slip_lots ALTER COLUMN godown_id SET NOT NULL;
ALTER TABLE kaantas ALTER COLUMN godown_id SET NOT NULL;
ALTER TABLE batches ALTER COLUMN godown_id SET NOT NULL;

-- =====================================================
-- STEP 5: Rework inventory uniqueness/indexes with godown dimension
-- =====================================================
ALTER TABLE packets_inventory DROP CONSTRAINT IF EXISTS packets_inventory_packaging_id_key;
DROP INDEX IF EXISTS idx_packets_inventory_packaging_id;
CREATE INDEX IF NOT EXISTS idx_packets_inventory_godown_packaging ON packets_inventory(godown_id, packaging_id);
ALTER TABLE packets_inventory ADD CONSTRAINT packets_inventory_godown_packaging_unique UNIQUE (godown_id, packaging_id);

ALTER TABLE bags_inventory DROP CONSTRAINT IF EXISTS bags_inventory_bag_type_bag_capacity_key;
DROP INDEX IF EXISTS idx_bags_inventory_type_capacity;
CREATE INDEX IF NOT EXISTS idx_bags_inventory_godown_type_capacity ON bags_inventory(godown_id, bag_type, bag_capacity);
ALTER TABLE bags_inventory ADD CONSTRAINT bags_inventory_godown_type_capacity_unique UNIQUE (godown_id, bag_type, bag_capacity);

CREATE INDEX IF NOT EXISTS idx_finished_goods_godown_product_packaging_created
ON finished_goods_inventory(godown_id, product_id, packaging_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lot_inventory_godown_lot ON lot_inventory(godown_id, lot_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_godown_product_created ON inventory_ledger(godown_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_saudas_godown_id ON sales_saudas(godown_id);
CREATE INDEX IF NOT EXISTS idx_invoice_dispatches_godown_id ON invoice_dispatches(godown_id);

-- =====================================================
-- STEP 6: Align existing trigger functions to new godown dimension
-- =====================================================
CREATE OR REPLACE FUNCTION initialize_lot_inventory()
RETURNS TRIGGER AS $$
DECLARE
    v_default_godown UUID;
BEGIN
    SELECT id INTO v_default_godown FROM godowns WHERE godown_code = 'MAIN' LIMIT 1;

    INSERT INTO lot_inventory (lot_id, godown_id, available_quantity, created_by)
    VALUES (NEW.id, COALESCE(NEW.godown_id, v_default_godown), NEW.received_weight, NEW.created_by)
    ON CONFLICT (lot_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_bags_inventory_on_kaanta_create()
RETURNS TRIGGER AS $$
DECLARE
    v_default_godown UUID;
BEGIN
    SELECT id INTO v_default_godown FROM godowns WHERE godown_code = 'MAIN' LIMIT 1;

    INSERT INTO bags_inventory (godown_id, bag_type, bag_capacity, filled_bags, created_by)
    VALUES (COALESCE(NEW.godown_id, v_default_godown), NEW.bag_type, NEW.bag_weight, NEW.no_of_bags, NEW.created_by)
    ON CONFLICT (godown_id, bag_type, bag_capacity)
    DO UPDATE SET
        filled_bags = bags_inventory.filled_bags + NEW.no_of_bags,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = NEW.created_by;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

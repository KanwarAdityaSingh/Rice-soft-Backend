-- Migration: Create inventory audit tables
-- Description: Creates audit tables for tracking all inventory additions and removals
-- with reasons based on business logic

-- =====================================================
-- STEP 1: Create operation_type enum for inventory changes
-- =====================================================

DO $$ BEGIN
    CREATE TYPE inventory_operation_type AS ENUM ('addition', 'reduction', 'adjustment');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- STEP 2: Create lot_inventory_audit table
-- =====================================================

CREATE TABLE IF NOT EXISTS lot_inventory_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lot_inventory_id UUID REFERENCES lot_inventory(id) ON DELETE SET NULL,
    lot_id UUID NOT NULL REFERENCES inward_slip_lots(id) ON DELETE CASCADE,
    operation_type VARCHAR(20) NOT NULL CHECK (operation_type IN ('addition', 'reduction', 'adjustment')),
    quantity_change DECIMAL(10,2) NOT NULL,
    quantity_before DECIMAL(10,2) NOT NULL,
    quantity_after DECIMAL(10,2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    batch_number VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for lot_inventory_audit
CREATE INDEX IF NOT EXISTS idx_lot_inventory_audit_lot_inventory_id ON lot_inventory_audit(lot_inventory_id);
CREATE INDEX IF NOT EXISTS idx_lot_inventory_audit_lot_id ON lot_inventory_audit(lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_inventory_audit_batch_id ON lot_inventory_audit(batch_id);
CREATE INDEX IF NOT EXISTS idx_lot_inventory_audit_operation_type ON lot_inventory_audit(operation_type);
CREATE INDEX IF NOT EXISTS idx_lot_inventory_audit_created_at ON lot_inventory_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lot_inventory_audit_reference ON lot_inventory_audit(reference_type, reference_id);

-- Add comments
COMMENT ON TABLE lot_inventory_audit IS 'Audit log for all lot inventory changes - tracks additions when lots are created, reductions when batches consume lots';
COMMENT ON COLUMN lot_inventory_audit.operation_type IS 'Type of operation: addition (lot created/stock added), reduction (batch consumed), adjustment (manual correction)';
COMMENT ON COLUMN lot_inventory_audit.reason IS 'Human-readable reason for the change based on business logic';
COMMENT ON COLUMN lot_inventory_audit.reference_type IS 'Type of entity that triggered this change (e.g., inward_slip_lot, batch)';
COMMENT ON COLUMN lot_inventory_audit.reference_id IS 'ID of the entity that triggered this change';

-- =====================================================
-- STEP 3: Create packets_inventory_audit table
-- =====================================================

CREATE TABLE IF NOT EXISTS packets_inventory_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    packets_inventory_id UUID REFERENCES packets_inventory(id) ON DELETE SET NULL,
    packaging_id UUID NOT NULL REFERENCES packaging(id) ON DELETE CASCADE,
    operation_type VARCHAR(20) NOT NULL CHECK (operation_type IN ('addition', 'reduction', 'adjustment')),
    quantity_change INTEGER NOT NULL,
    quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    reason VARCHAR(255) NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    batch_number VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for packets_inventory_audit
CREATE INDEX IF NOT EXISTS idx_packets_inventory_audit_packets_inventory_id ON packets_inventory_audit(packets_inventory_id);
CREATE INDEX IF NOT EXISTS idx_packets_inventory_audit_packaging_id ON packets_inventory_audit(packaging_id);
CREATE INDEX IF NOT EXISTS idx_packets_inventory_audit_batch_id ON packets_inventory_audit(batch_id);
CREATE INDEX IF NOT EXISTS idx_packets_inventory_audit_operation_type ON packets_inventory_audit(operation_type);
CREATE INDEX IF NOT EXISTS idx_packets_inventory_audit_created_at ON packets_inventory_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_packets_inventory_audit_reference ON packets_inventory_audit(reference_type, reference_id);

-- Add comments
COMMENT ON TABLE packets_inventory_audit IS 'Audit log for all packets inventory changes - tracks additions when empty packets are stocked, reductions when batches consume packets';
COMMENT ON COLUMN packets_inventory_audit.operation_type IS 'Type of operation: addition (packets stocked), reduction (batch consumed), adjustment (manual correction)';
COMMENT ON COLUMN packets_inventory_audit.reason IS 'Human-readable reason for the change based on business logic';

-- =====================================================
-- STEP 4: Create bags_inventory_audit table
-- =====================================================

CREATE TABLE IF NOT EXISTS bags_inventory_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bags_inventory_id UUID REFERENCES bags_inventory(id) ON DELETE SET NULL,
    bag_type VARCHAR(20) NOT NULL CHECK (bag_type IN ('jute', 'pp')),
    bag_capacity DECIMAL(10,2) NOT NULL,
    operation_type VARCHAR(20) NOT NULL CHECK (operation_type IN ('addition', 'reduction', 'adjustment')),
    field_changed VARCHAR(20) NOT NULL CHECK (field_changed IN ('filled_bags', 'empty_bags')),
    quantity_change INTEGER NOT NULL,
    quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    reason VARCHAR(255) NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    batch_number VARCHAR(255),
    kaanta_id UUID,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for bags_inventory_audit
CREATE INDEX IF NOT EXISTS idx_bags_inventory_audit_bags_inventory_id ON bags_inventory_audit(bags_inventory_id);
CREATE INDEX IF NOT EXISTS idx_bags_inventory_audit_bag_type_capacity ON bags_inventory_audit(bag_type, bag_capacity);
CREATE INDEX IF NOT EXISTS idx_bags_inventory_audit_batch_id ON bags_inventory_audit(batch_id);
CREATE INDEX IF NOT EXISTS idx_bags_inventory_audit_kaanta_id ON bags_inventory_audit(kaanta_id);
CREATE INDEX IF NOT EXISTS idx_bags_inventory_audit_operation_type ON bags_inventory_audit(operation_type);
CREATE INDEX IF NOT EXISTS idx_bags_inventory_audit_field_changed ON bags_inventory_audit(field_changed);
CREATE INDEX IF NOT EXISTS idx_bags_inventory_audit_created_at ON bags_inventory_audit(created_at DESC);

-- Add comments
COMMENT ON TABLE bags_inventory_audit IS 'Audit log for bags inventory changes - tracks filled bags from kaanta, bag emptying during batch production';
COMMENT ON COLUMN bags_inventory_audit.field_changed IS 'Which field was changed: filled_bags or empty_bags';
COMMENT ON COLUMN bags_inventory_audit.reason IS 'Human-readable reason based on business logic';

-- =====================================================
-- STEP 5: Create finished_goods_inventory_audit table
-- =====================================================

CREATE TABLE IF NOT EXISTS finished_goods_inventory_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    finished_goods_inventory_id UUID REFERENCES finished_goods_inventory(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    batch_number VARCHAR(255),
    packaging_id UUID REFERENCES packaging(id) ON DELETE SET NULL,
    operation_type VARCHAR(20) NOT NULL CHECK (operation_type IN ('addition', 'reduction', 'adjustment')),
    packets_change INTEGER NOT NULL,
    packets_before INTEGER NOT NULL,
    packets_after INTEGER NOT NULL,
    weight_change DECIMAL(10,2) NOT NULL,
    weight_before DECIMAL(10,2) NOT NULL,
    weight_after DECIMAL(10,2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for finished_goods_inventory_audit
CREATE INDEX IF NOT EXISTS idx_fg_inventory_audit_fg_inventory_id ON finished_goods_inventory_audit(finished_goods_inventory_id);
CREATE INDEX IF NOT EXISTS idx_fg_inventory_audit_product_id ON finished_goods_inventory_audit(product_id);
CREATE INDEX IF NOT EXISTS idx_fg_inventory_audit_batch_id ON finished_goods_inventory_audit(batch_id);
CREATE INDEX IF NOT EXISTS idx_fg_inventory_audit_operation_type ON finished_goods_inventory_audit(operation_type);
CREATE INDEX IF NOT EXISTS idx_fg_inventory_audit_created_at ON finished_goods_inventory_audit(created_at DESC);

-- Add comments
COMMENT ON TABLE finished_goods_inventory_audit IS 'Audit log for finished goods inventory - tracks creation from batch production, reductions from sales/dispatch';
COMMENT ON COLUMN finished_goods_inventory_audit.reason IS 'Human-readable reason based on business logic';

-- =====================================================
-- STEP 6: Update trigger to log lot_inventory additions on lot creation
-- =====================================================

CREATE OR REPLACE FUNCTION initialize_lot_inventory_with_audit()
RETURNS TRIGGER AS $$
DECLARE
    v_lot_inventory_id UUID;
BEGIN
    -- Insert lot inventory record when a lot is created
    INSERT INTO lot_inventory (lot_id, available_quantity, created_by)
    VALUES (NEW.id, NEW.received_weight, NEW.created_by)
    ON CONFLICT (lot_id) DO NOTHING
    RETURNING id INTO v_lot_inventory_id;
    
    -- If a new inventory record was created, log the addition
    IF v_lot_inventory_id IS NOT NULL THEN
        INSERT INTO lot_inventory_audit (
            lot_inventory_id,
            lot_id,
            operation_type,
            quantity_change,
            quantity_before,
            quantity_after,
            reason,
            reference_type,
            reference_id,
            notes,
            created_by
        )
        VALUES (
            v_lot_inventory_id,
            NEW.id,
            'addition',
            NEW.received_weight,
            0,
            NEW.received_weight,
            'Lot created from inward slip',
            'inward_slip_lot',
            NEW.id,
            'Initial Stock | Lot: ' || NEW.lot_number || ' | Received Weight: ' || NEW.received_weight || ' kg',
            NEW.created_by
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger and create new one
DROP TRIGGER IF EXISTS initialize_lot_inventory_trigger ON inward_slip_lots;

CREATE TRIGGER initialize_lot_inventory_with_audit_trigger
    AFTER INSERT ON inward_slip_lots
    FOR EACH ROW
    EXECUTE FUNCTION initialize_lot_inventory_with_audit();

-- =====================================================
-- STEP 7: Update trigger to log bags_inventory additions on kaanta creation
-- =====================================================

CREATE OR REPLACE FUNCTION update_bags_inventory_on_kaanta_create_with_audit()
RETURNS TRIGGER AS $$
DECLARE
    v_bags_inventory_id UUID;
    v_old_filled_bags INTEGER;
BEGIN
    -- Get current filled_bags count
    SELECT id, filled_bags INTO v_bags_inventory_id, v_old_filled_bags
    FROM bags_inventory
    WHERE bag_type = NEW.bag_type AND bag_capacity = NEW.bag_weight;
    
    -- If not found, set defaults
    IF v_bags_inventory_id IS NULL THEN
        v_old_filled_bags := 0;
    END IF;
    
    -- Insert or update bags inventory when kaanta is created
    INSERT INTO bags_inventory (bag_type, bag_capacity, filled_bags, created_by)
    VALUES (NEW.bag_type, NEW.bag_weight, NEW.no_of_bags, NEW.created_by)
    ON CONFLICT (bag_type, bag_capacity)
    DO UPDATE SET
        filled_bags = bags_inventory.filled_bags + NEW.no_of_bags,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = NEW.created_by
    RETURNING id INTO v_bags_inventory_id;
    
    -- Log the audit entry
    INSERT INTO bags_inventory_audit (
        bags_inventory_id,
        bag_type,
        bag_capacity,
        operation_type,
        field_changed,
        quantity_change,
        quantity_before,
        quantity_after,
        reason,
        reference_type,
        reference_id,
        kaanta_id,
        notes,
        created_by
    )
    VALUES (
        v_bags_inventory_id,
        NEW.bag_type,
        NEW.bag_weight,
        'addition',
        'filled_bags',
        NEW.no_of_bags,
        v_old_filled_bags,
        v_old_filled_bags + NEW.no_of_bags,
        'Filled bags received from kaanta weighing',
        'kaanta',
        NEW.id,
        NEW.id,
        'Kaanta Weighing | Bags Received: ' || NEW.no_of_bags || ' | Type: ' || UPPER(NEW.bag_type) || ' | Capacity: ' || NEW.bag_weight || ' kg',
        NEW.created_by
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger and create new one
DROP TRIGGER IF EXISTS update_bags_inventory_on_kaanta_create_trigger ON kaantas;

CREATE TRIGGER update_bags_inventory_on_kaanta_create_with_audit_trigger
    AFTER INSERT ON kaantas
    FOR EACH ROW
    EXECUTE FUNCTION update_bags_inventory_on_kaanta_create_with_audit();


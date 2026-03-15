-- Migration: Inventory Ledger
-- Description: Unified log of all inventory movements for traceability

CREATE TABLE IF NOT EXISTS inventory_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity_change DECIMAL(12,3) NOT NULL,
    source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('purchase_inward', 'sales_dispatch', 'sale_return', 'adjustment')),
    source_id UUID,
    stock_before DECIMAL(12,3) NOT NULL,
    stock_after DECIMAL(12,3) NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    packaging_id UUID REFERENCES packaging(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_ledger_product_id ON inventory_ledger(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_source ON inventory_ledger(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_created_at ON inventory_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_product_created ON inventory_ledger(product_id, created_at DESC);

COMMENT ON TABLE inventory_ledger IS 'Unified log of inventory movements; product-level traceability';

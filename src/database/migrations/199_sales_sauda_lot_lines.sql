-- Migration: Direct lot sales on sales saudas / invoice dispatches
-- Lot lines have no product; inventory is lot_inventory (deduct on dispatch confirm).
-- HSN for lot lines is application-constant 1006 (not stored as a product).

-- =====================================================
-- 1. sales_sauda_lines
-- =====================================================

ALTER TABLE sales_sauda_lines
  ADD COLUMN IF NOT EXISTS line_type VARCHAR(20) NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES inward_slip_lots(id) ON DELETE RESTRICT;

ALTER TABLE sales_sauda_lines
  ALTER COLUMN product_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE sales_sauda_lines
    ADD CONSTRAINT sales_sauda_lines_line_type_check
    CHECK (line_type IN ('product', 'lot'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Drop old constraint if we need a composite rule (product_id may already lack NOT NULL)
DO $$ BEGIN
  ALTER TABLE sales_sauda_lines
    ADD CONSTRAINT sales_sauda_lines_product_or_lot_check
    CHECK (
      (
        line_type = 'product'
        AND product_id IS NOT NULL
        AND lot_id IS NULL
      )
      OR (
        line_type = 'lot'
        AND lot_id IS NOT NULL
        AND product_id IS NULL
        AND packaging_id IS NULL
        AND packet_count IS NULL
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_sauda_lines_lot_id
  ON sales_sauda_lines(lot_id)
  WHERE lot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_sauda_lines_line_type
  ON sales_sauda_lines(line_type);

COMMENT ON COLUMN sales_sauda_lines.line_type IS 'product (FGI path) | lot (lot_inventory path)';
COMMENT ON COLUMN sales_sauda_lines.lot_id IS 'Set when line_type=lot; no product_id';

-- =====================================================
-- 2. invoice_dispatch_lines
-- =====================================================

ALTER TABLE invoice_dispatch_lines
  ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES inward_slip_lots(id) ON DELETE RESTRICT;

ALTER TABLE invoice_dispatch_lines
  ALTER COLUMN product_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_dispatch_lines_lot_id
  ON invoice_dispatch_lines(lot_id)
  WHERE lot_id IS NOT NULL;

COMMENT ON COLUMN invoice_dispatch_lines.lot_id IS 'Set for lot-sale dispatch lines; product_id null';

-- =====================================================
-- 3. Lot allocation table (mirror of FGI allocations)
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_dispatch_lot_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_dispatch_id UUID NOT NULL REFERENCES invoice_dispatches(id) ON DELETE CASCADE,
  invoice_dispatch_line_id UUID NOT NULL REFERENCES invoice_dispatch_lines(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES inward_slip_lots(id) ON DELETE RESTRICT,
  lot_inventory_id UUID NOT NULL REFERENCES lot_inventory(id) ON DELETE RESTRICT,
  quantity_deducted DECIMAL(12, 3) NOT NULL CHECK (quantity_deducted > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_idl_lot_alloc_dispatch
  ON invoice_dispatch_lot_allocations(invoice_dispatch_id);
CREATE INDEX IF NOT EXISTS idx_idl_lot_alloc_line
  ON invoice_dispatch_lot_allocations(invoice_dispatch_line_id);
CREATE INDEX IF NOT EXISTS idx_idl_lot_alloc_lot
  ON invoice_dispatch_lot_allocations(lot_id);

COMMENT ON TABLE invoice_dispatch_lot_allocations IS
  'Links dispatch line to lot_inventory qty deducted on confirm; used to restore on cancel/credit note';

-- =====================================================
-- 4. credit_note_lines — allow null product for lot returns
-- =====================================================

ALTER TABLE credit_note_lines
  ALTER COLUMN product_id DROP NOT NULL;

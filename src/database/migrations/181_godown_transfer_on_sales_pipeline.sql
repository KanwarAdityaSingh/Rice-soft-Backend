-- Godown transfer via sales pipeline (movement_type flag).
-- Extends sales_saudas / invoice_dispatches; links godown → sales_party for receiving face.
-- Ledger inbound leg uses source_type = godown_transfer.

-- =====================================================
-- 1. Godown → sales party link (auto-created on first transfer)
-- =====================================================
ALTER TABLE godowns
  ADD COLUMN IF NOT EXISTS sales_party_id UUID REFERENCES sales_parties(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_godowns_sales_party_id
  ON godowns(sales_party_id)
  WHERE sales_party_id IS NOT NULL;

COMMENT ON COLUMN godowns.sales_party_id IS
  'Internal sales party used as invoice/e-way consignee when this godown is the transfer destination';

-- =====================================================
-- 2. Sales sauda movement + from/to godowns
-- =====================================================
ALTER TABLE sales_saudas
  ADD COLUMN IF NOT EXISTS movement_type VARCHAR(30) NOT NULL DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS from_godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS to_godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;

ALTER TABLE sales_saudas DROP CONSTRAINT IF EXISTS sales_saudas_movement_type_check;
ALTER TABLE sales_saudas
  ADD CONSTRAINT sales_saudas_movement_type_check
  CHECK (movement_type IN ('sale', 'godown_transfer'));

ALTER TABLE sales_saudas DROP CONSTRAINT IF EXISTS sales_saudas_movement_godowns_check;
ALTER TABLE sales_saudas
  ADD CONSTRAINT sales_saudas_movement_godowns_check
  CHECK (
    (
      movement_type = 'sale'
      AND from_godown_id IS NULL
      AND to_godown_id IS NULL
    )
    OR (
      movement_type = 'godown_transfer'
      AND from_godown_id IS NOT NULL
      AND to_godown_id IS NOT NULL
      AND from_godown_id <> to_godown_id
    )
  );

CREATE INDEX IF NOT EXISTS idx_sales_saudas_movement_type ON sales_saudas(movement_type);
CREATE INDEX IF NOT EXISTS idx_sales_saudas_from_godown_id ON sales_saudas(from_godown_id)
  WHERE from_godown_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_saudas_to_godown_id ON sales_saudas(to_godown_id)
  WHERE to_godown_id IS NOT NULL;

COMMENT ON COLUMN sales_saudas.movement_type IS
  'sale = customer sale; godown_transfer = inter-godown move shown as sale document';
COMMENT ON COLUMN sales_saudas.from_godown_id IS 'Source godown when movement_type = godown_transfer';
COMMENT ON COLUMN sales_saudas.to_godown_id IS 'Destination godown when movement_type = godown_transfer';

-- =====================================================
-- 3. Invoice dispatch destination godown
-- =====================================================
ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS to_godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_invoice_dispatches_to_godown_id ON invoice_dispatches(to_godown_id)
  WHERE to_godown_id IS NOT NULL;

COMMENT ON COLUMN invoice_dispatches.to_godown_id IS
  'Destination godown for godown_transfer; null for normal customer sales. Stock credited on confirm.';

-- =====================================================
-- 4. Inventory ledger: allow godown_transfer source
-- =====================================================
ALTER TABLE inventory_ledger DROP CONSTRAINT IF EXISTS inventory_ledger_source_type_check;
ALTER TABLE inventory_ledger
  ADD CONSTRAINT inventory_ledger_source_type_check
  CHECK (source_type IN ('purchase_inward', 'sales_dispatch', 'sale_return', 'adjustment', 'godown_transfer'));

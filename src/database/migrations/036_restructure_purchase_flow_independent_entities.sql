-- Migration: Restructure Purchase Flow to Independent Entities
-- Description: Makes Lots independent (link to Sauda), Purchase aggregates from multiple entities via junction tables

-- =====================================================
-- STEP 1: Change Lots to link directly to Sauda
-- =====================================================

-- Add sauda_id column to inward_slip_lots
ALTER TABLE inward_slip_lots
ADD COLUMN IF NOT EXISTS sauda_id UUID;

-- Migrate sauda_id from Inward Slip Pass to Lots
UPDATE inward_slip_lots lot
SET sauda_id = isp.sauda_id
FROM inward_slip_passes isp
WHERE lot.inward_slip_pass_id = isp.id
AND lot.sauda_id IS NULL;

-- Make sauda_id NOT NULL
ALTER TABLE inward_slip_lots
ALTER COLUMN sauda_id SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE inward_slip_lots
ADD CONSTRAINT fk_inward_slip_lots_sauda_id
FOREIGN KEY (sauda_id) REFERENCES saudas(id) ON DELETE RESTRICT;

-- Create index on sauda_id
CREATE INDEX IF NOT EXISTS idx_inward_slip_lots_sauda_id ON inward_slip_lots(sauda_id);

-- Remove old foreign key constraint and column
ALTER TABLE inward_slip_lots
DROP CONSTRAINT IF EXISTS inward_slip_lots_inward_slip_pass_id_fkey;

ALTER TABLE inward_slip_lots
DROP COLUMN IF EXISTS inward_slip_pass_id;

-- Drop old index
DROP INDEX IF EXISTS idx_inward_slip_lots_inward_slip_pass_id;

-- =====================================================
-- STEP 2: Create Junction Tables for Purchase Relationships
-- =====================================================

-- Purchase ↔ Saudas (many-to-many)
CREATE TABLE IF NOT EXISTS purchase_saudas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    sauda_id UUID NOT NULL REFERENCES saudas(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(purchase_id, sauda_id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_saudas_purchase_id ON purchase_saudas(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_saudas_sauda_id ON purchase_saudas(sauda_id);

COMMENT ON TABLE purchase_saudas IS 'Junction table linking purchases to saudas (many-to-many)';

-- Purchase ↔ Inward Slip Passes (many-to-many)
CREATE TABLE IF NOT EXISTS purchase_inward_slip_passes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    inward_slip_pass_id UUID NOT NULL REFERENCES inward_slip_passes(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(purchase_id, inward_slip_pass_id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_inward_slip_passes_purchase_id ON purchase_inward_slip_passes(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_inward_slip_passes_isp_id ON purchase_inward_slip_passes(inward_slip_pass_id);

COMMENT ON TABLE purchase_inward_slip_passes IS 'Junction table linking purchases to inward slip passes (many-to-many)';

-- Purchase ↔ Lots (many-to-many)
CREATE TABLE IF NOT EXISTS purchase_lots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    lot_id UUID NOT NULL REFERENCES inward_slip_lots(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(purchase_id, lot_id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_lots_purchase_id ON purchase_lots(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_lots_lot_id ON purchase_lots(lot_id);

COMMENT ON TABLE purchase_lots IS 'Junction table linking purchases to lots (many-to-many)';

-- =====================================================
-- STEP 3: Migrate Existing Purchase-Sauda Relationships
-- =====================================================

-- Migrate existing purchase-sauda relationships to junction table
INSERT INTO purchase_saudas (purchase_id, sauda_id)
SELECT id, sauda_id 
FROM purchases 
WHERE sauda_id IS NOT NULL
ON CONFLICT (purchase_id, sauda_id) DO NOTHING;

-- =====================================================
-- STEP 4: Migrate Existing Purchase-ISP Relationships
-- =====================================================

-- Migrate existing purchase-ISP relationships (via sauda)
INSERT INTO purchase_inward_slip_passes (purchase_id, inward_slip_pass_id)
SELECT DISTINCT p.id, isp.id
FROM purchases p
INNER JOIN inward_slip_passes isp ON isp.sauda_id = p.sauda_id
WHERE p.sauda_id IS NOT NULL
ON CONFLICT (purchase_id, inward_slip_pass_id) DO NOTHING;

-- =====================================================
-- STEP 5: Migrate Existing Purchase-Lot Relationships
-- =====================================================

-- Migrate existing purchase-lot relationships (via sauda)
-- Since lots now have sauda_id, we can link them directly
INSERT INTO purchase_lots (purchase_id, lot_id)
SELECT DISTINCT p.id, lot.id
FROM purchases p
INNER JOIN purchase_saudas ps ON ps.purchase_id = p.id
INNER JOIN inward_slip_lots lot ON lot.sauda_id = ps.sauda_id
ON CONFLICT (purchase_id, lot_id) DO NOTHING;

-- =====================================================
-- STEP 6: Add Accounting Fields to Purchases
-- =====================================================

-- Add cash_discount and transportation_cost to purchases
ALTER TABLE purchases
ADD COLUMN IF NOT EXISTS cash_discount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS transportation_cost DECIMAL(10,2);

COMMENT ON COLUMN purchases.cash_discount IS 'Cash discount amount (fixed, not percentage) - Purchase-level override';
COMMENT ON COLUMN purchases.transportation_cost IS 'Transportation cost amount - Purchase-level override';

-- Copy sauda values to purchase for existing data (use first linked sauda)
UPDATE purchases p
SET 
    cash_discount = s.cash_discount,
    transportation_cost = s.transportation_cost
FROM purchase_saudas ps
INNER JOIN saudas s ON ps.sauda_id = s.id
WHERE p.id = ps.purchase_id
AND p.cash_discount IS NULL
AND ps.id = (
    SELECT id FROM purchase_saudas 
    WHERE purchase_id = p.id 
    ORDER BY created_at ASC 
    LIMIT 1
);

-- =====================================================
-- STEP 7: Remove sauda_id from Purchases
-- =====================================================

-- Drop foreign key constraint
ALTER TABLE purchases
DROP CONSTRAINT IF EXISTS purchases_sauda_id_fkey;

-- Drop index
DROP INDEX IF EXISTS idx_purchases_sauda_id;

-- Remove column
ALTER TABLE purchases
DROP COLUMN IF EXISTS sauda_id;

-- =====================================================
-- STEP 8: Update Comments
-- =====================================================

COMMENT ON TABLE inward_slip_lots IS 'Stores individual lots - now independent entities linked directly to saudas';
COMMENT ON COLUMN inward_slip_lots.sauda_id IS 'Direct link to sauda (lots are independent of inward slip passes)';
COMMENT ON TABLE purchases IS 'Purchase execution records - aggregates from multiple saudas, ISPs, and lots via junction tables';


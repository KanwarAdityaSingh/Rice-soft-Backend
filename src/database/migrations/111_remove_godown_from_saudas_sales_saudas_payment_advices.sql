-- Migration: Remove godown_id from non-physical modules (provisional/commercial documents).
-- Physical stock remains scoped by godown on inward_slip_passes, lots, kaantas, batches,
-- invoice_dispatches, inventory tables, and inventory_ledger.

DROP INDEX IF EXISTS idx_payment_advices_godown_id;
DROP INDEX IF EXISTS idx_sales_saudas_godown_id;

ALTER TABLE payment_advices
  DROP COLUMN IF EXISTS godown_id;

ALTER TABLE sales_saudas
  DROP COLUMN IF EXISTS godown_id;

ALTER TABLE saudas
  DROP COLUMN IF EXISTS godown_id;

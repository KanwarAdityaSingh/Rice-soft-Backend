-- Migration: Multi-sauda invoice dispatch
-- Junction table so one invoice can attach multiple sales saudas (same party + delivery address).
-- Also allows one commission accrual per (dispatch, sauda) instead of one per dispatch.

-- STEP 1: Junction table
CREATE TABLE IF NOT EXISTS invoice_dispatch_saudas (
  invoice_dispatch_id UUID NOT NULL REFERENCES invoice_dispatches(id) ON DELETE CASCADE,
  sales_sauda_id UUID NOT NULL REFERENCES sales_saudas(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (invoice_dispatch_id, sales_sauda_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_dispatch_saudas_sauda
  ON invoice_dispatch_saudas (sales_sauda_id);

COMMENT ON TABLE invoice_dispatch_saudas IS
  'Links invoice dispatches to one or more sales saudas (clubbed same party + delivery address)';

-- STEP 2: Backfill from existing primary sales_sauda_id
INSERT INTO invoice_dispatch_saudas (invoice_dispatch_id, sales_sauda_id)
SELECT id, sales_sauda_id
FROM invoice_dispatches
ON CONFLICT (invoice_dispatch_id, sales_sauda_id) DO NOTHING;

-- STEP 3: Commission unique — one accrual per dispatch+sauda (multi-sauda invoices)
DROP INDEX IF EXISTS salesman_commission_accrual_dispatch_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS salesman_commission_accrual_dispatch_sauda_uidx
  ON salesman_commission_entries (invoice_dispatch_id, sales_sauda_id)
  WHERE entry_type = 'accrual' AND invoice_dispatch_id IS NOT NULL;

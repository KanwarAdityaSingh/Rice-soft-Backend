-- Indian financial year (Apr–Mar) on sales sauda, invoice dispatch, credit notes.
-- Document numbers are unique per financial year (not globally).

-- =====================================================
-- sales_saudas
-- =====================================================
ALTER TABLE sales_saudas
  ADD COLUMN IF NOT EXISTS financial_year VARCHAR(9);

COMMENT ON COLUMN sales_saudas.financial_year IS
  'Indian financial year label (Apr–Mar), e.g. 2025-2026, derived from sauda_date';

UPDATE sales_saudas
SET financial_year = (
  CASE
    WHEN EXTRACT(MONTH FROM COALESCE(sauda_date, created_at::date)) >= 4
      THEN EXTRACT(YEAR FROM COALESCE(sauda_date, created_at::date))::text
        || '-'
        || (EXTRACT(YEAR FROM COALESCE(sauda_date, created_at::date)) + 1)::text
    ELSE (EXTRACT(YEAR FROM COALESCE(sauda_date, created_at::date)) - 1)::text
        || '-'
        || EXTRACT(YEAR FROM COALESCE(sauda_date, created_at::date))::text
  END
)
WHERE financial_year IS NULL;

ALTER TABLE sales_saudas
  ALTER COLUMN financial_year SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_saudas_financial_year ON sales_saudas(financial_year);

-- order_number unique within financial year (null order_number allowed for drafts)
ALTER TABLE sales_saudas DROP CONSTRAINT IF EXISTS sales_saudas_order_number_key;
DROP INDEX IF EXISTS sales_saudas_order_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_saudas_order_number_fy
  ON sales_saudas (order_number, financial_year)
  WHERE order_number IS NOT NULL;

-- =====================================================
-- invoice_dispatches
-- =====================================================
ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS financial_year VARCHAR(9);

COMMENT ON COLUMN invoice_dispatches.financial_year IS
  'Indian financial year label (Apr–Mar), e.g. 2025-2026, derived from dispatch_date';

UPDATE invoice_dispatches
SET financial_year = (
  CASE
    WHEN EXTRACT(MONTH FROM COALESCE(dispatch_date, created_at::date)) >= 4
      THEN EXTRACT(YEAR FROM COALESCE(dispatch_date, created_at::date))::text
        || '-'
        || (EXTRACT(YEAR FROM COALESCE(dispatch_date, created_at::date)) + 1)::text
    ELSE (EXTRACT(YEAR FROM COALESCE(dispatch_date, created_at::date)) - 1)::text
        || '-'
        || EXTRACT(YEAR FROM COALESCE(dispatch_date, created_at::date))::text
  END
)
WHERE financial_year IS NULL;

ALTER TABLE invoice_dispatches
  ALTER COLUMN financial_year SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_dispatches_financial_year ON invoice_dispatches(financial_year);

ALTER TABLE invoice_dispatches DROP CONSTRAINT IF EXISTS invoice_dispatches_internal_invoice_number_key;
DROP INDEX IF EXISTS idx_invoice_dispatches_internal_invoice_number;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_dispatches_invoice_number_fy
  ON invoice_dispatches (internal_invoice_number, financial_year);

-- =====================================================
-- credit_notes
-- =====================================================
ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS financial_year VARCHAR(9);

COMMENT ON COLUMN credit_notes.financial_year IS
  'Indian financial year label (Apr–Mar), e.g. 2025-2026, derived from credit_note_date';

UPDATE credit_notes
SET financial_year = (
  CASE
    WHEN EXTRACT(MONTH FROM COALESCE(credit_note_date, created_at::date)) >= 4
      THEN EXTRACT(YEAR FROM COALESCE(credit_note_date, created_at::date))::text
        || '-'
        || (EXTRACT(YEAR FROM COALESCE(credit_note_date, created_at::date)) + 1)::text
    ELSE (EXTRACT(YEAR FROM COALESCE(credit_note_date, created_at::date)) - 1)::text
        || '-'
        || EXTRACT(YEAR FROM COALESCE(credit_note_date, created_at::date))::text
  END
)
WHERE financial_year IS NULL;

ALTER TABLE credit_notes
  ALTER COLUMN financial_year SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_notes_financial_year ON credit_notes(financial_year);

ALTER TABLE credit_notes DROP CONSTRAINT IF EXISTS credit_notes_credit_note_number_key;
DROP INDEX IF EXISTS idx_credit_notes_credit_note_number;
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_notes_credit_note_number_fy
  ON credit_notes (credit_note_number, financial_year);

-- Credit note workflow: types, posted/cancelled status, GST snapshots,
-- remaining-eligible fields, coupon status, damaged-goods routing, attachments.

-- =====================================================
-- 1. Header: drop old status check, migrate confirmed → posted
-- =====================================================

ALTER TABLE credit_notes DROP CONSTRAINT IF EXISTS credit_notes_status_check;

UPDATE credit_notes SET status = 'posted' WHERE status = 'confirmed';

ALTER TABLE credit_notes
  ADD CONSTRAINT credit_notes_status_check
  CHECK (status IN ('draft', 'posted', 'cancelled'));

ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS credit_note_type VARCHAR(40),
  ADD COLUMN IF NOT EXISTS serial_number INTEGER,
  ADD COLUMN IF NOT EXISTS coupon_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS material_condition VARCHAR(40),
  ADD COLUMN IF NOT EXISTS receiving_godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_credit_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS posted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS edit_reason TEXT;

UPDATE credit_notes
SET credit_note_type = COALESCE(credit_note_type, 'sales_return_partial')
WHERE credit_note_type IS NULL;

UPDATE credit_notes
SET coupon_status = COALESCE(coupon_status, 'returned_with_goods')
WHERE coupon_status IS NULL;

ALTER TABLE credit_notes
  ALTER COLUMN credit_note_type SET NOT NULL,
  ALTER COLUMN coupon_status SET NOT NULL;

ALTER TABLE credit_notes DROP CONSTRAINT IF EXISTS credit_notes_type_check;
ALTER TABLE credit_notes
  ADD CONSTRAINT credit_notes_type_check CHECK (credit_note_type IN (
    'rate_difference',
    'commercial_discount',
    'other',
    'sales_return_full',
    'sales_return_partial',
    'short_quantity',
    'quality_issue',
    'damaged_goods'
  ));

ALTER TABLE credit_notes DROP CONSTRAINT IF EXISTS credit_notes_coupon_status_check;
ALTER TABLE credit_notes
  ADD CONSTRAINT credit_notes_coupon_status_check CHECK (coupon_status IN (
    'returned_with_goods',
    'already_given',
    'already_redeemed',
    'not_applicable'
  ));

ALTER TABLE credit_notes DROP CONSTRAINT IF EXISTS credit_notes_material_condition_check;
ALTER TABLE credit_notes
  ADD CONSTRAINT credit_notes_material_condition_check CHECK (
    material_condition IS NULL OR material_condition IN (
      'saleable',
      'broken_bag',
      'damaged_reprocess',
      'scrap',
      'destroy'
    )
  );

-- Serial per financial year (gap-reuse, lowest unused)
WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY financial_year
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM credit_notes
  WHERE serial_number IS NULL
)
UPDATE credit_notes cn
SET serial_number = o.rn
FROM ordered o
WHERE cn.id = o.id
  AND cn.serial_number IS NULL;

ALTER TABLE credit_notes
  ALTER COLUMN serial_number SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE credit_notes
    ADD CONSTRAINT credit_notes_fy_serial_unique UNIQUE (financial_year, serial_number);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_credit_notes_type ON credit_notes (credit_note_type);
CREATE INDEX IF NOT EXISTS idx_credit_notes_date ON credit_notes (credit_note_date);
CREATE INDEX IF NOT EXISTS idx_credit_notes_receiving_godown_id ON credit_notes (receiving_godown_id);

CREATE OR REPLACE FUNCTION assign_credit_note_serial_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.serial_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.financial_year IS NULL OR TRIM(NEW.financial_year) = '' THEN
    RAISE EXCEPTION 'financial_year is required to assign credit note serial_number';
  END IF;

  PERFORM pg_advisory_xact_lock(872344030, hashtext(NEW.financial_year));

  WITH used AS (
    SELECT serial_number AS n
    FROM credit_notes
    WHERE financial_year = NEW.financial_year
      AND serial_number IS NOT NULL
  ),
  bound AS (
    SELECT COALESCE((SELECT MAX(n) FROM used), 0) + 1 AS upper
  )
  SELECT MIN(gs.i)
  INTO next_num
  FROM bound b
  CROSS JOIN generate_series(1, b.upper) AS gs(i)
  WHERE NOT EXISTS (SELECT 1 FROM used WHERE used.n = gs.i);

  IF next_num IS NULL THEN
    next_num := 1;
  END IF;

  NEW.serial_number := next_num;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_credit_note_serial_number ON credit_notes;
CREATE TRIGGER trg_assign_credit_note_serial_number
  BEFORE INSERT ON credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION assign_credit_note_serial_number();

COMMENT ON TABLE credit_notes IS
  'Sales credit note: type-driven value adjustment or sale return; inventory/coupons post on posted';

-- =====================================================
-- 2. Lines: money snapshot, short-weight, rate difference
-- =====================================================

ALTER TABLE credit_note_lines DROP CONSTRAINT IF EXISTS credit_note_lines_quantity_returned_check;

ALTER TABLE credit_note_lines
  ADD COLUMN IF NOT EXISTS quantity_credited DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity_invoiced DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS quantity_actual_returned DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS quantity_verified DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS quantity_short DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS original_rate DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS corrected_rate DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS credit_taxable_input DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS rate DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS gst_percent DECIMAL(6,2),
  ADD COLUMN IF NOT EXISTS discount_value DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_amount DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE credit_note_lines
SET quantity_credited = quantity_returned
WHERE quantity_credited = 0 AND quantity_returned > 0;

UPDATE credit_note_lines cnl
SET
  quantity_invoiced = COALESCE(cnl.quantity_invoiced, idl.quantity),
  rate = COALESCE(cnl.rate, idl.rate),
  original_rate = COALESCE(cnl.original_rate, idl.rate),
  taxable_amount = CASE
    WHEN cnl.taxable_amount = 0 THEN ROUND((cnl.quantity_returned * idl.rate)::numeric, 2)
    ELSE cnl.taxable_amount
  END,
  final_amount = CASE
    WHEN cnl.final_amount = 0 THEN ROUND((cnl.quantity_returned * idl.rate)::numeric, 2)
    ELSE cnl.final_amount
  END
FROM invoice_dispatch_lines idl
WHERE idl.id = cnl.invoice_dispatch_line_id;

UPDATE credit_notes cn
SET
  taxable_amount = agg.taxable,
  total_credit_amount = agg.final
FROM (
  SELECT credit_note_id,
         COALESCE(SUM(taxable_amount), 0) AS taxable,
         COALESCE(SUM(final_amount), 0) AS final
  FROM credit_note_lines
  GROUP BY credit_note_id
) agg
WHERE cn.id = agg.credit_note_id
  AND cn.total_credit_amount = 0;

ALTER TABLE credit_note_lines
  ADD CONSTRAINT credit_note_lines_quantity_returned_check CHECK (quantity_returned >= 0);

ALTER TABLE credit_note_lines
  ADD CONSTRAINT credit_note_lines_quantity_credited_check CHECK (quantity_credited >= 0);

ALTER TABLE credit_note_lines DROP CONSTRAINT IF EXISTS credit_note_lines_discount_type_check;
ALTER TABLE credit_note_lines
  ADD CONSTRAINT credit_note_lines_discount_type_check CHECK (
    discount_type IS NULL OR discount_type IN ('per_kg', 'percentage')
  );

-- =====================================================
-- 3. Attachments
-- =====================================================

CREATE TABLE IF NOT EXISTS credit_note_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_note_id UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN (
      'customer_letter',
      'lr_copy',
      'return_receipt',
      'weighbridge_slip',
      'goods_photo',
      'credit_note_pdf',
      'other'
    )),
    file_url TEXT NOT NULL,
    file_name TEXT,
    mime_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_note_attachments_credit_note_id
  ON credit_note_attachments (credit_note_id);

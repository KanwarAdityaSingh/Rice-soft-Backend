-- Add explicit financial input/output fields on sales sauda lines.
-- Backend computes and persists these values; client-provided computed amounts are ignored/rejected.

ALTER TABLE sales_sauda_lines
ADD COLUMN IF NOT EXISTS discount_value DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) NOT NULL DEFAULT 'per_kg' CHECK (discount_type IN ('per_kg', 'percentage')),
ADD COLUMN IF NOT EXISTS gst_percent DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (gst_percent >= 0),
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
ADD COLUMN IF NOT EXISTS final_amount DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (final_amount >= 0);

-- Backfill existing rows so header amount and line totals remain consistent.
UPDATE sales_sauda_lines
SET discount_value = COALESCE(discount_value, 0),
    discount_type = COALESCE(discount_type, 'per_kg'),
    gst_percent = COALESCE(gst_percent, 0),
    discount_amount = COALESCE(discount_amount, 0),
    gst_amount = COALESCE(gst_amount, 0),
    final_amount = COALESCE(final_amount, amount);

COMMENT ON COLUMN sales_sauda_lines.discount_value IS 'Raw discount input value; meaning depends on discount_type';
COMMENT ON COLUMN sales_sauda_lines.discount_type IS 'Discount type: per_kg or percentage';
COMMENT ON COLUMN sales_sauda_lines.gst_percent IS 'GST percentage input from UI; applied only when packaging capacity <= 25kg';
COMMENT ON COLUMN sales_sauda_lines.discount_amount IS 'Computed discount amount in currency';
COMMENT ON COLUMN sales_sauda_lines.gst_amount IS 'Computed GST amount in currency';
COMMENT ON COLUMN sales_sauda_lines.final_amount IS 'Computed final amount: max(amount - discount_amount, 0) + gst_amount';

-- Print-only snapshots on credit note lines (name / brand / HSN).
-- product_id remains the inventory SKU. Values are set per credit note on
-- create/update; omit on the API to copy invoice alias / product master at write.

ALTER TABLE credit_note_lines
  ADD COLUMN IF NOT EXISTS product_alias VARCHAR(255) NULL;

ALTER TABLE credit_note_lines
  ADD COLUMN IF NOT EXISTS brand VARCHAR(255) NULL;

ALTER TABLE credit_note_lines
  ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20) NULL;

COMMENT ON COLUMN credit_note_lines.product_alias IS
  'Credit-note print name; only used when credit_note_type is other';

COMMENT ON COLUMN credit_note_lines.brand IS
  'Credit-note print brand; only used when credit_note_type is other';

COMMENT ON COLUMN credit_note_lines.hsn_code IS
  'Credit-note print HSN; only used when credit_note_type is other';

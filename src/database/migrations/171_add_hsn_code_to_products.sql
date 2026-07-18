-- Optional HSN code on products. Allowed values enforced in application code (HSN_CODES).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20);

COMMENT ON COLUMN products.hsn_code IS
  'HSN code; allowed values defined in application (currently 1006)';

CREATE INDEX IF NOT EXISTS idx_products_hsn_code ON products(hsn_code)
  WHERE hsn_code IS NOT NULL;

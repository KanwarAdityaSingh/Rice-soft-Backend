-- Replace rate columns on products with a normalized product_rates table.
-- No data was added yet, so we only need to drop columns if they exist and create the new table.

-- Drop rate columns from products if they were added by a previous run of this migration
ALTER TABLE products DROP COLUMN IF EXISTS rate_5;
ALTER TABLE products DROP COLUMN IF EXISTS rate_10;
ALTER TABLE products DROP COLUMN IF EXISTS rate_25;
ALTER TABLE products DROP COLUMN IF EXISTS rate_26;
ALTER TABLE products DROP COLUMN IF EXISTS rate_30;
ALTER TABLE products DROP COLUMN IF EXISTS rate_50;

-- Create product_rates: one row per (product, holding_capacity) with suggested sell rate
CREATE TABLE IF NOT EXISTS product_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  holding_capacity INT NOT NULL CHECK (holding_capacity IN (5, 10, 25, 26, 30, 50)),
  rate DECIMAL(12,2) NOT NULL CHECK (rate >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, holding_capacity)
);

CREATE INDEX IF NOT EXISTS idx_product_rates_product_id ON product_rates(product_id);
CREATE INDEX IF NOT EXISTS idx_product_rates_product_capacity ON product_rates(product_id, holding_capacity);

CREATE TRIGGER update_product_rates_updated_at
  BEFORE UPDATE ON product_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE product_rates IS 'Suggested sell rate per product and holding capacity (kg); used to pre-fill rate on sales sauda lines';

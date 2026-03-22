-- Append-only history for suggested sell rates (product_rates), for trend charts and audit.

CREATE TABLE IF NOT EXISTS product_rate_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  holding_capacity INT NOT NULL CHECK (holding_capacity IN (5, 10, 25, 26, 30, 50)),
  rate DECIMAL(12,2) NOT NULL CHECK (rate >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_product_rate_history_product_capacity_time
  ON product_rate_history (product_id, holding_capacity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_rate_history_product_time
  ON product_rate_history (product_id, created_at DESC);

COMMENT ON TABLE product_rate_history IS 'Append-only log of suggested rate changes per product and holding capacity (kg)';
COMMENT ON COLUMN product_rate_history.created_by IS 'User who saved the rate change; NULL for backfill or system';

-- Baseline one row per existing product_rates row (approximate time from product_rates)
INSERT INTO product_rate_history (product_id, holding_capacity, rate, created_by, created_at)
SELECT
  product_id,
  holding_capacity,
  rate,
  NULL,
  COALESCE(updated_at, created_at)
FROM product_rates;

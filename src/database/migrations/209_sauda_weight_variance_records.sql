-- Migration: Ex-Godown weight variance ledger
-- Ex-Godown saudas are always billed on bill weight (billCap), regardless of the kaanta re-weigh.
-- When kaanta_weight differs from billCap (short or excess), we record it here for reporting —
-- it never affects the payment advice amount. One append-only row per detected value change,
-- written whenever a linked payment advice is created/updated/synced from a kaanta change.

CREATE TABLE IF NOT EXISTS sauda_weight_variance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sauda_id UUID NOT NULL REFERENCES saudas(id) ON DELETE CASCADE,
  payment_advice_id UUID NOT NULL REFERENCES payment_advices(id) ON DELETE CASCADE,
  inward_slip_pass_id UUID REFERENCES inward_slip_passes(id) ON DELETE SET NULL,
  broker_id UUID REFERENCES brokers(id) ON DELETE SET NULL,
  purchaser_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  bill_weight NUMERIC(14, 3) NOT NULL,
  kanta_weight NUMERIC(14, 3) NOT NULL,
  variance_kg NUMERIC(14, 3) NOT NULL CHECK (variance_kg > 0),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('short', 'excess')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sauda_weight_variance_sauda
  ON sauda_weight_variance_records (sauda_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sauda_weight_variance_payment_advice
  ON sauda_weight_variance_records (payment_advice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sauda_weight_variance_broker
  ON sauda_weight_variance_records (broker_id, created_at DESC)
  WHERE broker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sauda_weight_variance_created
  ON sauda_weight_variance_records (created_at DESC);

COMMENT ON TABLE sauda_weight_variance_records IS
  'Ex-Godown only: append-only log of kaanta_weight vs bill_weight variances. Informational — does not affect payment advice amount.';

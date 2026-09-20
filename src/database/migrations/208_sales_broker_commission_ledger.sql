-- Migration: Sales sauda broker commission + sales broker commission ledger
-- Accrue on invoice dispatch confirm; reverse on credit note confirm.
-- Purchase broker commission (computed summary) is unchanged.

-- =====================================================
-- 1. sales_saudas broker fields (same type system as purchase saudas)
-- =====================================================

ALTER TABLE sales_saudas
  ADD COLUMN IF NOT EXISTS broker_id UUID REFERENCES brokers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS broker_commission DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS broker_commission_type VARCHAR(20);

DO $$ BEGIN
  ALTER TABLE sales_saudas
    ADD CONSTRAINT sales_saudas_broker_commission_type_check
    CHECK (
      broker_commission_type IS NULL
      OR broker_commission_type IN ('rupees', 'percentage', 'weight')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Pair: type+rate together; broker_id may be null only when both commission fields null
DO $$ BEGIN
  ALTER TABLE sales_saudas
    ADD CONSTRAINT sales_saudas_broker_commission_pair_check
    CHECK (
      (
        broker_commission IS NULL
        AND broker_commission_type IS NULL
      )
      OR (
        broker_id IS NOT NULL
        AND broker_commission IS NOT NULL
        AND broker_commission_type IS NOT NULL
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_saudas_broker_id
  ON sales_saudas (broker_id)
  WHERE broker_id IS NOT NULL;

COMMENT ON COLUMN sales_saudas.broker_id IS 'Optional sales broker; required when broker commission is set';
COMMENT ON COLUMN sales_saudas.broker_commission IS 'Commission rate/amount snapshot (rupees | percentage | weight)';
COMMENT ON COLUMN sales_saudas.broker_commission_type IS 'rupees | percentage | weight (same as purchase saudas)';

-- =====================================================
-- 2. Sales broker commission ledger
-- =====================================================

CREATE TABLE IF NOT EXISTS broker_commission_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID NOT NULL REFERENCES brokers(id) ON DELETE RESTRICT,
  sales_sauda_id UUID NOT NULL REFERENCES sales_saudas(id) ON DELETE RESTRICT,
  invoice_dispatch_id UUID REFERENCES invoice_dispatches(id) ON DELETE CASCADE,
  credit_note_id UUID REFERENCES credit_notes(id) ON DELETE SET NULL,
  entry_type VARCHAR(20) NOT NULL
    CHECK (entry_type IN ('accrual', 'reversal')),
  commission_type VARCHAR(20) NOT NULL
    CHECK (commission_type IN ('rupees', 'percentage', 'weight')),
  commission_rate NUMERIC(14, 2) NOT NULL,
  basis_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  basis_sale_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(14, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid')),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT broker_commission_entries_links_check CHECK (
    (entry_type = 'accrual' AND invoice_dispatch_id IS NOT NULL AND credit_note_id IS NULL)
    OR (entry_type = 'reversal' AND credit_note_id IS NOT NULL)
  )
);

-- One accrual per dispatch+sauda (multi-sauda invoices)
CREATE UNIQUE INDEX IF NOT EXISTS broker_commission_accrual_dispatch_sauda_uidx
  ON broker_commission_entries (invoice_dispatch_id, sales_sauda_id)
  WHERE entry_type = 'accrual' AND invoice_dispatch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS broker_commission_reversal_credit_note_uidx
  ON broker_commission_entries (credit_note_id)
  WHERE entry_type = 'reversal' AND credit_note_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_broker_commission_entries_broker_status
  ON broker_commission_entries (broker_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_broker_commission_entries_sauda
  ON broker_commission_entries (sales_sauda_id);

CREATE INDEX IF NOT EXISTS idx_broker_commission_entries_created
  ON broker_commission_entries (created_at);

COMMENT ON TABLE broker_commission_entries IS
  'Sales broker commission ledger: accrual on dispatch confirm, reversal on credit note confirm';

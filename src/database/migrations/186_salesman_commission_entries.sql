-- Migration: Salesman commission ledger (Phase 2)
-- Accrual on invoice dispatch confirm; reversal on credit note confirm.

CREATE TABLE IF NOT EXISTS salesman_commission_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salesman_id UUID NOT NULL REFERENCES salesmen(id) ON DELETE RESTRICT,
  sales_sauda_id UUID NOT NULL REFERENCES sales_saudas(id) ON DELETE RESTRICT,
  invoice_dispatch_id UUID REFERENCES invoice_dispatches(id) ON DELETE CASCADE,
  credit_note_id UUID REFERENCES credit_notes(id) ON DELETE SET NULL,
  entry_type VARCHAR(20) NOT NULL
    CHECK (entry_type IN ('accrual', 'reversal')),
  commission_type VARCHAR(40) NOT NULL
    CHECK (commission_type IN (
      'per_kg',
      'percent_of_sale',
      'fixed_per_transaction',
      'by_rice_quality',
      'by_customer'
    )),
  commission_config JSONB NOT NULL,
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
  CONSTRAINT salesman_commission_entries_links_check CHECK (
    (entry_type = 'accrual' AND invoice_dispatch_id IS NOT NULL AND credit_note_id IS NULL)
    OR (entry_type = 'reversal' AND credit_note_id IS NOT NULL)
  )
);

-- One accrual per dispatch
CREATE UNIQUE INDEX IF NOT EXISTS salesman_commission_accrual_dispatch_uidx
  ON salesman_commission_entries (invoice_dispatch_id)
  WHERE entry_type = 'accrual' AND invoice_dispatch_id IS NOT NULL;

-- One reversal per credit note
CREATE UNIQUE INDEX IF NOT EXISTS salesman_commission_reversal_credit_note_uidx
  ON salesman_commission_entries (credit_note_id)
  WHERE entry_type = 'reversal' AND credit_note_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_salesman_commission_entries_salesman_status
  ON salesman_commission_entries (salesman_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_salesman_commission_entries_sauda
  ON salesman_commission_entries (sales_sauda_id);

CREATE INDEX IF NOT EXISTS idx_salesman_commission_entries_created
  ON salesman_commission_entries (created_at);

COMMENT ON TABLE salesman_commission_entries IS
  'Salesman commission ledger: accrual on dispatch confirm, reversal on credit note confirm';

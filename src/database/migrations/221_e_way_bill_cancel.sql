-- Persist e-way bill cancel state after MastersIndia / NIC cancel.

ALTER TABLE e_way_bills
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cancel_remark TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'e_way_bills_status_check'
  ) THEN
    ALTER TABLE e_way_bills
      ADD CONSTRAINT e_way_bills_status_check
      CHECK (status IN ('generated', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_e_way_bills_dispatch_status
  ON e_way_bills (invoice_dispatch_id, status);

COMMENT ON COLUMN e_way_bills.status IS 'generated until cancelled via MastersIndia ewayBillCancel';
COMMENT ON COLUMN e_way_bills.cancel_reason IS 'NIC cancel reason: Duplicate | Data Entry Mistake | Order Cancelled | Others';

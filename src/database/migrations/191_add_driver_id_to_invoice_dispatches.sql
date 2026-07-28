-- Link invoice dispatch to drivers master for Driver Details section.
ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_dispatches_driver_id
  ON invoice_dispatches(driver_id)
  WHERE driver_id IS NOT NULL;

COMMENT ON COLUMN invoice_dispatches.driver_id IS 'Optional driver from drivers master (name/phone/DL shown on dispatch)';

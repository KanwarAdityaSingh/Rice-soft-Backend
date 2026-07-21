-- Allow cancelling confirmed invoice dispatches (godown transfer reverse).

ALTER TABLE invoice_dispatches DROP CONSTRAINT IF EXISTS invoice_dispatches_status_check;
ALTER TABLE invoice_dispatches
  ADD CONSTRAINT invoice_dispatches_status_check
  CHECK (status IN ('draft', 'confirmed', 'cancelled'));

COMMENT ON COLUMN invoice_dispatches.status IS
  'draft | confirmed | cancelled (confirmed godown transfers can be reversed to cancelled)';

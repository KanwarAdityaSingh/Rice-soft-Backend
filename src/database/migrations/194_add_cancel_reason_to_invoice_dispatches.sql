-- Reason captured when a confirmed invoice dispatch is cancelled.
ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

COMMENT ON COLUMN invoice_dispatches.cancel_reason IS
  'Required when status becomes cancelled; explains why the dispatch was cancelled';

COMMENT ON COLUMN invoice_dispatches.status IS
  'draft | confirmed | cancelled (confirmed sales or godown-transfer; cancel restores stock)';

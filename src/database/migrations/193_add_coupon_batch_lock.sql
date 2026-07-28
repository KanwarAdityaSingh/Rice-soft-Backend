-- Admin lock: when locked, batch is view-only (no export/print/allot/void/delete).
ALTER TABLE coupon_batches
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coupon_batches_is_locked
  ON coupon_batches (is_locked)
  WHERE is_locked = true;

COMMENT ON COLUMN coupon_batches.is_locked IS
  'When true: block export/print, mark printed, mark allotted, void, delete (view only)';
COMMENT ON COLUMN coupon_batches.locked_at IS 'When the batch was locked';
COMMENT ON COLUMN coupon_batches.locked_by IS 'Admin user who locked the batch';

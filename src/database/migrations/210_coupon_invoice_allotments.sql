-- Migration: Coupon allotment ledger — link coupons to invoice dispatch lines.
--
-- Design: allotment is a transaction (ledger), not a status mutation. One header per
-- invoice dispatch; one line per (invoice_dispatch_line, coupon_batch) pairing so each
-- rice variety on a multi-line invoice tracks its own batch progress independently; one
-- junction row per coupon actually consumed, kept forever (never deleted) so every coupon's
-- full allotment/unlink history is auditable even after it is re-allotted to a later invoice.
--
-- Cancelling (or hard-deleting a confirmed) invoice dispatch unlinks all of its active lines:
-- coupons revert to 'printed' and become available again; the ledger rows stay, marked
-- 'unlinked'/'cancelled', so the event is never lost.

-- =====================================================
-- 1. coupon_allotment_headers — one per invoice dispatch
-- =====================================================

CREATE TABLE IF NOT EXISTS coupon_allotment_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_dispatch_id UUID NOT NULL UNIQUE REFERENCES invoice_dispatches(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled')),
  remarks TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE coupon_allotment_headers IS
  'One per invoice dispatch. Invoice No./Date/Customer are read via invoice_dispatch_id join, not duplicated here.';

-- =====================================================
-- 2. coupon_allotment_lines — one per rice variety x coupon batch
-- =====================================================

CREATE TABLE IF NOT EXISTS coupon_allotment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_allotment_header_id UUID NOT NULL
    REFERENCES coupon_allotment_headers(id) ON DELETE CASCADE,
  invoice_dispatch_line_id UUID NOT NULL
    REFERENCES invoice_dispatch_lines(id) ON DELETE CASCADE,
  coupon_batch_id UUID NOT NULL
    REFERENCES coupon_batches(coupon_batch_id) ON DELETE RESTRICT,
  face_value_paise INTEGER NOT NULL CHECK (face_value_paise > 0),
  -- How many coupons this specific batch assignment was asked to cover (may be less than
  -- the invoice line's total bags if a shortfall is later topped up from a second batch).
  coupons_required INTEGER NOT NULL CHECK (coupons_required > 0),
  -- How many were actually locked from the batch. May be < coupons_required when the batch
  -- ran short (partial allotment is allowed; the shortfall = coupons_required - coupons_allotted).
  coupons_allotted INTEGER NOT NULL DEFAULT 0 CHECK (coupons_allotted >= 0),
  from_serial VARCHAR(64),
  to_serial VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'unlinked')),
  unlinked_at TIMESTAMPTZ,
  unlinked_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT coupon_allotment_lines_allotted_le_required
    CHECK (coupons_allotted <= coupons_required)
);

CREATE INDEX IF NOT EXISTS idx_coupon_allotment_lines_header
  ON coupon_allotment_lines (coupon_allotment_header_id);
CREATE INDEX IF NOT EXISTS idx_coupon_allotment_lines_dispatch_line
  ON coupon_allotment_lines (invoice_dispatch_line_id);
CREATE INDEX IF NOT EXISTS idx_coupon_allotment_lines_batch
  ON coupon_allotment_lines (coupon_batch_id);
-- Fast "is this line short of coupons and still active" lookups for follow-up worklists.
CREATE INDEX IF NOT EXISTS idx_coupon_allotment_lines_shortfall
  ON coupon_allotment_lines (invoice_dispatch_line_id)
  WHERE status = 'active' AND coupons_allotted < coupons_required;

COMMENT ON TABLE coupon_allotment_lines IS
  'One row per (invoice dispatch line, coupon batch). coupons_required/allotted are scoped to this batch assignment only — sum across a dispatch line''s active rows to get its total fulfillment.';
COMMENT ON COLUMN coupon_allotment_lines.coupons_required IS
  'Coupons requested from this batch for this line (may be a top-up amount, not the full invoice line bag count)';
COMMENT ON COLUMN coupon_allotment_lines.coupons_allotted IS
  'Coupons actually locked; < coupons_required means the batch ran short (partial allotment, needs a top-up)';

-- =====================================================
-- 3. coupon_allotment_line_coupons — per-coupon audit trail (never deleted)
-- =====================================================

CREATE TABLE IF NOT EXISTS coupon_allotment_line_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_allotment_line_id UUID NOT NULL
    REFERENCES coupon_allotment_lines(id) ON DELETE CASCADE,
  coupon_id UUID NOT NULL REFERENCES coupons(coupon_id) ON DELETE RESTRICT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unlinked_at TIMESTAMPTZ,
  unlinked_reason TEXT
);

-- A coupon can only be actively linked to one line at a time (re-allotment after an
-- unlink is a brand new row, so the full history for a coupon is always preserved).
CREATE UNIQUE INDEX IF NOT EXISTS uq_coupon_allotment_line_coupons_active
  ON coupon_allotment_line_coupons (coupon_id)
  WHERE unlinked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_coupon_allotment_line_coupons_line
  ON coupon_allotment_line_coupons (coupon_allotment_line_id);
CREATE INDEX IF NOT EXISTS idx_coupon_allotment_line_coupons_coupon
  ON coupon_allotment_line_coupons (coupon_id);
-- First/last-allotted per batch is computed as MIN/MAX(linked_at) over this table joined
-- to coupon_allotment_lines.coupon_batch_id — this index makes that join/aggregate cheap.
CREATE INDEX IF NOT EXISTS idx_coupon_allotment_line_coupons_linked_at
  ON coupon_allotment_line_coupons (linked_at);

COMMENT ON TABLE coupon_allotment_line_coupons IS
  'Insert-only per-coupon ledger. unlinked_at is stamped (never deleted) when the invoice is cancelled or the line is manually unlinked.';

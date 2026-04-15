-- Migration: inward_slip_pass_created_at on inward_slip_lots
-- Description: Nullable copy of linked inward_slip_passes.created_at (via kaanta / LOT-{kaanta_id} naming).

ALTER TABLE inward_slip_lots
ADD COLUMN IF NOT EXISTS inward_slip_pass_created_at TIMESTAMPTZ;

COMMENT ON COLUMN inward_slip_lots.inward_slip_pass_created_at IS
  'created_at of the inward slip pass for this lot (set when created from kaanta; backfilled via kaantas join).';

-- Backfill existing lots linked to a kaanta by convention lot_number = 'LOT-' || kaantas.kaanta_id
UPDATE inward_slip_lots l
SET inward_slip_pass_created_at = isp.created_at
FROM kaantas k
JOIN inward_slip_passes isp ON isp.id = k.inward_slip_pass_id
WHERE l.sauda_id = k.sauda_id
  AND l.godown_id = k.godown_id
  AND l.lot_number = 'LOT-' || k.kaanta_id
  AND l.inward_slip_pass_created_at IS NULL;

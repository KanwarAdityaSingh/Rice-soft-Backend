-- Migration: Add godown_id to payment_advices

ALTER TABLE payment_advices
ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id) ON DELETE RESTRICT;

-- Backfill from sauda / inward slip pass references
UPDATE payment_advices pa
SET godown_id = COALESCE(
  (SELECT s.godown_id FROM saudas s WHERE s.id = pa.sauda_id),
  (SELECT isp.godown_id FROM inward_slip_passes isp WHERE isp.id = pa.inward_slip_pass_id),
  (SELECT id FROM godowns WHERE godown_code = 'MAIN' LIMIT 1)
)
WHERE pa.godown_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_advices_godown_id ON payment_advices(godown_id);

ALTER TABLE payment_advices
ALTER COLUMN godown_id SET NOT NULL;
